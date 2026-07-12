-- ============================================================
-- Migration 2026-07-12: 보안 강화 + 정산 확정 스냅샷 + 입금 확인
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- A. 신규 컬럼 -------------------------------------------------

-- 정산 확정 스냅샷: 공개 시점의 금액을 고정 저장 (멤버 화면은 이것만 렌더링)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS settlement_snapshot JSONB;

-- 멤버별 입금 확인
ALTER TABLE session_rsvps ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- B. users 테이블 잠금 -----------------------------------------
-- 문제 1: users_select USING(true) 로 device_token 이 anon 에 전체 노출
--         → anon key 만 있으면 전 멤버(관리자 포함) 계정 탈취 가능했음
-- 문제 2: users_update USING(true) 로 anon 이 아무 유저 행이나 수정 가능
--
-- 해결: SELECT 는 컬럼 단위 권한으로 device_token 제외,
--       INSERT/UPDATE/DELETE 는 전면 차단 (service role API 경유만 허용)

-- device_token 노출 차단 (컬럼 단위 SELECT 권한)
REVOKE SELECT ON users FROM anon, authenticated;
GRANT SELECT (id, nickname, is_admin, is_active, subsidy_eligible, created_at)
  ON users TO anon, authenticated;

-- 직접 쓰기 전면 차단 — 가입/기기변경/멤버관리는 API(service role) 경유
DROP POLICY IF EXISTS "users_update" ON users;
REVOKE INSERT, UPDATE, DELETE ON users FROM anon, authenticated;
