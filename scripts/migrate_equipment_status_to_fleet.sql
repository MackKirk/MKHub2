-- Align equipment.status with fleet asset operational statuses.
UPDATE equipment SET status = 'active' WHERE status IN ('available', 'checked_out');
UPDATE equipment SET status = 'inactive' WHERE status NOT IN ('active', 'inactive', 'maintenance', 'retired');
