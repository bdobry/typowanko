UPDATE leagues
SET
  snapshot_json = json_set(
    snapshot_json,
    '$.fixtures[' || (
      SELECT json_each.key
      FROM json_each(leagues.snapshot_json, '$.fixtures')
      WHERE json_extract(json_each.value, '$.id') = 'H5'
        AND json_extract(json_each.value, '$.homeTeam') = 'Cape Verde'
        AND json_extract(json_each.value, '$.awayTeam') = 'Saudi Arabia'
        AND json_extract(json_each.value, '$.date') = '2026-06-26'
        AND json_extract(json_each.value, '$.utcTime') = '00:00'
      LIMIT 1
    ) || '].date',
    '2026-06-27'
  ),
  revision = revision + 1,
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE json_valid(snapshot_json)
  AND EXISTS (
    SELECT 1
    FROM json_each(leagues.snapshot_json, '$.fixtures')
    WHERE json_extract(json_each.value, '$.id') = 'H5'
      AND json_extract(json_each.value, '$.homeTeam') = 'Cape Verde'
      AND json_extract(json_each.value, '$.awayTeam') = 'Saudi Arabia'
      AND json_extract(json_each.value, '$.date') = '2026-06-26'
      AND json_extract(json_each.value, '$.utcTime') = '00:00'
  );
