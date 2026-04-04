-- USERS
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  handle      VARCHAR(100) UNIQUE NOT NULL,
  region      VARCHAR(100),
  district    VARCHAR(100),
  avatar_url  TEXT,
  bio         TEXT,
  x_profile   TEXT,
  instagram_profile TEXT,
  facebook_profile  TEXT,
  whatsapp_profile  TEXT,
  push_token  TEXT,
  is_banned   BOOLEAN DEFAULT FALSE,
  ban_until   TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS x_profile TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_profile TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_profile TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_profile TEXT;

-- OTP
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(255) NOT NULL,
  code       VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ADDS
CREATE TABLE IF NOT EXISTS adds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  category         VARCHAR(50) NOT NULL,
  title            VARCHAR(500) NOT NULL,
  description      TEXT,
  region           VARCHAR(100),
  district         VARCHAR(100),
  media_urls       TEXT[],
  media_requested  BOOLEAN DEFAULT FALSE,
  max_partners     INT DEFAULT 1,
  status           VARCHAR(20) DEFAULT 'open',
  latitude         DECIMAL(10,8),
  longitude        DECIMAL(11,8),
  created_at       TIMESTAMP DEFAULT NOW()
);

-- USES
CREATE TABLE IF NOT EXISTS uses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  add_id         UUID REFERENCES adds(id) ON DELETE CASCADE,
  owner_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  relation_group VARCHAR(20) NOT NULL DEFAULT 'direct',
  use_label      VARCHAR(50),
  title          VARCHAR(255),
  description    TEXT,
  media_urls     TEXT[],
  external_link  TEXT,
  status         VARCHAR(20) DEFAULT 'pending',
  owner_created  BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ADD-UPS (use geliştirme geçmişi)
CREATE TABLE IF NOT EXISTS add_ups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_id     UUID REFERENCES uses(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL,
  content    TEXT,
  media_url  TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- SELECTIONS
CREATE TABLE IF NOT EXISTS selections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  add_id      UUID REFERENCES adds(id) ON DELETE CASCADE,
  use_ids     UUID[],
  selected_at TIMESTAMP DEFAULT NOW()
);

-- REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  add_id     UUID REFERENCES adds(id),
  use_id     UUID REFERENCES uses(id),
  from_id    UUID REFERENCES users(id),
  to_id      UUID REFERENCES users(id),
  role       VARCHAR(20),
  rating     INT CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  add_id     UUID REFERENCES adds(id),
  use_id     UUID REFERENCES uses(id),
  from_id    UUID REFERENCES users(id),
  to_id      UUID REFERENCES users(id),
  content    TEXT NOT NULL,
  read_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,
  title      TEXT,
  body       TEXT,
  payload    JSONB,
  read_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_adds_owner     ON adds(owner_id);
CREATE INDEX IF NOT EXISTS idx_adds_status    ON adds(status);
CREATE INDEX IF NOT EXISTS idx_adds_category  ON adds(category);
CREATE INDEX IF NOT EXISTS idx_adds_region    ON adds(region);
CREATE INDEX IF NOT EXISTS idx_uses_add       ON uses(add_id);
CREATE INDEX IF NOT EXISTS idx_uses_owner     ON uses(owner_id);
CREATE INDEX IF NOT EXISTS idx_messages_to    ON messages(to_id);
CREATE INDEX IF NOT EXISTS idx_notifications  ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_reviews_to     ON reviews(to_id);
