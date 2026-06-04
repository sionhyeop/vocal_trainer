# 보컬 트레이너 — 기술 설계 및 분석 방법론 (졸업작품 기술 문서)

> 노래방식 "퍼펙트 스코어"를 넘어, **원곡 대조 음정 분석 · 발성/호흡 정량화 · LLM 기반 개인화 코칭**을
> 하나의 파이프라인으로 통합한 웹 기반 보컬 트레이닝 시스템.
>
> 본 문서는 시스템의 *논리적 처리 과정*을 학술적 근거와 함께 정리한다. 각 단계는 실제 구현(✅)과
> 설계·예정(🔧)을 구분해 표기한다. 인용은 모두 실재하는 논문·기사이며 말미 [참고문헌]에 정리한다.

---

## 1. 문제의식과 차별점

### 1.1 기존 노래방 채점의 한계
상용 노래방 채점기는 대부분 **MR(반주)에 내장된 가이드 멜로디(MIDI)와 마이크 피치의 단순 일치도**만
계산한다. 이는 (a) 가이드 데이터가 있는 곡으로 제한되고, (b) *음정의 정오(正誤)*만 볼 뿐 **표현·안정성·호흡**을
설명하지 못하며, (c) 점수에 대한 **근거나 개선 피드백**을 주지 못한다. 자동 가창 평가 연구의 30년 흐름을
정리한 최근 서베이도 "점수 산출"에서 "교육적 피드백"으로 무게중심이 이동하고 있음을 지적한다 [9].

### 1.2 본 시스템의 차별점
| 축 | 기존 노래방 | 본 시스템 |
|---|---|---|
| 정답(목표) 음정 | 곡사에 내장된 MIDI 한정 | **임의 원곡에서 보컬 분리 + F0 추출로 자동 생성** [1][5][6] |
| 평가 차원 | 음정 일치도 | 음정(cent) + **호흡/발성 안정성** + 표현 |
| 실시간 피드백 | 점수 게이지 | 노래방식 리본 + cent 편차 + 콤보/판정 |
| 사후 피드백 | 없음/총점 | **약점 구간 자동 검출 + LLM 코칭(🔧)** [9][14] |
| 데이터 확장 | 제작사 의존 | **셀프호스팅 추출 큐 → 정적 배포**로 사용자 요청 곡 무한 확장 |

핵심 논지: *"정답 음정을 만드는 과정(MIR)"* 과 *"사람의 수행을 정량화하는 과정(피치·호흡)"*, 그리고
*"정량 결과를 사람의 언어로 설명하는 과정(LLM)"* 을 **하나의 종단(end-to-end) 파이프라인**으로 잇는 것.

---

## 2. 시스템 아키텍처 개요

```
[원곡 음원(YouTube)]
      │  (1) 다운로드/크롭
      ▼
[보컬 분리: Hybrid Transformer Demucs] ──┐            ★ 오프라인 분석(관리자 PC/로컬 백엔드)
      │  (2) 보컬 스템                    │
      ▼                                   │
[F0/노트 추출: CREPE · pYIN · Basic Pitch]│  →  [노트맵 JSON  {tMs, midi}[] ]
      │                                   │            │ 정적 동봉(public/notemaps)
      └───────────────────────────────────┘            ▼
                                          [정적 배포(Vercel CDN)] ←── GitHub 자동배포
                                                        │
[사용자 브라우저] ─ 마이크 ─► [실시간 F0(MPM)+필터] ─► [cent 채점] ─► [결과/호흡/코칭]
```

- **프론트엔드**: React + Vite + TypeScript. Web Audio API, `pitchy`(McLeod Pitch Method) [3].
- **분석 백엔드**: Python(FastAPI). 무거운 MIR(분리/추출)은 *오프라인*으로 수행해 결과(노트맵)만 배포.
- **분배**: 추출된 노트맵을 정적 JSON으로 CDN 배포 → 채점은 클라이언트에서 즉시 수행(서버 부하 0).
- **확장**: 웹 요청 → GitHub Issue 큐 → 로컬 워커가 추출 → 자동 커밋·배포 (§7).

> 설계 의도: **비싼 연산(분리/추출)과 값싼 연산(실시간 채점)을 시공간적으로 분리**한다.
> 전자는 1회성·캐시 가능하므로 오프라인 배치로, 후자는 사용자 기기에서 실시간으로.

---

## 3. 음정 분석 파이프라인 (Pitch Pipeline)

목표: "임의 원곡"으로부터 **목표 음정 시퀀스(노트맵)** 를 만들고, 사용자의 실시간 음정을 **cent 단위**로 대조한다.

### P1. 보컬 분리 ✅ — *왜 분리가 먼저인가*
원곡은 반주+보컬의 혼합이라 곧바로 F0를 따면 베이스/신스에 오염된다. 따라서 먼저 **Hybrid Transformer
Demucs(HT-Demucs)** 로 보컬 스템을 분리한다. HT-Demucs는 시간/스펙트럼 이중 U-Net의 내부를 교차도메인
Transformer로 대체해 MUSDB-HQ에서 **SDR 9.0 dB**의 최첨단 분리 성능을 보인다 [5]. `--two-stems=vocals`
모드로 보컬/반주 2분할만 수행해 연산을 절약한다.

### P2. 기본주파수(F0)·노트 추출 ✅ — *곡 특성별 다중 추출기*
분리된 보컬에서 시간별 F0를 추정한다. 단일 알고리즘은 만능이 아니므로 **곡 특성에 따라 전략을 전환**한다.

- **CREPE** [1]: 파형을 직접 받는 6-블록 CNN으로 360-bin 피치를 출력하는 데이터 기반 추정기. pYIN과
  동등하거나 우수한 정확도. → *발라드/깨끗한 단성 보컬*에 기본 사용.
- **pYIN** [2]: YIN의 임계값을 확률 분포로 두고 다중 후보를 HMM-Viterbi로 디코딩해 안정적인 피치 트랙과
  유성/무성 판정을 동시에 산출. → CREPE 미설치 환경의 **폴백**.
- **Basic Pitch** [6]: 악기 비종속 경량 신경망으로 **다성(polyphonic)·온셋·피치벤드**를 동시 추정. EDM·
  오토튠·레이어드 보컬처럼 단성 추정기가 무너지는 곡에서 프레임별 다중 피치 중 최대 진폭 음을 선택.

추출 결과는 옥타브 오검출 보정·점프 평활화를 거쳐 `{tMs, midi}` 시퀀스(노트맵)로 직렬화·캐시된다.

### P3. 실시간 마이크 F0 ✅ — *McLeod Pitch Method*
사용자 음성은 브라우저에서 `getUserMedia`로 캡처하고, **McLeod Pitch Method(MPM)** 기반 `pitchy`로
프레임마다 F0와 명료도(clarity)를 추정한다 [3]. MPM은 정규화 제곱차 함수(NSDF)의 피크를 골라 자기상관의
옥타브 오류에 강한 시간영역 기법으로, 실시간(프레임당 수 ms) 처리에 적합하다.

### P4. 지터 보정 ✅ — *중앙값 + 1€ 필터의 2단 구조* (핵심 차별 요소)
원시 실시간 F0는 (i) 자음/숨에서의 순간 스파이크와 (ii) 미세 떨림으로 노이즈가 크다. 단순 평활화는
*지연(latency)* 을 만들어 노래방 리본이 굼떠 보인다. 본 시스템은 **2단 필터**를 적용한다:

1. **중앙값 필터(window=7)**: 옥타브 오검출·순간 튐 등 *소수 이상치*를 구조적으로 제거(평균과 달리 이상치에 강건).
2. **1€ 필터(One Euro Filter)** [4]: *속도 적응형* 저역통과 필터. 음을 길게 끌 때(저속)는 컷오프를 낮춰
   떨림을 강하게 억제하고, 빠른 글리산도/도약(고속)에는 컷오프를 높여 지연을 줄인다. "느릴 땐 지터에,
   빠를 땐 지연에 민감하다"는 인지 특성을 그대로 반영한 알고리즘으로, 본 시스템에선
   `MIN_CUTOFF=1.3, BETA=0.8`로 튜닝했다. 더불어 짧은 무성 구간(≈130 ms)은 직전 음으로 메우는
   **보이싱 행오버**로 트레일 끊김을 막는다.

> 이 P4 단계가 "상용 노래방처럼 부드럽게 따라오면서도, 진짜 음정 변화에는 즉각 반응"하는 체감의 근거다.

### P5. 정합(Alignment)과 cent 대조 ✅
재생 타임라인 기준으로 목표 노트맵과 사용자 F0를 정렬한다. 음정 오차는 음악적으로 등가인 **cent**
(= 100 × (반음 편차))로 환산한다 — 주파수의 로그 척도라 음역과 무관하게 "얼마나 틀렸는가"를 일관되게 잰다 [7].
가사-영상 싱크 오차는 곡별 **오프셋 슬라이더**로 보정해 저장한다.

### P6. 판정·점수화 ✅ (산식은 §6)
목표 노트 활성 구간 동안 cent 편차를 누적하고, 노트 종료 시 **평균 |cent| 편차 + 커버리지(실제로 부른 비율)**
로 Perfect/Great/Good/Miss를 판정한다. 커버리지<0.25면 Miss(거의 안 부름).

---

## 4. 호흡·발성 분석 파이프라인 (Breath/Phonation Pipeline)

목표: 음정 외에 **"어떻게 소리를 냈는가"** — 발성 안정성과 호흡 운용 — 를 정량화한다. 성악 연구는 호흡 지지
(breath support)가 성문하압(subglottal pressure)을 조절해 음질·지속력을 좌우함을 보였고 [12], 본 시스템은
*마이크 단일 채널*만으로 그 대리 지표(proxy)를 추정한다.

### B1. 에너지 포락선(RMS Envelope) ✅
프레임별 RMS로 발성 에너지의 시간 곡선을 만든다. `RMS_GATE=0.008`을 유성/무성 경계로 사용.

### B2. 프레이즈·호흡점 분할 ✅
RMS가 게이트 아래로 떨어지는 구간을 **호흡/휴지(breath/pause)** 후보로, 그 사이 유성 구간을 하나의
**프레이즈(한 호흡 발성)** 로 분절한다. 무반주 가창의 *호흡음 자동 검출* 연구와 동일한 문제의식으로,
본 시스템은 에너지 기반 경량 추정을 택해 실시간성을 확보했다 [11].

### B3. 발성 안정성(Stability) ✅
한 음을 끌 때의 미세 피치/에너지 떨림(jitter)을 측정해 `stability = clip(100 − meanJitter×200, 0..100)`로
0~100 점수화한다. 의도된 비브라토와 불안정한 떨림은 향후 주기성 분석으로 분리 예정(🔧).

### B4. 핵심 호흡 지표 ✅
- **최장 발성 구간(longestPhraseMs)**: 한 호흡으로 지속한 최대 길이 → 호흡 지지력의 대리 지표.
- **유성 비율(voicedRatio)**, **숨소리 비율(breathyRatio)**: 발성 효율·기식성(breathiness)의 단서 [11].

### B5. 약점 구간 검출 ✅
전체 타임라인을 버킷으로 나눠 **평균 cent 편차가 큰 구간 Top-N**을 자동 추출한다. 결과 화면에서 그 시점으로
바로 점프해 재청취할 수 있어, "어디서 틀렸는지"를 시각·청각적으로 되짚게 한다. 이는 §5 코칭의 입력이 된다.

> 설계 한계의 정직한 명시: 본 호흡 분석은 *음향 단일 채널 추정*이다. 임상적 호흡 측정(호흡 벨트·EGG 등
> 다중 센서) [11]과 달리 절대값이 아닌 **상대적·교육적 지표**임을 전제로 설계했다.

---

## 5. AI 코칭 파이프라인 (LLM Coaching) 🔧 *(설계·부분구현)*

목표: 위 정량 결과를 **사람이 이해하는 코칭 언어**로 변환한다. 최근 연구는 LLM 기반 피드백이 가창 학습자의
*메타인지와 수행*을 유의하게 향상시킴을 보고했다 [14], 그리고 음악 교육에서의 생성형 AI 활용 사례가 빠르게
축적되고 있다 [15]. 본 시스템은 이를 *구조화된 정량 입력 → 구조화된 교육적 출력*의 함수로 구현한다.

### C1. 특징 집계
한 세션의 정량치를 요약 벡터로 모은다: 평균/구간별 cent 편차, 판정 분포, stability, 최장 발성, 약점 구간
Top-3(시점·편차·가사), 음역 사용 범위(프로필 대비).

### C2. 약점 진단(룰 + LLM)
규칙 기반 1차 분류(예: "고음부 음정 처짐", "프레이즈 후반 호흡 부족", "특정 음정 도약 불안정")로 후보를
좁히고, 약점 구간의 원곡 목표 음정·가사 맥락을 함께 제공한다.

### C3. 코칭 생성(Claude)
Anthropic Claude에 **구조화 프롬프트**(역할: 보컬 코치 / 입력: C1~C2 요약 / 출력 스키마: 잘한 점·핵심 약점·
다음 연습 1~2개)를 주어, 곡·구간에 특정된 **실행 가능한 연습 처방**을 생성한다. 출력은 길이·톤·난이도를
제약해 학습자 부담을 줄인다(짧고 긍정적·구체적). 캐싱으로 비용을 통제한다.

### C4. 폐루프(Closed Loop)
처방된 연습은 §3~4의 트레이닝 모드(음역 클라이머·청음·따라부르기)로 연결되고, 다음 세션의 지표 변화를
추적해 "개선 여부"를 다시 코칭에 반영한다 — 평가가 아니라 *학습 루프*가 되도록.

---

## 6. 채점 산식과 평가 지표

### 6.1 음정 정확도(0~100)
노트 단위 판정에 가중치를 부여해 정확도를 산출한다:

```
accuracy = (Perfect×100 + Great×80 + Good×55) / ticks
```

판정 임계는 cent 편차 기반의 *관대한* 설정을 쓴다. 이는 상용·학술 가창 평가가 통상 **반음의 1/3(≈33 cent)
이내**를 만점권으로 두는 관행과 정렬된다 [9]. 콤보 보너스로 연속 정확 가창을 추가 보상한다.

### 6.2 표현·안정성
stability(0~100), 최장 발성, 유성/기식 비율을 보조 지표로 함께 제시한다(점수에 직접 합산하지 않고
*프로파일*로 표시 — 음정과 표현을 혼동하지 않기 위함).

### 6.3 평가 철학
등급(S/A/B) 대신 **100점 만점 점수 + 점수대별 색·격려 문구 + 약점 구간**으로 제시한다. "직관적 점수 +
개선 지점"이 동기를 더 잘 유지한다는 판단(§1.1의 교육적 전환과 일치).

---

## 7. 데이터·배포 파이프라인 (확장성의 근거)

기존 서비스가 "제작사가 만든 곡만" 채점하는 것과 달리, 본 시스템은 **사용자가 곡을 늘릴 수 있는 구조**를 갖는다.

1. **오프라인 추출**: 관리자/로컬 백엔드가 §3 P1~P2를 수행 → 노트맵 JSON 생성.
2. **정적 분배**: 노트맵을 `public/notemaps/<videoId>.json`으로 동봉, CDN으로 즉시 서빙(서버 추론 0).
3. **요청 큐(셀프호스팅 분산 처리)**: 웹 방문자가 미추출 곡을 *요청* → 서버리스 함수가 **GitHub Issue**로
   큐에 적재 → 집의 워커가 폴링·추출 → 자동 커밋 → 자동 재배포로 라이브 반영.
   - 집 PC를 인터넷에 노출하지 않고(아웃바운드 폴링만), PC가 꺼져 있어도 요청이 큐에 보존된다.
4. **관리자 큐레이션**: 비밀 닉네임 + 서버 시크릿으로 곡/가사를 *고정*(curate)해 품질을 관리.

> 이 구조의 의의: **"비싼 GPU 추론을 상시 서버로 두지 않고도" 임의 곡을 채점 가능한 자산으로 전환**한다.
> 추출은 1회성·캐시 가능하다는 성질을 배포 아키텍처로 환원한 설계.

---

## 8. 구현 현황 (정직한 스코프)

| 모듈 | 상태 | 비고 |
|---|---|---|
| 보컬 분리 (HT-Demucs) | ✅ | `--two-stems=vocals`, CPU |
| F0/노트 추출 (CREPE/pYIN/Basic Pitch) | ✅ | 곡 특성별 선택 |
| 실시간 F0 (MPM/pitchy) | ✅ | |
| 2단 지터 보정 (중앙값+1€) | ✅ | 핵심 체감 차별 |
| cent 정합·판정·점수 | ✅ | 100점, 콤보 |
| 호흡/발성 지표 | ✅ | 단일 채널 추정(상대 지표) |
| 약점 구간 검출 | ✅ | Top-N, 구간 점프 |
| 트레이닝 게임(음역/청음/따라부르기) | ✅ | 학습 루프 |
| 셀프호스팅 추출 큐 + 정적 배포 | ✅ | GitHub Issue 큐 |
| LLM 코칭 (Claude) | 🔧 | C1~C4 설계 완료, 연동 예정 |
| 비브라토 주기성 분리 | 🔧 | 안정성 정밀화 |
| 단어 단위 가사 정렬 (WhisperX) | 🔧 | 정밀 싱크 |

---

## 9. 참고문헌

[1] J. W. Kim, J. Salamon, P. Li, J. P. Bello. "CREPE: A Convolutional Representation for Pitch Estimation." *ICASSP 2018.* arXiv:1802.06182. https://arxiv.org/abs/1802.06182
[2] M. Mauch, S. Dixon. "pYIN: A Fundamental Frequency Estimator Using Probabilistic Threshold Distributions." *ICASSP 2014.* https://ieeexplore.ieee.org/document/6853678
[3] P. McLeod, G. Wyvill. "A Smarter Way to Find Pitch (McLeod Pitch Method)." *ICMC 2005.* (구현: `pitchy`)
[4] G. Casiez, N. Roussel, D. Vogel. "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems." *ACM CHI 2012.* https://gery.casiez.net/1euro/
[5] S. Rouard, F. Massa, A. Défossez. "Hybrid Transformers for Music Source Separation." *ICASSP 2023.* arXiv:2211.08553. https://arxiv.org/abs/2211.08553
[6] R. M. Bittner, J. J. Bosch, D. Rubinstein, G. Meseguer-Brocal, S. Ewert. "A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation (Basic Pitch)." *ICASSP 2022.* https://engineering.atspotify.com/2022/6/meet-basic-pitch
[7] E. Molina, I. Barbancho, E. Gómez, A. M. Barbancho, L. J. Tardón. "Automatic Scoring of Singing Voice Based on Melodic Similarity Measures." 2012. https://emilio-molina.github.io/publications/Molina-2012-Automatic-scoring-of-singing-voice-based-on-melodic-similarity-measures.pdf
[8] T. Nakano, M. Goto, Y. Hiraga. "An Automatic Singing Skill Evaluation Method for Unknown Melodies Using Pitch Interval Accuracy and Vibrato Features." *Interspeech 2006.*
[9] "A Survey on 30+ Years of Automatic Singing Assessment." *arXiv:2601.12153 (2026).* https://www.arxiv.org/pdf/2601.12153
[10] Hsieh et al. "Tonality-Based Accompaniment-Guided Automatic Singing Evaluation." *Interspeech 2025.* https://www.isca-archive.org/interspeech_2025/hsieh25c_interspeech.pdf
[11] "Towards a Singing Voice Multi-Sensor Analysis Tool: System Design and Assessment Based on Vocal Breathiness." *Sensors (MDPI) 21(23):8006, 2021.* https://www.mdpi.com/1424-8220/21/23/8006
[12] "Patterns of Breath Support in Projection of the Singing Voice." *Journal of Voice.* https://www.sciencedirect.com/science/article/abs/pii/S0892199701000091
[13] "Acoustics of Breath Noises in Human Speech: Descriptive and Three-Dimensional Modeling Approaches." *Journal of Speech, Language, and Hearing Research, 2023.* https://pubs.asha.org/doi/10.1044/2023_JSLHR-23-00112
[14] "AI-Assisted Feedback and Reflection in Vocal Music Training: Effects on Metacognition and Singing Performance." *Frontiers in Psychology, 2025.* https://www.frontiersin.org/articles/10.3389/fpsyg.2025.1598867/full
[15] J. Holster. "Augmenting Music Education through AI: Practical Applications of ChatGPT." *2024.* https://journals.sagepub.com/doi/10.1177/00274321241255938

---

*문서 작성: 2026-06-04. 구현 현황은 §8 기준이며, 🔧 항목은 설계가 확정된 향후 작업이다.*
