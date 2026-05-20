CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname TEXT NOT NULL,
  device_token TEXT UNIQUE NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
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
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed')),
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

ALTER PUBLICATION supabase_realtime ADD TABLE messages;

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE wines DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_wines DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- 차수별 참석 추적
ALTER TABLE session_rsvps ADD COLUMN IF NOT EXISTS attended_rounds INTEGER[];
-- NULL = 전체 참석 (기본값), 배열 = 참석한 차수 목록 (예: {1,2})
