#!/usr/bin/env bash
# extract-worker.sh — 내 컴퓨터에서 도는 추출 워커.
#   GitHub 이슈 큐(label: extract-request)를 폴링 → 로컬 백엔드로 원곡 추출 →
#   sync-notemaps.sh(정적 동기화+push) → 이슈 닫기. push되면 Vercel 자동 재배포로 라이브 반영.
#
# 사전조건:
#   - gh CLI 로그인됨 (gh auth status)
#   - 로컬 백엔드 실행 중:  cd backend && .venv/bin/uvicorn main:app --port 8000
#   - 같은 PC에서 이 스크립트 실행
#
# 사용법:
#   ./scripts/extract-worker.sh            # 무한 폴링(기본 20초 간격)
#   ./scripts/extract-worker.sh --once     # 큐 한 번만 비우고 종료
#   POLL=10 ./scripts/extract-worker.sh    # 폴링 간격(초) 조정
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${GH_QUEUE_REPO:-sionhyeop/vocal_trainer}"
LABEL="extract-request"
BACKEND="${BACKEND_URL:-http://127.0.0.1:8000}"
POLL="${POLL:-20}"
ONCE=0
[ "${1:-}" = "--once" ] && ONCE=1

command -v gh >/dev/null || { echo "❌ gh CLI 필요"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ gh 로그인 필요 (gh auth login)"; exit 1; }

process_one() {
  local num="$1" title="$2"
  local vid
  vid="$(echo "$title" | grep -oE '\[[A-Za-z0-9_-]{11}\]' | head -1 | tr -d '[]')"
  if [ -z "$vid" ]; then
    echo "  #$num: videoId 파싱 실패 → 스킵"
    gh issue comment "$num" --repo "$REPO" --body "⚠️ videoId를 제목에서 찾지 못해 처리할 수 없습니다." >/dev/null 2>&1
    gh issue close "$num" --repo "$REPO" >/dev/null 2>&1
    return
  fi

  echo "  #$num 처리 시작 — videoId=$vid"
  gh issue edit "$num" --repo "$REPO" --add-label processing >/dev/null 2>&1

  # 백엔드 살아있나
  if ! curl -s -m 5 "$BACKEND/api/health" >/dev/null; then
    echo "  ❌ 백엔드($BACKEND) 응답 없음 — processing 라벨 떼고 다음 회차로 미룸"
    gh issue edit "$num" --repo "$REPO" --remove-label processing >/dev/null 2>&1
    return 1
  fi

  # 추출(블로킹). 최대 10분.
  local code
  code="$(curl -s -o /tmp/notemap_out.json -w '%{http_code}' -m 600 \
    "$BACKEND/api/notemap?videoId=$vid&method=auto&maxSeconds=60")"

  if [ "$code" != "200" ]; then
    local detail; detail="$(head -c 300 /tmp/notemap_out.json 2>/dev/null)"
    echo "  ❌ 추출 실패 (HTTP $code)"
    gh issue edit "$num" --repo "$REPO" --remove-label processing >/dev/null 2>&1
    gh issue comment "$num" --repo "$REPO" --body "❌ 추출 실패 (HTTP $code). 곡이 부적합하거나 보컬 인식 실패일 수 있어요.\n\`\`\`\n$detail\n\`\`\`" >/dev/null 2>&1
    return
  fi

  # 동기화 + push (Vercel 자동 재배포)
  echo "  📦 추출 완료 → 동기화/배포"
  "$ROOT/scripts/sync-notemaps.sh" >/dev/null 2>&1 || true

  gh issue close "$num" --repo "$REPO" \
    --comment "✅ 추출 완료 — 잠시 후 사이트에서 이 곡 채점이 가능합니다. (자동 배포 중)" >/dev/null 2>&1
  echo "  ✅ #$num 완료 → 이슈 닫음"
}

run_pass() {
  local json
  json="$(gh issue list --repo "$REPO" --label "$LABEL" --state open --json number,title --limit 50 2>/dev/null)"
  local count
  count="$(echo "$json" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)"
  if [ "$count" = "0" ]; then
    return
  fi
  echo "📋 대기 요청 $count건"
  # number<TAB>title 로 펼쳐 처리
  echo "$json" | python3 -c 'import json,sys
for i in json.load(sys.stdin):
    print(str(i["number"])+"\t"+i["title"])' | while IFS=$'\t' read -r num title; do
    process_one "$num" "$title"
  done
}

echo "🛠  extract-worker 시작 (repo=$REPO, backend=$BACKEND, poll=${POLL}s)"
if [ "$ONCE" = 1 ]; then
  run_pass
  echo "done (--once)"
else
  while true; do
    run_pass
    sleep "$POLL"
  done
fi
