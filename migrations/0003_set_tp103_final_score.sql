UPDATE leagues
SET
  snapshot_json = json_set(
    snapshot_json,
    '$.fixtures[' || (
      SELECT json_each.key
      FROM json_each(leagues.snapshot_json, '$.fixtures')
      WHERE json_extract(json_each.value, '$.id') = 'TP_103'
      LIMIT 1
    ) || '].status',
    'locked',
    '$.fixtures[' || (
      SELECT json_each.key
      FROM json_each(leagues.snapshot_json, '$.fixtures')
      WHERE json_extract(json_each.value, '$.id') = 'TP_103'
      LIMIT 1
    ) || '].homeScore',
    4,
    '$.fixtures[' || (
      SELECT json_each.key
      FROM json_each(leagues.snapshot_json, '$.fixtures')
      WHERE json_extract(json_each.value, '$.id') = 'TP_103'
      LIMIT 1
    ) || '].awayScore',
    6,
    '$.fixtures[' || (
      SELECT json_each.key
      FROM json_each(leagues.snapshot_json, '$.fixtures')
      WHERE json_extract(json_each.value, '$.id') = 'TP_103'
      LIMIT 1
    ) || '].winnerTeam',
    'away'
  ),
  revision = revision + 1,
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE json_valid(snapshot_json)
  AND EXISTS (
    SELECT 1
    FROM json_each(leagues.snapshot_json, '$.fixtures')
    WHERE json_extract(json_each.value, '$.id') = 'TP_103'
      AND (
        COALESCE(json_extract(json_each.value, '$.status'), '') <> 'locked'
        OR COALESCE(CAST(json_extract(json_each.value, '$.homeScore') AS INTEGER), -1) <> 4
        OR COALESCE(CAST(json_extract(json_each.value, '$.awayScore') AS INTEGER), -1) <> 6
        OR COALESCE(json_extract(json_each.value, '$.winnerTeam'), '') <> 'away'
      )
  );
