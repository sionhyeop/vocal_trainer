"""melody.py — 원곡 오디오에서 멜로디 피치 곡선 자동 추출 (방법 A).

파이프라인:
  yt-dlp 로 원곡 오디오 다운로드 → ffmpeg wav 변환
  → (선택) Demucs 보컬 분리 → librosa.pyin 피치 추출
  → contour [{tMs, midi}] 반환 (분할/노트맵화는 프론트의 contourToNotes 재사용)

★ 주의: 유튜브 오디오 다운로드는 로컬 데모 한정(ToS). 첫 곡은 다운로드+추출로 수십 초 걸린다.
"""

import os
import json
import shutil
import tempfile

import numpy as np
import librosa

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# 추출분을 정적 배포 폴더(frontend/public/notemaps)에도 같이 저장 → git에 잡혀
# 커밋·푸시만 하면 라이브에 자동 포함(수동 배포). 폴더 없거나 실패해도 추출은 성공 유지.
STATIC_NOTEMAPS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "notemaps")
)


def _publish_static(video_id: str, result: dict) -> None:
    try:
        os.makedirs(STATIC_NOTEMAPS_DIR, exist_ok=True)
        with open(os.path.join(STATIC_NOTEMAPS_DIR, f"{video_id}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f)
    except Exception as e:  # 정적 폴더 쓰기 실패가 추출 자체를 깨지 않게
        print(f"[publish_static] {video_id} 정적 배포폴더 저장 실패(무시): {e}")

# 인트로(도입부)가 길어도 본 노래를 담기 위한 추가 스캔 여유(초)와 상한.
# 전체 곡 추출: 프론트가 max_seconds를 크게(예: 600) 보내면 곡 길이(상한 360초)까지 스캔해
# 보컬 시작점부터 끝까지 추출한다.
INTRO_SCAN_SECONDS = 75
MAX_SCAN_SECONDS = 360


def _cache_path(video_id: str) -> str:
    return os.path.join(CACHE_DIR, f"{video_id}.json")


def _download_audio(video_id: str, out_dir: str) -> str:
    """yt-dlp 라이브러리로 bestaudio 다운로드 → wav. 반환: wav 경로."""
    import yt_dlp

    out_tmpl = os.path.join(out_dir, "audio.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_tmpl,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "wav"}
        ],
    }
    url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    wav = os.path.join(out_dir, "audio.wav")
    if not os.path.exists(wav):
        # 확장자 변형 대비
        for f in os.listdir(out_dir):
            if f.endswith(".wav"):
                return os.path.join(out_dir, f)
        raise RuntimeError("다운로드/변환 후 wav를 찾지 못함")
    return wav


def _crop(src: str, dst: str, seconds: int) -> str:
    """ffmpeg로 앞부분 seconds초만 잘라 분리/추출 비용을 제한."""
    import subprocess

    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-t", str(seconds), dst],
        check=True, capture_output=True, timeout=120,
    )
    return dst


def _separate_vocals(wav_path: str, out_dir: str) -> str:
    """Demucs가 설치돼 있으면 보컬 stem 분리, 아니면 원본 그대로 반환."""
    import importlib.util
    import subprocess
    import sys

    if importlib.util.find_spec("demucs") is None:
        return wav_path

    # 2-stem(vocals/no_vocals) 분리, CPU 강제. venv 파이썬으로 모듈 실행.
    try:
        subprocess.run(
            [sys.executable, "-m", "demucs", "-d", "cpu",
             "--two-stems", "vocals", "-o", out_dir, wav_path],
            check=True, capture_output=True, timeout=900,
        )
        # demucs 출력: <out_dir>/<model>/<name>/vocals.wav
        base = os.path.splitext(os.path.basename(wav_path))[0]
        for root, _dirs, files in os.walk(out_dir):
            if os.path.basename(root) == base and "vocals.wav" in files:
                return os.path.join(root, "vocals.wav")
    except Exception:
        pass
    return wav_path


def _hz_to_midi(hz: float) -> float:
    return 69.0 + 12.0 * np.log2(hz / 440.0)


def _fix_octaves(contour: list[dict], win: int = 15) -> list[dict]:
    """국소 중앙값 대비 ~옥타브(10.5~13.5반음) 벗어난 점을 옥타브 보정.
    CREPE/pyin이 가끔 한 옥타브 위/아래로 튀는 오검출(저음 점프 등)을 잡는다."""
    n = len(contour)
    if n < 5:
        return contour
    mids = [c["midi"] for c in contour]
    out = []
    for i in range(n):
        lo, hi = max(0, i - win), min(n, i + win + 1)
        local = sorted(mids[lo:hi])
        med = local[len(local) // 2]
        m = mids[i]
        d = m - med
        if 10.5 <= d <= 13.5:
            m -= 12
        elif -13.5 <= d <= -10.5:
            m += 12
        out.append({"tMs": contour[i]["tMs"], "midi": round(m, 2)})
    return out


def _contour_crepe(y, sr16: int, hop_ms: float, conf_threshold: float) -> list[dict]:
    """CREPE(torchcrepe) 단성 피치 + periodicity(신뢰도) 게이팅. 더 정확/노이즈 강건."""
    import torch
    import torchcrepe

    hop = max(1, int(sr16 * hop_ms / 1000.0))
    audio = torch.tensor(y, dtype=torch.float32).unsqueeze(0)
    pitch, periodicity = torchcrepe.predict(
        audio, sr16, hop,
        fmin=65.0, fmax=1100.0,            # C2~D6 대략 보컬 음역
        model="full", batch_size=512, device="cpu",
        return_periodicity=True,
    )
    # 약한 스무딩(떨림 완화) + 신뢰도 중앙값 필터
    periodicity = torchcrepe.filter.median(periodicity, 3)
    pitch = torchcrepe.filter.mean(pitch, 3)
    p = pitch.squeeze(0).numpy()
    c = periodicity.squeeze(0).numpy()
    contour = []
    for i in range(len(p)):
        hz = float(p[i])
        conf = float(c[i])
        if conf >= conf_threshold and hz > 0 and not np.isnan(hz):
            contour.append({"tMs": int(round(i * hop / sr16 * 1000)), "midi": round(_hz_to_midi(hz), 2)})
    return contour


def _contour_pyin(y, sr: int, hop_ms: float) -> list[dict]:
    """폴백: librosa.pyin."""
    hop_length = max(1, int(sr * hop_ms / 1000.0))
    f0, voiced_flag, _vp = librosa.pyin(
        y, fmin=float(librosa.note_to_hz("C2")), fmax=float(librosa.note_to_hz("C6")),
        sr=sr, hop_length=hop_length,
    )
    times = librosa.times_like(f0, sr=sr, hop_length=hop_length)
    contour = []
    for t, hz, vf in zip(times, f0, voiced_flag):
        if vf and hz and not np.isnan(hz):
            contour.append({"tMs": int(round(float(t) * 1000)), "midi": round(_hz_to_midi(float(hz)), 2)})
    return contour


def _jumpiness(contour: list[dict]) -> float:
    """인접 프레임 간 3반음 초과로 튀는 비율(0~1). 노이즈/다성 보컬일수록 높다."""
    if len(contour) < 5:
        return 1.0
    jumps = sum(
        1 for i in range(1, len(contour)) if abs(contour[i]["midi"] - contour[i - 1]["midi"]) > 3
    )
    return jumps / (len(contour) - 1)


def _contour_basicpitch(wav_path: str, max_seconds: int, hop_ms: float = 20.0) -> list[dict]:
    """Basic Pitch(polyphonic 오디오→노트) → 각 시점의 가장 라우드한 음을 멜로디로.
    오토튠/레이어드/이펙트 보컬(EDM 등) 처럼 단성 피치가 안 잡히는 곡에 강하다."""
    import os
    os.environ.setdefault("BASIC_PITCH_MODEL_TYPE", "onnx")
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    _mo, _midi, notes = predict(wav_path, ICASSP_2022_MODEL_PATH)
    # notes: (start_s, end_s, midi, amplitude, pitch_bends)
    ns = [
        n for n in notes
        if 36 <= n[2] <= 84 and (n[1] - n[0]) >= 0.06 and n[0] < max_seconds
    ]
    if not ns:
        return []
    dur = min(float(max_seconds), max(n[1] for n in ns))
    hop = hop_ms / 1000.0
    contour: list[dict] = []
    t = 0.0
    while t < dur:
        best = None
        for n in ns:
            if n[0] <= t < n[1] and (best is None or n[3] > best[3]):
                best = n
        if best is not None:
            contour.append({"tMs": int(t * 1000), "midi": float(best[2])})
        t += hop
    return contour


def _extract_contour(
    wav_path: str, max_seconds: int, hop_ms: float = 10.0, conf_threshold: float = 0.5, method: str = "auto"
):
    """보컬 wav → 피치 곡선 [{tMs, midi}]. method: auto|crepe|basicpitch.
    auto = CREPE 우선, 결과가 빈약하면(EDM 등) Basic Pitch로 자동 전환. 옥타브 보정.
    반환: (contour, durationSec, extractorName)."""
    y, sr = librosa.load(wav_path, sr=16000, mono=True, duration=max_seconds)
    dur = float(len(y) / sr)

    if method == "basicpitch":
        contour = _contour_basicpitch(wav_path, max_seconds)
        extractor = "basic-pitch"
    else:
        try:
            contour = _contour_crepe(y, sr, hop_ms, conf_threshold)
        except Exception:
            contour = []
        extractor = "torchcrepe(full)"
        # auto: CREPE가 빈약하거나(점 적음) 음이 마구 튀면(EDM/처리된 보컬) Basic Pitch로
        if method == "auto":
            jumpy = _jumpiness(contour)
            if len(contour) < dur * 4 or jumpy > 0.22:
                try:
                    bp = _contour_basicpitch(wav_path, max_seconds)
                    if len(bp) >= 10 and (len(contour) < dur * 4 or _jumpiness(bp) < jumpy):
                        contour, extractor = bp, "basic-pitch(auto)"
                except Exception:
                    pass
        if extractor.startswith("torchcrepe") and len(contour) < 10:
            contour = _contour_pyin(y, sr, 23.0)
            extractor = "librosa.pyin"

    contour = _fix_octaves(contour)
    return contour, dur, extractor


# 추출 진행 상태 (videoId → {stage, pct}). 프론트가 폴링해 진행바 표시.
_progress: dict[str, dict] = {}


def get_progress(video_id: str) -> dict:
    return _progress.get(video_id, {"stage": "대기", "pct": 0})


def load_cached(video_id: str) -> dict | None:
    """캐시에 있으면 반환, 없으면 None (추출 안 함). 사전 생성된 차트곡 자동 로드용."""
    cache = _cache_path(video_id)
    if os.path.exists(cache):
        with open(cache, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def _set_progress(video_id: str, stage: str, pct: int) -> None:
    _progress[video_id] = {"stage": stage, "pct": pct}


def _detect_vocal_start(contour: list[dict], win_ms: int = 1000, min_pts: int = 25) -> int:
    """보컬이 '지속적으로' 시작되는 첫 시점(ms). contour는 유성 프레임만 담기므로,
    win_ms 창 안에 유성 점이 min_pts개 이상 모이는 첫 지점을 노래 시작으로 본다
    (인트로의 단발성 소리/추임새는 건너뜀). 못 찾으면 첫 점 또는 0."""
    if not contour:
        return 0
    ts = [c["tMs"] for c in contour]
    n = len(ts)
    j = 0
    for i in range(n):
        if j < i:
            j = i
        while j < n and ts[j] < ts[i] + win_ms:
            j += 1
        if (j - i) >= min_pts:
            return ts[i]
    return ts[0]


def _compact(contour: list[dict], step: int = 2) -> list:
    """[{tMs,midi}] → 다운샘플(step배) + midi 소수 1자리 + 키 없는 배열 [[tMs, midi]].
    용량 절감용(전송량 ~1/3). 클라이언트(normalizeContour)가 구·신포맷 모두 처리."""
    return [[c["tMs"], round(c["midi"], 1)] for c in contour[::step]]


def extract_notemap(
    video_id: str, max_seconds: int = 120, separate: bool = True, force: bool = False, method: str = "auto"
) -> dict:
    """원곡 → 피치 곡선. 결과 캐시. force=True면 캐시 무시하고 재추출.
    반환: {videoId, contour, extractor, separated, durationMs}."""
    cache = _cache_path(video_id)
    if not force and os.path.exists(cache):
        with open(cache, "r", encoding="utf-8") as f:
            result = json.load(f)
        _publish_static(video_id, result)  # 이미 캐시된 곡도 배포 폴더에 보장
        return result

    tmp = tempfile.mkdtemp(prefix=f"melody_{video_id}_")
    try:
        _set_progress(video_id, "원곡 다운로드 중", 8)
        wav = _download_audio(video_id, tmp)
        # 인트로(MV 도입부)가 길어도 본 노래를 담도록, max_seconds + 인트로 여유만큼 잘라 분석.
        # (보컬 시작점을 찾아 거기서부터 max_seconds초만 노트맵으로 남긴다)
        scan_seconds = min(max_seconds + INTRO_SCAN_SECONDS, MAX_SCAN_SECONDS)
        _set_progress(video_id, "오디오 변환", 22)
        cropped = _crop(wav, os.path.join(tmp, "crop.wav"), scan_seconds)
        used = cropped
        separated = False
        if separate:
            _set_progress(video_id, "보컬 분리 (Demucs)", 35)
            sep = _separate_vocals(cropped, tmp)
            if sep != cropped:
                used = sep
                separated = True
            _set_progress(video_id, "보컬 분리 완료", 68)
        _set_progress(video_id, "음정 추출", 76)
        contour, _dur, extractor = _extract_contour(used, scan_seconds, method=method)

        # ① 보컬 시작점 감지 → 그 지점부터 max_seconds초만 노트맵으로 사용(인트로 제거)
        vocal_start_ms = _detect_vocal_start(contour)
        end_ms = vocal_start_ms + max_seconds * 1000
        trimmed = [c for c in contour if vocal_start_ms <= c["tMs"] < end_ms]
        if trimmed:
            contour = trimmed
        span_ms = (contour[-1]["tMs"] - vocal_start_ms) if contour else 0

        _set_progress(video_id, "마무리", 96)
        result = {
            "videoId": video_id,
            "contour": _compact(contour),  # 다운샘플+소수1자리+배열 (용량 절감)
            "extractor": extractor,
            "separated": separated,
            "durationMs": int(span_ms),
            "vocalStartMs": int(vocal_start_ms),  # ② 프론트가 재생을 여기로 점프
        }
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(result, f)
        _publish_static(video_id, result)  # 추출 즉시 배포 폴더에도 — 커밋·푸시만 하면 라이브 반영
        _set_progress(video_id, "완료", 100)
        return result
    except Exception:
        _set_progress(video_id, "실패", 0)
        raise
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
