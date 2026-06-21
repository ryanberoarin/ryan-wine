-- 1. users 테이블에 회사지원금 대상 여부 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS subsidy_eligible BOOLEAN DEFAULT TRUE NOT NULL;

-- 2. 매월 1일 기준 지원금 스냅샷 테이블
CREATE TABLE IF NOT EXISTS monthly_subsidy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  month INT NOT NULL,
  eligible_count INT NOT NULL,
  total_amount INT NOT NULL,
  snapshotted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month)
);

-- 3. 홍승주 복수가입자 처리 (이름으로 찾아 subsidy_eligible = false)
UPDATE users SET subsidy_eligible = FALSE WHERE nickname = '홍승주';
