-- ============================================================
-- RLS Migration: wine-club tables
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- 1. RLS 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_wines ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 2. users 테이블 정책
--    읽기: 누구나 OK (앱에서 닉네임/프로필 조회)
--    생성: 직접 insert 완전 차단 — 가입은 /api/register (service role) 경유만 허용
--    수정: is_admin 변경 불가 (어드민 승급은 service role만 가능)
--    삭제: 차단
CREATE POLICY "users_select" ON users
  FOR SELECT TO anon USING (true);

-- INSERT 정책 없음 → anon은 직접 insert 불가 (service_role은 RLS 우회)

CREATE POLICY "users_update" ON users
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (is_admin = false);

-- 3. wines 테이블 정책 (전체 허용 — 앱 기능 유지)
CREATE POLICY "wines_all" ON wines
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. tasting_notes 테이블 정책
CREATE POLICY "tasting_notes_all" ON tasting_notes
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. sessions 테이블 정책
CREATE POLICY "sessions_all" ON sessions
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6. session_wines 테이블 정책
CREATE POLICY "session_wines_all" ON session_wines
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 7. messages 테이블 정책
CREATE POLICY "messages_all" ON messages
  FOR ALL TO anon USING (true) WITH CHECK (true);
