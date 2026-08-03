-- Agency and agent model additions for Montoit API

-- 1) Ensure listing ownership enum exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_owner_type') THEN
    CREATE TYPE listing_owner_type AS ENUM ('PRIVATE', 'AGENT');
  END IF;
END$$;

-- 2) Agencies table
CREATE TABLE IF NOT EXISTS agencies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  description TEXT,
  email VARCHAR(255),
  phone VARCHAR(50),
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  region_id INT REFERENCES regions(id) ON DELETE SET NULL,
  city_id INT REFERENCES cities(id) ON DELETE SET NULL,
  municipality_id INT REFERENCES municipalities(id) ON DELETE SET NULL,
  neighborhood_id INT REFERENCES neighborhoods(id) ON DELETE SET NULL,
  created_by_user_id VARCHAR(16) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Agent membership table (supports one user in multiple agencies)
CREATE TABLE IF NOT EXISTS agency_agents (
  id BIGSERIAL PRIMARY KEY,
  agency_id INT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id VARCHAR(16) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_agency_user UNIQUE (agency_id, user_id)
);

-- Optional but recommended: one primary agency per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_agents_single_primary_per_user
  ON agency_agents(user_id)
  WHERE is_primary = TRUE;

-- 4) Extend listings for private-vs-agent ownership
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS listing_owner_type listing_owner_type NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN IF NOT EXISTS agency_id INT REFERENCES agencies(id) ON DELETE SET NULL;

-- 5) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_listings_owner_type ON listings(listing_owner_type);
CREATE INDEX IF NOT EXISTS idx_listings_agency_id ON listings(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_agents_user_id ON agency_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agency_agents_agency_id ON agency_agents(agency_id);
