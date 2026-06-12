CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  host_code_hash TEXT NOT NULL,
  viewer_code_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_access (
  league_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_code_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, player_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_access_league_id
  ON player_access(league_id);
