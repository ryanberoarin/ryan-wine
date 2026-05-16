#!/bin/bash
# 와인클럽 셋업 스크립트 (완전 무료)
# 실행: bash scripts/setup.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

SUPABASE_URL="https://qcucwkvttzjnamypynvj.supabase.co"
ANON_KEY="sb_publishable_QsMNj_d_HfmDefQwwg2n8w_Ta1pKdud"
PROJECT_REF="qcucwkvttzjnamypynvj"

echo ""
echo "🍷 와인클럽 셋업 (무료)"
echo "──────────────────────────────"
echo ""

# Gemini API 키 입력
echo "1. Google AI Studio에서 무료 Gemini API 키 발급:"
echo "   → https://aistudio.google.com/apikey"
echo ""
read -p "   Gemini API 키 붙여넣기: " GEMINI_KEY
echo ""

# Supabase 서비스 롤 키 입력
echo "2. Supabase 서비스 롤 키:"
echo "   → https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
echo "   → 'service_role' 섹션의 키 복사"
echo ""
read -p "   서비스 롤 키 붙여넣기: " SERVICE_KEY
echo ""

# 관리자 패스코드
read -p "3. 관리자 패스코드 (엔터 = wine1234): " ADMIN_PASSCODE
ADMIN_PASSCODE=${ADMIN_PASSCODE:-wine1234}
echo ""

# .env.local 저장
echo "📝 환경변수 저장 중..."
cat > "$ROOT_DIR/.env.local" << EOF
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
GEMINI_API_KEY=${GEMINI_KEY}
NEXT_PUBLIC_ADMIN_PASSCODE=${ADMIN_PASSCODE}
EOF
echo "✓ .env.local 저장"

# 스토리지 버킷 생성
echo "🪣 스토리지 버킷 생성 중..."
BUCKET_RESULT=$(curl -s -X POST "${SUPABASE_URL}/storage/v1/bucket" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"id":"wine-labels","name":"wine-labels","public":true}')

if echo "$BUCKET_RESULT" | grep -q '"name":"wine-labels"'; then
  echo "✓ wine-labels 버킷 생성"
elif echo "$BUCKET_RESULT" | grep -q "already exists"; then
  echo "✓ wine-labels 버킷 이미 존재"
else
  echo "⚠ 버킷: $BUCKET_RESULT"
fi

# DB 스키마 실행
echo "🗄  DB 테이블 생성 중..."
SQL=$(cat "$ROOT_DIR/supabase/schema.sql")
MGMT_RESULT=$(curl -s -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$SQL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" 2>&1)

if echo "$MGMT_RESULT" | grep -q '"error"'; then
  echo ""
  echo "⚠  SQL 자동 실행 실패 → 수동으로 1번만 하면 됩니다:"
  echo "   1. https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"
  echo "   2. ${ROOT_DIR}/supabase/schema.sql 내용 전체 붙여넣기 → Run"
else
  echo "✓ DB 테이블 생성"
fi

echo ""
echo "──────────────────────────────"
echo "✅ 셋업 완료!"
echo ""
echo "🚀 실행: npm run dev"
echo "🌐 접속: http://localhost:3000"
echo "🔑 관리자 패스코드: ${ADMIN_PASSCODE}"
echo ""
