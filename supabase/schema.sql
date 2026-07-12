-- ============================================================
-- 현재 스키마 참고용 스냅샷 (2026-07-12 기준)
-- 실제 DB가 소스 오브 트루스. 변경은 migration_*.sql 로 순차 적용:
--   1. rls_migration.sql          (RLS 활성화)
--   2. migration_subsidy.sql      (subsidy_eligible, 월 스냅샷)
--   3. migration_security_settlement.sql (users 잠금, 정산 스냅샷, 입금 확인)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname TEXT NOT NULL,
  device_token TEXT UNIQUE NOT NULL, -- anon SELECT 차단됨 (컬럼 단위 권한)
  is_admin BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  subsidy_eligible BOOLEAN DEFAULT TRUE NOT NULL, -- 복수가입자는 FALSE (지원금 제외)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  producer TEXT,
  region TEXT,
  country TEXT,
  vintage INTEGER,
  grape_varieties TEXT[],
  wine_type TEXT CHECK (wine_type IN ('red', 'white', 'orange', 'rose', 'sparkling', 'other')),
  is_natural BOOLEAN DEFAULT TRUE,
  label_image_url TEXT,
  ai_description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  venue TEXT,
  scheduled_at TIMESTAMPTZ,
  rsvp_deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed')),
  total_cost INTEGER,
  subsidy_carryover INTEGER DEFAULT 0,
  settlement_published BOOLEAN DEFAULT FALSE,
  settlement_snapshot JSONB, -- 정산 확정 시점의 고정본 (lib/settlement.ts SettlementSnapshot)
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wine_id UUID REFERENCES wines(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  aroma_keywords TEXT[],
  taste_keywords TEXT[],
  texture_keywords TEXT[],
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_wines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  wine_id UUID REFERENCES wines(id),
  added_by UUID REFERENCES users(id),
  order_index INTEGER DEFAULT 0,
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'removed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('attending', 'not_attending')),
  attended_rounds INTEGER[], -- NULL = 전체 참석, 배열 = 참석한 차수 목록 (예: {1,2})
  paid_at TIMESTAMPTZ,       -- 정산 입금 확인 시각 (NULL = 미입금)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS session_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  round_number INTEGER DEFAULT 1,
  category TEXT CHECK (category IN ('wine', 'venue', 'taxi', 'food', 'other')),
  description TEXT,
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'tasting_note', 'wine_card')),
  content TEXT NOT NULL,
  wine_id UUID REFERENCES wines(id),
  tasting_note_id UUID REFERENCES tasting_notes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_subsidy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  month INT NOT NULL,
  eligible_count INT NOT NULL,
  total_amount INT NOT NULL,
  snapshotted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month)
);

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
