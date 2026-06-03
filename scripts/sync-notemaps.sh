#!/usr/bin/env bash
# sync-notemaps.sh — 로컬에서 추출된 노트맵(backend/cache)을 정적 배포본(frontend/public/notemaps)에
#   복사하고, 변경이 있으면 git commit + push 한다. push되면 Vercel이 자동 재배포 → 라이브 사이트에 반영.
#
# 사용법:
#   ./scripts/sync-notemaps.sh            # 1회 동기화 + 커밋 + push
#   ./scripts/sync-notemaps.sh --no-push  # 커밋만, push 안 함
#   ./scripts/sync-notemaps.sh --watch    # backend/cache 감시하며 새 곡 생기면 자동 동기화+push
set -euo pipefail

# 저장소 루트 (스크립트 위치 기준)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/backend/cache"
DST="$ROOT/frontend/public/notemaps"

PUSH=1
WATCH=0
for a in "$@"; do
  case "$a" in
    --no-push) PUSH=0 ;;
    --watch)   WATCH=1 ;;
    *) echo "알 수 없는 옵션: $a"; exit 1 ;;
  esac
done

sync_once() {
  mkdir -p "$DST"
  [ -d "$SRC" ] || { echo "❌ $SRC 없음 (백엔드에서 추출 먼저)"; return 1; }

  # 새/변경된 json만 복사 (-u: 더 최신일 때만)
  cp -u "$SRC"/*.json "$DST"/ 2>/dev/null || true

  cd "$ROOT"
  git add frontend/public/notemaps >/dev/null 2>&1

  if git diff --cached --quiet -- frontend/public/notemaps; then
    echo "✅ 변경 없음 — 이미 최신 (노트맵 $(ls "$DST"/*.json 2>/dev/null | wc -l)곡)"
    return 0
  fi

  # 새로 추가/수정된 파일 목록
  local added
  added="$(git diff --cached --name-only -- frontend/public/notemaps | sed 's#.*/##;s#\.json##')"
  local n
  n="$(echo "$added" | grep -c . || true)"
  echo "📦 동기화할 노트맵 $n개:"
  echo "$added" | sed 's/^/   - /'

  git commit -q -m "$(printf 'data: 노트맵 %d곡 동기화\n\n%s\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>' "$n" "$added")"
  echo "📝 커밋됨: $(git log --oneline -1)"

  if [ "$PUSH" = 1 ]; then
    git push -q origin main && echo "🚀 push 완료 → Vercel 자동 재배포 시작"
  else
    echo "⏸  --no-push: push 생략 (수동: git push origin main)"
  fi
}

if [ "$WATCH" = 1 ]; then
  echo "👀 $SRC 감시 중… (새 추출 생기면 자동 동기화+push, Ctrl+C로 종료)"
  last=""
  while true; do
    cur="$(ls -1 "$SRC"/*.json 2>/dev/null | wc -l)"
    if [ "$cur" != "$last" ]; then
      sync_once || true
      last="$cur"
    fi
    sleep 10
  done
else
  sync_once
fi
