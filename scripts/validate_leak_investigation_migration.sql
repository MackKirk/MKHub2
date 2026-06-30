-- Pre/post checks for migrate_leak_investigations_to_rm_projects.sql
-- Run BEFORE migration: baseline. Run AFTER migration: gates before code deploy / column drop.

-- Division must exist
SELECT si.id AS leak_div_id, si.label
FROM setting_lists sl
JOIN setting_items si ON si.list_id = sl.id
WHERE sl.name = 'project_divisions'
  AND si.label = 'Leak Investigations'
  AND si.parent_id IS NULL;

-- GATE 1: zero legacy flags (required before column drop)
SELECT COUNT(*) AS remaining_flags
FROM projects
WHERE is_leak_investigation = true AND deleted_at IS NULL;

-- Baseline: rows still on legacy flag (run before migration)
SELECT id, code, name, project_division_ids
FROM projects
WHERE is_leak_investigation = true AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- GATE 2: linked leak parents still have Leak Investigations division
-- Replace :leak_div_id with UUID from first query, or use subquery below.
SELECT COUNT(*) AS leaks_without_division
FROM projects p
WHERE p.deleted_at IS NULL
  AND p.business_line = 'repairs_maintenance'
  AND p.is_bidding = false
  AND EXISTS (
    SELECT 1 FROM projects child
    WHERE child.related_leak_investigation_id = p.id
      AND child.deleted_at IS NULL
  )
  AND NOT (
    p.project_division_ids::text LIKE '%' || (
      SELECT si.id::text
      FROM setting_lists sl
      JOIN setting_items si ON si.list_id = sl.id
      WHERE sl.name = 'project_divisions'
        AND si.label = 'Leak Investigations'
        AND si.parent_id IS NULL
      LIMIT 1
    ) || '%'
  );
