-- Migration: add workshop/revision scheduling columns to work_orders
-- Run manually on PostgreSQL if needed.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'scheduled_start_at') THEN
        ALTER TABLE work_orders ADD COLUMN scheduled_start_at TIMESTAMPTZ;
        RAISE NOTICE 'Column scheduled_start_at added to work_orders';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'scheduled_end_at') THEN
        ALTER TABLE work_orders ADD COLUMN scheduled_end_at TIMESTAMPTZ;
        RAISE NOTICE 'Column scheduled_end_at added to work_orders';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'estimated_duration_minutes') THEN
        ALTER TABLE work_orders ADD COLUMN estimated_duration_minutes INTEGER;
        RAISE NOTICE 'Column estimated_duration_minutes added to work_orders';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'check_in_at') THEN
        ALTER TABLE work_orders ADD COLUMN check_in_at TIMESTAMPTZ;
        RAISE NOTICE 'Column check_in_at added to work_orders';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'check_out_at') THEN
        ALTER TABLE work_orders ADD COLUMN check_out_at TIMESTAMPTZ;
        RAISE NOTICE 'Column check_out_at added to work_orders';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'body_repair_required') THEN
        ALTER TABLE work_orders ADD COLUMN body_repair_required BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Column body_repair_required added to work_orders';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'new_stickers_applied') THEN
        ALTER TABLE work_orders ADD COLUMN new_stickers_applied BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Column new_stickers_applied added to work_orders';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'quote_file_ids') THEN
        ALTER TABLE work_orders ADD COLUMN quote_file_ids JSONB;
        RAISE NOTICE 'Column quote_file_ids added to work_orders';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_order_scheduled_start ON work_orders (scheduled_start_at) WHERE scheduled_start_at IS NOT NULL;
