-- Migrate R&M leak investigations (is_leak_investigation=true) into regular RM projects
-- classified by the "Leak Investigations" project division.
--
-- Run AFTER deploying code with division-based leak helpers (dual-read).
-- Safe to re-run: only touches rows still flagged is_leak_investigation=true.

DO $$
DECLARE
    leak_div_id UUID;
    rec RECORD;
    div_ids JSONB;
    div_id_text TEXT;
    pcts JSONB;
    existing_pct JSONB;
    div_count INT;
    equal_pct INT;
    remainder INT;
    idx INT;
    pre_count INT;
    post_count INT;
BEGIN
    SELECT si.id INTO leak_div_id
    FROM setting_lists sl
    JOIN setting_items si ON si.list_id = sl.id
    WHERE sl.name = 'project_divisions'
      AND si.label = 'Leak Investigations'
      AND si.parent_id IS NULL
    LIMIT 1;

    IF leak_div_id IS NULL THEN
        RAISE EXCEPTION 'Leak Investigations division not found in setting_items';
    END IF;

    SELECT COUNT(*) INTO pre_count
    FROM projects
    WHERE is_leak_investigation = true AND deleted_at IS NULL;

    RAISE NOTICE 'Pre-migration leak investigation count: %', pre_count;

    FOR rec IN
        SELECT id, project_division_ids, project_division_percentages
        FROM projects
        WHERE is_leak_investigation = true AND deleted_at IS NULL
    LOOP
        div_ids := COALESCE(rec.project_division_ids::jsonb, '[]'::jsonb);

        IF NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(div_ids) elem
            WHERE elem = leak_div_id::text
        ) THEN
            div_ids := div_ids || to_jsonb(leak_div_id::text);
        END IF;

        existing_pct := COALESCE(rec.project_division_percentages::jsonb, '{}'::jsonb);

        IF existing_pct = '{}'::jsonb OR NOT (existing_pct ? leak_div_id::text) THEN
            div_count := jsonb_array_length(div_ids);
            IF div_count <= 0 THEN
                div_count := 1;
                div_ids := jsonb_build_array(leak_div_id::text);
            END IF;

            IF div_count = 1 THEN
                pcts := jsonb_build_object(leak_div_id::text, 100);
            ELSE
                equal_pct := 100 / div_count;
                remainder := 100 - (equal_pct * div_count);
                pcts := '{}'::jsonb;
                idx := 0;
                FOR div_id_text IN SELECT jsonb_array_elements_text(div_ids)
                LOOP
                    IF idx = 0 THEN
                        pcts := pcts || jsonb_build_object(div_id_text, equal_pct + remainder);
                    ELSE
                        pcts := pcts || jsonb_build_object(div_id_text, equal_pct);
                    END IF;
                    idx := idx + 1;
                END LOOP;
            END IF;
        ELSE
            pcts := existing_pct;
        END IF;

        UPDATE projects
        SET project_division_ids = div_ids,
            project_division_percentages = pcts,
            is_leak_investigation = false
        WHERE id = rec.id;
    END LOOP;

    SELECT COUNT(*) INTO post_count
    FROM projects
    WHERE is_leak_investigation = true AND deleted_at IS NULL;

    RAISE NOTICE 'Post-migration leak investigation flag count: %', post_count;
END $$;
