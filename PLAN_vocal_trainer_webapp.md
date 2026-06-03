# 기획안 — 보컬 트레이닝 웹앱 (노래방 "퍼펙트 스코어" 스타일)

> **대상**: 이 앱을 실제로 짜는 Claude Code 에이전트.
> **목표**: 브라우저에서 도는 보컬 트레이닝 웹앱. 노래방의 "퍼펙트 스코어"(실시간 음정 리본 + 가사 하이라이트 + 점수/판정)의 **기능·UI를 최대한 비슷하게** 재현하되, 보컬 연습에 실제로 도움 되는 디테일을 더한다.
> **출처 문서**: 기존 Flutter 핸드오프(`HANDOFF.md`), 기본 아이디어 가이드, 검색·가사 이식 가이드(`FEATURE_GUIDE_search_and_lyrics.md`). 이 셋을 웹앱으로 통합한 게 본 문서다.
> **반드시 살릴 것**: ① 유튜브 곡 검색 ② lrclib 싱크 가사 가져오기. 이 두 로직(원리 + 함정)은 §5, §6에 그대로 이식했다.

---

## 0. 한 장 요약 (TL;DR)

- **무엇**: 노래 검색 → 유튜브 MR 재생 → 실시간 피치 채점 → 점수/등급/약점/AI 코칭. + 음정 트레이닝 미니 모드 3종.
- **플랫폼**: 웹앱 (데스크톱 + 모바일 웹). 오디오는 **전부 브라우저 안에서**(on-device) 처리, 마이크 PCM은 서버로 안 나간다.
- **스택**: React + Vite + TypeScript / Web Audio + pitchy / YouTube IFrame Player / FastAPI(가사 프록시 + AI 코치) / 상태 zustand.
- **차별점**: 노래방 퍼펙트 스코어 UI 그대로 + (음정 안정성·호흡·음역 활용) 보컬 분석 + Claude 한국어 코칭.
- **핵심 결정 사항**(§14): 유튜브 임의 곡엔 "목표 멜로디"가 없다 → 정밀 채점을 어디까지 할지(Tier A/B/C) 먼저 정한다.

---

## 1. 제품 비전 & 범위

### 비전
노래방에서 한 곡 부르면 위에 음정 막대가 흐르고, 가사가 하이라이트되고, 끝나면 점수가 뜨는 그 경험 — 그걸 웹에서 재현한다. 단순 점수 놀이를 넘어 "어디서 음이 흔들렸는지, 호흡이 어디서 끊겼는지"를 보여주고 Claude가 한국어로 짧게 코칭해준다.

### 범위 (이번 버전)
**한다**
- 유튜브 검색 → MR 영상 임베드 재생
- lrclib 싱크 가사 표시 + 재생시간 동기 하이라이트
- 실시간 피치 감지 → 노래방식 피치 리본 시각화 + 점수/판정
- 결과 화면(점수·등급·약점 구간·호흡 요약 + AI 코칭)
- 트레이닝 미니 모드 3종(아래 §2.1의 1~3)

**안 한다 (후속)**
- 정식 회원/소셜/랭킹(로컬 저장으로 시작, Firebase는 선택)
- 정밀 멜로디 자동 추출(Tier C, §2.2) — 후속 단계
- 네이티브 앱 패키징

### 비기능 요구
- 마이크 입력 레이턴시 체감 최소화(유선 이어폰 권장 안내).
- 가사·검색은 네트워크/방화벽 환경을 타므로 **백엔드 프록시 우선 + 브라우저 fallback** 2단 구조(§6).
- 백엔드/Firebase 없이도 게스트로 일단 돈다(local-first, §8).

---

## 2. 기능 명세

### 2.1 모드 구성 (기본 아이디어 가이드 반영)

기본 아이디어 가이드의 4개를 그대로 모드로 매핑한다. 1~3은 가벼운 트레이닝 모드, 4가 메인(퍼펙트 스코어).

**① 음정 확인 + 목표음 설정**
- 마이크로 내 음정을 실시간 그래프로 표시(현재 Hz/MIDI/음이름).
- 목표음을 설정하면 그래프 위에 가이드 라인으로 표시 → 거기에 맞추는 연습.
- 녹음/재생(녹음은 브라우저 `MediaRecorder`, 로컬에서만).
- 채점: 목표음이 명확하므로 cent 편차 기반 정밀 채점 가능(§4.3).

**② 음 맞히기 (이어 트레이닝)**
- (a) 음만 듣고 맞히기: 무작위 음 재생 → 사용자가 음이름 선택/노래로 맞히기.
- (b) 내 목소리 듣고 맞히기: 사용자가 낸 음을 분석해 음이름 제시.
- 음 생성은 Web Audio `OscillatorNode`(사인/삼각). 정답 판정은 cent 허용오차 내.

**③ 내 목소리 다른 음으로 듣기**
- 수집된 사용자 음역대 내에서, 녹음한 목소리를 다른 음정으로 피치 시프트해 들려줌.
- 구현: 피치 시프트(`AudioWorklet` 기반 PSOLA/그래뉼러, 또는 `soundtouchjs` 같은 라이브러리). MVP는 단순 재생속도 변환이 아니라 **피치만** 바꾸는 걸 목표(템포 유지). 어려우면 후속.

**④ 노래 따라부르기 (★ 메인 — 퍼펙트 스코어)**
- 곡 검색 → MR + 가사 → 따라 부르며 실시간 채점 → 결과/코칭. (상세 §2.2)

> 1~3은 "목표음이 시스템이 정한 것"이라 채점이 정확하고 구현이 쉽다. 먼저 만들면 오디오 파이프라인(§4) 검증용으로도 좋다.

### 2.2 노래 따라부르기 — 퍼펙트 스코어 UX (상세)

#### 플로우
```
[검색] 곡 입력 → 유튜브 MR 결과 리스트
   │  (영상 제목 → titleParser → 곡명/아티스트 추출)
[선택] 영상 클릭
   │  ├ MR: YouTube IFrame 로 임베드
   │  └ 가사: lrclib 백엔드 프록시로 싱크 가사 조회(§6)
[준비] 3-2-1 카운트다운 + amplitude(RMS) 바로 마이크 살아있음 즉시 피드백
[가창] MR 재생시간에 맞춰: 피치 리본 흐름 + 가사 하이라이트 + 실시간 점수/판정/콤보
[결과] 최종 점수·등급(S/A/B/C) + 약점 구간 Top3 + 호흡 요약 + Claude 코칭
```

#### 화면 구성 (노래방 레퍼런스)
- **상단 — 피치 리본(Canvas)**: 노래방처럼 음정 막대가 흐른다. y축 = 반음 레인, x축 = 시간(오른쪽에서 "now 라인"으로 흘러옴). 목표 노트는 블록으로, 내 실시간 피치는 점/선으로 트래킹. 목표에 들어가면 블록이 채워지는 연출.
- **중앙 — MR 영상**: YouTube IFrame. (노래방 감성 원하면 영상 위에 반투명 오버레이로 리본/가사를 얹어도 됨.)
- **하단 — 가사 뷰**: 현재 라인 강조 + 다음 라인 미리보기. 가능하면 단어/음절 단위 진행 하이라이트(가라오케 wipe).
- **HUD — 점수/콤보/판정**: 실시간 누적 점수, 콤보 카운트, 노트별 판정 토스트(Perfect/Great/Good/Miss).

#### 실시간 판정 로직 (Tier A 기준)
- 목표 노트가 활성인 구간 동안 내 피치의 cent 편차를 누적 → 노트 종료 시 평균 편차 + 커버리지(목표 구간 중 유성음으로 채운 비율)로 판정.
- 판정 임계(튜닝값, 기본 제안): Perfect ≤ 25 cent, Great ≤ 50, Good ≤ 100, 그 이상/무음 = Miss.
- 콤보: Good 이상 연속. Miss 시 리셋. 콤보 보너스 점수.

#### ★ 목표 멜로디(레퍼런스 피치) 전략 — 3 Tier
유튜브 임의 곡엔 노래방 같은 노트맵이 **없다**. 이게 이 앱의 가장 큰 설계 분기점이다(§14에서 최종 결정).

| Tier | 대상 | 레퍼런스 출처 | 채점 | UI |
|---|---|---|---|---|
| **A 정밀** | 큐레이션 곡 | `assets/songs/<id>.json` 수작업 노트맵(startMs/endMs/midiNote/lyric) | 진짜 음정 정확도(노래방식) | 목표 블록 + 내 피치 트래킹 |
| **B 표현** | 유튜브 임의 곡 | 없음 | 음정 안정성·유성음 비율·호흡·음역 활용도(§4.3) | 목표 블록 없이 내 피치 트레일 + (선택) 조성/스케일 가이드 레인 |
| **C 자동추출**(후속) | 임의 곡 | 원곡 보컬에서 피치 컨투어 오프라인 추출→캐시 | A에 준하는 정확도 | A와 동일 |

**권장 MVP**: B를 기본으로 "퍼펙트 스코어 UI" 자체는 똑같이 보여주되 점수는 표현/안정성 기반. + A를 위한 노트맵 포맷(아래)을 곡 몇 개로 시범 적용해 "정밀 채점" 데모도 가능하게.

**노트맵 포맷(Tier A/C 공통, Flutter doc 이식)**
```json
{
  "id": "arirang",
  "title": "아리랑",
  "license": "public-domain",
  "youtubeId": "옵션(임베드용)",
  "notes": [
    { "startMs": 0, "endMs": 800, "midiNote": 60, "lyric": "아" },
    { "startMs": 800, "endMs": 1600, "midiNote": 62, "lyric": "리" }
  ]
}
```

---

## 3. 기술 스택 (Flutter → 웹 전환 매핑)

| 영역 | 웹 선택 | 기존 Flutter | 비고 |
|---|---|---|---|
| 프레임워크 | **React + Vite + TypeScript** | Flutter | 검색·가사 가이드가 이미 Vite 기준 |
| 상태관리 | **zustand** | Riverpod | 가사 가이드 예시도 zustand. 가벼움 |
| 라우팅 | **react-router 6** | go_router | 경로 파라미터(videoId/sessionId) |
| 데이터모델 | **TS 타입 + zod**(런타임 검증) | freezed | API 응답 검증에 zod |
| 마이크 입력 | **getUserMedia + Web Audio** | record 6.2 | §4.1 제약 주의 |
| 피치 감지 | **pitchy**(McLeod MPM) | pitch_detector_dart(YIN) | 파티의 캡스톤에서 검증된 라이브러리 |
| MR 재생 | **YouTube IFrame Player API** | just_audio | 검색=Data API / 재생=IFrame, 둘은 다른 API |
| 시각화 | **Canvas 2D 직접 렌더**(피치 리본) | fl_chart/CustomPaint | 흐르는 리본은 Canvas가 자연스러움 |
| 가사 백엔드 | **FastAPI + curl_cffi**(§6) | Cloud Functions | DoH+TLS 위장 우회가 핵심 |
| AI 코치 | **FastAPI → Anthropic SDK**(haiku) | Cloud Function 동일 | 가사 백엔드에 통합 |
| 로컬저장 | **localStorage / IndexedDB** | shared_preferences | 프로필·세션 오프라인 fallback |
| 인증/동기(선택) | **Firebase Auth/Firestore** | Firebase | 게스트 모드 우선, 나중에 추가 |

**오디오 파이프라인(웹)**: `getUserMedia` → `AudioContext` → `AnalyserNode`(getFloatTimeDomainData, rAF 루프) → **pitchy** → `{pitchHz, clarity}` → MIDI/cents 변환 → 채점 + 리본 렌더. **PCM은 브라우저를 안 떠난다.**

---

## 4. 오디오 파이프라인 (Web Audio) — 함정 포함

### 4.1 마이크 캡처 제약 (★ Flutter doc에서 그대로 가져온 교훈)
`getUserMedia` 제약을 이렇게 둔다:
```ts
navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,  // ★ 켜면 본인 노랫소리를 에코로 오인해 잘라먹음
    noiseSuppression: false,  // ★ 켜면 지속음(롱톤)을 노이즈로 깎음
    autoGainControl: true,    // 작은 소리도 잡되, 곡 채점 일관성 위해선 끄는 것도 고려
  }
})
```
- **에코캔슬/노이즈서프레스는 끈다.** 보컬 분석엔 독이다. (노래방 같은 채점 망가짐)
- **레이턴시**: 데모/사용 시 **유선 이어폰 권장**. 블루투스/스피커는 마이크가 MR을 되받아(블리드) 점수가 망가진다 → UI에 1회 안내.
- 모바일 사파리/크롬은 사용자 제스처 후에만 `AudioContext` resume 가능 → "시작" 버튼에서 `audioContext.resume()`.

### 4.2 피치 감지
- **pitchy** `PitchDetector.forFloat32Array(bufferSize)`. bufferSize는 2048 권장(가이드의 16kHz/2048 튜닝 철학 유지하되, 웹 `AudioContext.sampleRate`는 보통 44.1/48kHz이므로 **MIDI 변환 시 실제 sampleRate를 써야 함**. 샘플레이트 하드코딩 금지 — Flutter doc의 "샘플레이트 바꾸면 MIDI 다 틀어짐" 교훈).
- `clarity`(0~1)로 유성음/무성음 게이트: `clarity < 0.8`이면 신뢰 안 함(무음/자음 구간).
- 변환:
```ts
const midi = 69 + 12 * Math.log2(hz / 440)
const nearest = Math.round(midi)
const cents = (midi - nearest) * 100   // 가장 가까운 반음 대비 편차
// 목표음 대비 편차: centsFromTarget = (midi - targetMidi) * 100
```
- 입력 없을 때를 위해 **amplitude(RMS) 바**를 항상 표시(카운트다운/대기 화면) → "마이크 죽었나?" 오해 방지(Flutter doc 교훈).

### 4.3 채점 (튜닝값 — 함부로 바꾸면 체감 달라짐)
- **음정 점수**: `noteScore = max(0, 100 - |centsDeviation| * 0.5)` → 50 cent=50점, 100 cent=0점.
- **confidence 가중**: `clarity`(유성음 신뢰도)로 가중. 무성/무음 구간은 점수 미반영.
- **등급**: S(90+) / A(80+) / B(70+) / C(<70).
- **약점 구간 Top 3**: 구간별 평균 편차가 큰 곳 추출(가사 라인/노트 단위).
- **호흡 분석**(FFT 아닌 근사 — 프로덕션은 FFT 권장):
  - HNR(autocorrelation), spectral centroid, ZCR로 → `stability`(음 안정성) / `breathyRatio`(바람 새는 비율) / `longestPhrase`(한 호흡 최장 구간).
- **Tier B(임의 곡)**: 목표 멜로디가 없으니 음정 점수 대신 `stability + voicingRatio + breath + 음역활용도`를 가중 합산해 100점화. UI는 동일하게 점수/등급으로 표시.

### 4.4 시각화 (피치 리본 — Canvas)
- 좌표계: x=시간(now 라인 고정, 노트가 오른쪽→왼쪽으로 흐름 또는 위에서 흘러옴 — 노래방 스타일대로), y=반음 레인.
- 60fps `requestAnimationFrame`로 그리고, 가사·점수는 `player.getCurrentTime()`(IFrame) 기준 시간으로 동기.
- 성능: 라인 인덱스 탐색은 이진 탐색(`findLineIndex`, §6.6)이라 매 프레임 호출해도 가볍다.

---

## 5. ★ 기능 ① 곡 검색 (YouTube Data API) — 그대로 살릴 핵심 로직

> 출처: `FEATURE_GUIDE_search_and_lyrics.md §2`. **검색=YouTube Data API v3(키 필요)**, **재생=IFrame Player API(키 불필요)** — 둘은 다른 API다. 헷갈리지 말 것.

### 5.1 원리
- `search.list` 엔드포인트를 그냥 HTTP GET.
- 노래방 용도라 검색어 뒤에 **`MR Instrumental`** 을 붙여 반주 영상이 우선 나오게 유도.
- **`videoEmbeddable=true` 필수** — 안 걸면 "소유자가 외부 재생 차단"한 영상이 섞여 IFrame에서 까만 화면.

### 5.2 핵심 코드 (그대로 이식, TS화)
```ts
async function searchYouTube(query: string, apiKey: string) {
  // 개선: 이미 MR/Inst 포함 시 중복 삽입 방지 (가이드 §2.3-5 교훈)
  const hasMr = /\b(mr|inst|instrumental|반주)\b/i.test(query)
  const q = encodeURIComponent(hasMr ? query : `${query} MR Instrumental`)
  const url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&type=video&videoEmbeddable=true&maxResults=12&q=${q}&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`YouTube API ${res.status}`)
  const data = await res.json()
  return (data.items ?? []).map((item: any) => ({
    videoId: item.id.videoId,
    title: decodeEntities(item.snippet.title),  // ⚠ 반드시 디코딩
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
  }))
}

// YouTube 제목은 &amp; &#39; &quot; 같은 엔티티로 옴 → textarea 트릭으로 디코딩
function decodeEntities(str: string) {
  if (!str) return ''
  const el = document.createElement('textarea')
  el.innerHTML = str
  return el.value
}
```

### 5.3 시행착오 (다시 밟지 말 것)
1. **제목이 HTML 엔티티로 온다** → 표시 전 `decodeEntities()`. 안 풀면 가독성도, **가사 검색 매칭 정확도도** 떨어진다.
2. **`videoEmbeddable=true`는 옵션 아니라 필수** — 빠지면 검색은 되는데 재생이 까만 화면.
3. **403의 두 원인**: (a) 일일 쿼터 소진, (b) 키 제한(리퍼러/IP). 메시지가 같아 응답 본문의 `reason`을 봐야 구분.
4. **쿼터 계산**: 검색 1회 = 100 유닛, 기본 일일 10,000 → 하루 ~100회. `maxResults=12`가 체감 최적.
5. **키 노출 주의**: Vite는 `VITE_` 접두사 변수만 클라에 노출. **YouTube 키가 번들에 박힌다** → 공개 배포 시 키에 HTTP 리퍼러 제한을 걸거나 검색도 백엔드로 프록시. (MVP/로컬은 클라 직접 호출 허용.)

---

## 6. ★ 기능 ② 가사 가져오기 (lrclib + 백엔드 프록시) — 그대로 살릴 핵심 로직

> 출처: `FEATURE_GUIDE_search_and_lyrics.md §3,4,7`. **이 기능의 진짜 난이도는 가사 파싱이 아니라 lrclib에 "도달하는 것"**(DNS 필터·Cloudflare WAF). 해법이 백엔드 프록시 + DoH + curl_cffi Chrome 위장이다.

### 6.1 2단 소스 전략
```
useLyrics()
 ├─ VITE_LYRICS_API 설정됨 → 백엔드 /api/lyrics 호출
 │     └─ 네트워크 완전 실패 시 → 브라우저 직접 lrclib fallback
 └─ 설정 안 됨 → 처음부터 브라우저 직접 lrclib
```
백엔드 경로가 CORS·광고차단·DNS 필터·WAF를 서버가 대신 흡수한다. 직접 호출은 안전망(환경 리스크 감수).

### 6.2 ★ 백엔드 핵심 — DNS 우회 & Cloudflare 통과 (`backend/lyrics.py`)
이 프로젝트에서 가장 비싸게 얻은 노하우. **원리 3단계:**
1. **DoH로 진짜 IP 조회**: 로컬 DNS가 `lrclib.net`을 막아도 `https://8.8.8.8/resolve?name=lrclib.net&type=A`로 A 레코드 획득(HTTPS라 DNS 필터가 못 봄).
2. **`curl_cffi`의 `CURLOPT_RESOLVE`로 그 IP에 직결**: `lrclib.net:443:<IP>` 매핑. **SNI/Host는 원 도메인 유지**(안 그러면 Cloudflare가 어느 사이트인지 몰라 거절).
3. **`impersonate="chrome"`으로 TLS 지문 위장**: Cloudflare는 JA3 지문으로 봇을 가린다. `requests`/`httpx`로는 **못 뚫는다** → curl_cffi가 requirements에 박힌 이유.

```python
from curl_cffi import requests as ccrequests
from curl_cffi import CurlOpt

LRCLIB_HOST = "lrclib.net"
DOH_RESOLVERS = [
    "https://8.8.8.8/resolve",
    "https://dns.google/resolve",
    "https://cloudflare-dns.com/dns-query",
]
_ip_cache = {}

def _resolve_via_doh(hostname):
    if hostname in _ip_cache: return _ip_cache[hostname]
    for url in DOH_RESOLVERS:
        try:
            r = ccrequests.get(url, params={"name": hostname, "type": "A"},
                headers={"accept": "application/dns-json"},
                impersonate="chrome", timeout=8, verify=False)
            if r.status_code != 200: continue
            ips = [a["data"] for a in (r.json().get("Answer") or [])
                   if a.get("type") == 1 and "data" in a]
            if ips:
                _ip_cache[hostname] = ips
                return ips
        except Exception:
            continue
    return []

def _lrclib_get(path, params):
    ips = _resolve_via_doh(LRCLIB_HOST)
    if not ips: raise RuntimeError("could not resolve via DoH")
    for ip in ips:
        try:
            r = ccrequests.get(f"https://{LRCLIB_HOST}/api{path}",
                params=params, impersonate="chrome", timeout=15, verify=False,
                headers={"Accept": "application/json",
                         "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"},
                curl_options={CurlOpt.RESOLVE: [f"{LRCLIB_HOST}:443:{ip}"]})
            if r.status_code == 404: return None
            if r.status_code != 200: continue
            return r.json()
        except Exception:
            continue
    return None
```

### 6.3 FastAPI 래퍼 (`backend/main.py`)
```python
app = FastAPI(title="VocalTrainer Lyrics API")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_methods=["GET"], allow_headers=["*"])  # 개발용. 배포 시 출처 제한.

@app.get("/api/health")
def health(): return {"ok": True}

@app.get("/api/lyrics")
def get_lyrics(track: str = Query(..., min_length=1), artist: str | None = Query(None)):
    result = search_lyrics(track=track, artist=artist)
    if result is None:
        raise HTTPException(status_code=404, detail="Lyrics not found")
    return result   # {"synced": str|None, "plain": str|None, "matched_*":..., "query":...}
```
실행(가이드 §7 교훈 반영: `pip` 없을 수 있고 시스템 파이썬이 너무 최신이면 curl_cffi 휠 없음 → **uv + Python 3.12 고정**):
```bash
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn main:app --port 8000 --host 127.0.0.1
curl "http://127.0.0.1:8000/api/lyrics?track=Dynamite&artist=BTS"   # 검증
```
`requirements.txt`: `fastapi>=0.110`, `uvicorn[standard]>=0.29`, `curl_cffi>=0.7`, `anthropic`(AI 코치용, §7).

### 6.4 다중 파라미터 조합 (넓은→좁은, 양 경로 공통)
lrclib 매칭은 입력이 조금만 달라도 빗나간다. 순서대로 시도하고 첫 히트 채택:
```
1) {track_name, artist_name}    # 가장 정확
2) {track_name}                 # 아티스트 빼고
3) {q: "artist track"}          # 자유 텍스트 통검색
(+ titleParser의 alternate(곡/아티스트 뒤바뀜 대비) 조합도 추가 시도)
```
결과 중 **`syncedLyrics`(싱크 가사) 있는 항목 최우선**:
```ts
function pickBest(results) {
  return results.find(d => d.syncedLyrics) ?? results[0] ?? null
}
```

### 6.5 프론트 훅 `useLyrics` (요지)
- `status`: `'idle' | 'loading' | 'ok' | 'notfound' | 'error'`.
- `VITE_LYRICS_API` 있으면 백엔드 우선, 네트워크 완전 실패 시 lrclib fallback.
- **abort 플래그**로 경쟁 조건(빠른 재검색 시 늦은 응답이 화면 덮어쓰기) 방지.
- 의존성 배열에 `trackName, artistName, alternate?.trackName, alternate?.artistName, freeText`까지 **원시값으로** 넣는다(객체 자체 넣으면 매 렌더 새 참조 → 무한 루프).
- 반환: `{ lines, plain, status, matched, errorMessage, source }`.

### 6.6 LRC 파서 (`lib/lrcParser.ts`, 그대로 이식)
```ts
// "[00:12.00][01:30.00]가사" → [{time:12,text:'가사'},{time:90,text:'가사'}]
const TIME_RE = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g
export function parseLrc(lrcText: string) { /* 한 줄 다중 타임스탬프 펼치고 time 오름차순 정렬 */ }
// 현재 재생시간(초)의 라인 인덱스 — 이진 탐색 O(log n)
export function findLineIndex(lines, currentTime: number) { /* lines[mid].time <= currentTime 최대 인덱스 */ }
```

### 6.7 검색↔가사 접점 — 제목 파서 (`lib/titleParser.ts`)
```ts
parseVideoTitle("아이유(IU) - 밤편지 (Through the Night) MR [가사/반주]")
// → { trackName:"밤편지", artistName:"아이유", alternate:{ trackName:"아이유", artistName:"밤편지" } }
```
동작: ① 엔티티 디코딩 → ② 괄호류 `[]()【】〈〉《》` 통째 제거 → ③ 노이즈 단어 제거(`MR, Inst, Karaoke, 반주, 가사, Official, MV, 4K…`) → ④ 구분자(`- – — −`) 분리 → ⑤ `좌-우`를 `artist-track`으로 보되 **뒤바뀜 대비 `alternate`도 반환**.
- MR 제목은 포맷이 제각각이라 "정답 1개"로 못 잡는다 → **(주추정 + alternate) 2개를 가사 검색에서 둘 다 시도** → 매칭 성공률 급상승.

### 6.8 시행착오 (다시 밟지 말 것)
1. **브라우저 직접 호출은 환경을 심하게 탄다**: CORS는 보통 열려있지만 광고차단(uBlock)·학교/회사 DNS 필터(OpenDNS)·Cloudflare WAF가 깨뜨림 → 백엔드 프록시가 정답, 직접은 fallback만.
2. **`requests`/`httpx`로 Cloudflare 못 뚫음** → `curl_cffi` `impersonate="chrome"`만 통과.
3. **DNS 필터는 DoH로 우회**, IP는 `CURLOPT_RESOLVE`로 직결하되 **SNI/Host는 원 도메인 유지**.
4. **`verify=False` 이유**: IP 직결이라 검증 체인 꼬임 회피. SNI로 올바른 호스트에 붙으니 실위험 낮음(운영은 핀닝 권장).
5. **문서보다 코드가 진실**: 기존 README엔 `syncedlyrics` 라이브러리를 쓴다 했지만 실제론 curl_cffi 직접 구현으로 갈아탔다. **이식 시 코드(`lyrics.py`)를 신뢰.**
6. **싱크 가사 우선순위**: plain-only가 먼저 오는 경우 많음 → `pickBest`로 synced 명시 선택해야 하이라이트가 산다.
7. **한 줄 다중 타임스탬프**(`[00:12][00:40]후렴`): 파서가 스탬프마다 펼치고 시간순 재정렬.
8. **경쟁 조건**: 빠른 재검색 시 abort 플래그로 늦은 응답 차단.
9. **404는 에러 아님 = "없음"**: `notfound`로 구분해 "서버 오류"와 "이 곡 가사 없음"을 다르게 안내.

### 6.9 실행환경 함정 (가이드 §7)
1. **rollup 네이티브 모듈 누락**(`Cannot find module @rollup/rollup-linux-x64-gnu`): node_modules가 다른 OS에서 설치돼 넘어오면 발생 → 그 플랫폼에서 `rm -rf node_modules package-lock.json && npm install`.
2. **`pip` 부재**(WSL 등): `uv venv --python 3.12` + `uv pip install`. 시스템 파이썬이 3.14처럼 최신이면 curl_cffi 휠 없으니 **3.12 고정**.
3. **포트 충돌**: Vite 5173 점유 시 5174로 뜸 → 프론트 주소 하드코딩 금지.
4. **백엔드 첫 요청 지연**: curl_cffi/DoH 초기화로 첫 가사 콜이 몇 초 걸림(이후 `_ip_cache`로 빨라짐). 헬스 200이어도 첫 콜은 여유.

---

## 7. AI 코칭 (선택 모듈, FastAPI에 통합)

> 출처: `HANDOFF.md`의 Cloud Function 패턴을 FastAPI 엔드포인트로 이식.

- 엔드포인트 `POST /api/coach`: 입력은 **점수·약점구간·호흡 지표 등 파생값(텍스트/숫자)만**. **오디오는 절대 안 보낸다.**
- 모델 `claude-haiku-4-5`(비용/지연). **프롬프트 캐싱**: system 프롬프트에 `cache_control: {type:'ephemeral'}`.
- **Rate limit**: 사용자별 일일 카운트(로컬 우선, 백엔드는 메모리/파일 또는 Firestore). 초과 시 `resource-exhausted` → 클라가 한국어로 매핑.
- **응답 JSON 강제하되 깨질 수 있음** → 정규식 `/\{[\s\S]*\}/`로 추출 후 parse, 실패 시 raw text fallback.
- **에러코드별 한국어 매핑 필수**: `invalid x-api-key`(키 문제) / `unauthenticated`(인증) / `resource-exhausted`(횟수 초과) 등 케이스별 안내.
- 키 관리: 코드에 박지 말고 백엔드 환경변수 `ANTHROPIC_API_KEY`(서버 사이드라 클라 노출 없음).

코칭 프롬프트 방향: "이번 곡의 점수/약점구간/호흡 요약을 받아, 격려 한 줄 + 가장 효과 큰 연습 팁 1~2개를 한국어로 짧게". 길게 늘어놓지 말 것.

---

## 8. 데이터 / 저장 (local-first)

- **게스트 모드 우선**: Firebase/백엔드 없이도 앱이 돈다(HANDOFF의 offline-safe 패턴 계승).
- 세션 결과·프로필·음역대 → 우선 **localStorage / IndexedDB**.
- 음역대 저장 위치 **단일화**(기존 SharedPrefs vs Firestore 혼재가 문제였음 → 웹에선 로컬 단일 소스, 동기화는 나중에).
- (후속) Firebase Auth/Firestore로 기기 간 동기. 모든 repository는 `service.available` 체크 후 호출하는 패턴 유지.

---

## 9. UI/UX 디테일 (퍼펙트 스코어 비주얼)

- **카운트다운**: 가창 시작 3-2-1 + amplitude(RMS) 바 → 입력 즉시 피드백("마이크 죽었나" 오해 방지).
- **피치 리본**: 목표 블록 채워지는 글로우, 콤보 시 색 강조, Miss 시 흔들림. 노래방 느낌의 네온/그라데이션.
- **판정 토스트**: Perfect/Great/Good/Miss를 노트 종료 시 팝.
- **가사 wipe**: 현재 라인 강조 + 음절 진행 하이라이트(가능하면).
- **결과 화면**: 큰 점수 카운트업 애니메이션 + 등급 도장(S/A/B/C) + 약점 구간(가사 라인 클릭 시 해당 구간 재생) + 호흡 요약 + AI 코칭 카드.
- **뒤로가기**: 즉시 화면 전환하고 마이크/오디오 정리는 백그라운드(전환 버벅임 방지). 웹은 라우트 이탈 시 `AudioContext`/스트림 `track.stop()` cleanup 확실히.
- **반응형**: 데스크톱은 리본 상단+영상 중앙, 모바일은 세로 스택. 모바일 사파리 오디오 제스처 정책 주의(§4.1).

---

## 10. 디렉토리 구조 제안

```
frontend/
  src/
    app/            router · providers · theme
    audio/          micCapture · pitchDetector(pitchy) · scorer · breathAnalyzer · oscillator(트레이닝용)
    features/
      search/       SearchPage · searchYouTube · decodeEntities
      sing/         SingScreen · PitchRibbon(canvas) · LyricView · ScoreHUD · useYouTubePlayer
      result/       ResultScreen · grade · weakSections · CoachCard
      training/     pitchCheck(①) · earTraining(②) · voiceShift(③)
      history/      HistoryScreen · 세션 삭제/상세
      profile/      음역대 · 설정
    hooks/          useLyrics · useMicPitch · useYouTubePlayer
    lib/            lrcParser · titleParser · midi(hz↔midi↔cents) · youtube · storage
    store/          zustand 스토어
    components/     공용 UI
  .env              VITE_YOUTUBE_API_KEY · VITE_LYRICS_API
backend/
  main.py           FastAPI: /api/health · /api/lyrics · /api/coach
  lyrics.py         ★ lrclib DoH + curl_cffi (README보다 이게 진실)
  coach.py          Anthropic 프록시(선택)
  requirements.txt
assets/songs/       *.json 노트맵 (Tier A 큐레이션 곡: 아리랑 + 워밍업 + α)
```

---

## 11. 개발 순서 / 마일스톤

- **M0 — 스캐폴드**: Vite+React+TS, 라우팅, zustand, `.env`, FastAPI 헬스(`/api/health` 200). 빌드/실행 확인.
- **M1 — 검색 + 가사 + 재생** (★ 먼저, 핵심 로직 검증): `searchYouTube` → 결과 리스트 → IFrame 재생 + `useLyrics`로 싱크 가사 하이라이트. §5,§6 함정 전부 적용. **여기서 백엔드 가사 프록시까지 동작시켜 둔다.**
- **M2 — 오디오/피치**: getUserMedia 제약(§4.1) + pitchy + MIDI/cents + amplitude 바 + 피치 리본(Canvas). 트레이닝 모드 ①로 검증.
- **M3 — 채점**: scorer(§4.3) + 실시간 판정/콤보(Tier B 기본). 가창 화면 완성.
- **M4 — 결과 + AI 코칭**: 결과 화면 + breathAnalyzer + `/api/coach`(선택).
- **M5 — 트레이닝 ②③ + 히스토리/프로필**: 이어트레이닝, 보이스 시프트, 세션 삭제/상세(기존 P0 미완성 항목), 프로필 편집.
- **M6 — 다듬기**: Tier A 노트맵 곡 시범 적용(정밀 채점 데모), 모바일 반응형, AI 코치 지수 백오프 재시도.

---

## 12. 환경변수 / 셋업 / 검증

`.env`(Vite):
```bash
VITE_YOUTUBE_API_KEY=발급키        # 필수(검색). Google Cloud Console > YouTube Data API v3
VITE_LYRICS_API=http://127.0.0.1:8000   # 선택. 비우면 브라우저 직접 lrclib(환경 리스크)
```
백엔드: `ANTHROPIC_API_KEY`(서버 환경변수, AI 코치용).

통합 검증:
```bash
curl http://127.0.0.1:8000/api/health                          # {"ok": true}
curl "http://127.0.0.1:8000/api/lyrics?track=Dynamite&artist=BTS"   # synced 채워지면 성공
# 프론트: DevTools Network 에서 youtube/v3/search 200 + items, 가사 요청이 127.0.0.1:8000 로 가는지
```
**성공 기준**: 검색 결과 클릭 → 가사 영역 loading→ok + LRC 라인 시간 동기 하이라이트 → 노래 부르면 피치 리본/점수 반응.

---

## 13. 절대 다시 밟지 말 것 (체크리스트)

- [ ] `echoCancellation/noiseSuppression` 켜지 말 것(보컬 잘림).
- [ ] sampleRate 하드코딩 금지 — 실제 `AudioContext.sampleRate`로 MIDI 변환.
- [ ] YouTube `videoEmbeddable=true` + 제목 `decodeEntities` 필수.
- [ ] YouTube 키 번들 노출 인지(공개 배포 시 리퍼러 제한/프록시).
- [ ] 가사는 백엔드 프록시 우선, `requests`/`httpx` 대신 **curl_cffi + DoH + impersonate chrome**.
- [ ] lrclib README 말고 `lyrics.py` 코드를 신뢰.
- [ ] `useLyrics` 의존성은 원시값으로, abort 플래그로 경쟁 조건 차단.
- [ ] 404 = notfound(에러 아님)로 분기.
- [ ] uv + Python 3.12(curl_cffi 휠), node_modules OS 불일치 시 재설치, 포트 하드코딩 금지.
- [ ] AI 코치: 키 서버 보관, JSON 추출 정규식 fallback, 에러코드 한국어 매핑.

---

## 14. ★ 결정 필요 사항 (파티가 먼저 정할 것)

1. **목표 멜로디 전략(§2.2)**: MVP를 Tier B(표현/안정성 채점)로 갈지, Tier A(노트맵 정밀)를 곡 몇 개라도 넣을지, 둘 다 갈지. → 채점 로직·UI 분기가 여기서 결정됨.
2. **저작권/콘텐츠**: 유튜브는 공식 IFrame으로 **스트리밍**(재배포 아님)이라 임의 곡 OK 방향. 단 Tier A 노트맵용으로 **오디오를 번들링하는 곡**은 PD/자작만(아리랑 + 워밍업). 이 경계 유지할지 확인.
3. **AI 코칭 포함 여부 / 비용 한도**: haiku + 일일 횟수 제한 수치.
4. **배포 형태**: 로컬 데모만인지(키 직접 호출 허용), 공개 배포인지(검색도 백엔드 프록시 + 키 제한 필요).
5. **백엔드 단일화**: 가사 + AI 코치를 한 FastAPI에 합칠지(권장), 분리할지.

---

> 본 문서는 기존 Flutter 핸드오프·기본 아이디어 가이드·검색/가사 이식 가이드 3개를 "웹앱 + 노래방 퍼펙트 스코어" 방향으로 통합한 기획 초안이다. 검색(§5)·가사(§6)는 검증된 로직을 거의 그대로 옮겼으니 **있는 함정부터 피하면서** 구현 우선순위(§11) 순으로 진행하면 된다.
