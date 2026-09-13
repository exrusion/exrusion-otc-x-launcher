CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_post_id text NOT NULL UNIQUE,
  source_url text NOT NULL,
  creator_handle text NOT NULL,
  source_text text NOT NULL,
  image_url text,
  name text,
  ticker text,
  pair_symbol text,
  pair_mint text,
  pair_logo text,
  status text NOT NULL CHECK (status IN ('rejected','processing','completed')),
  rejection_reason text,
  contract_address text,
  live_url text,
  test_mode boolean NOT NULL DEFAULT true,
  launch_attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  reply_status text NOT NULL DEFAULT 'not_ready' CHECK (reply_status IN ('not_ready','pending','sending','sent')),
  reply_attempts integer NOT NULL DEFAULT 0,
  reply_post_id text,
  reply_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity (
  id bigserial PRIMARY KEY,
  launch_id uuid REFERENCES launches(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  message text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (launch_id, event_key)
);

CREATE TABLE IF NOT EXISTS listener_heartbeats (
  listener_id text PRIMARY KEY,
  agent_handle text NOT NULL,
  version text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS launches_queue_idx ON launches(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS launches_reply_idx ON launches(reply_status, updated_at);
