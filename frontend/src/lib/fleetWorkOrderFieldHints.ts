/** fieldHint strings for fleet work order create forms. */
export const FLEET_WORK_ORDER_FIELD_HINTS = {
  entity_type:
    'Entity type\n\nWhether this work order applies to a fleet vehicle or equipment.',
  vehicle:
    'Vehicle\n\nFleet asset this work order applies to. Required for work orders shown on the schedule.',
  category: 'Category\n\nType of work (maintenance, repair, inspection, other).',
  urgency: 'Urgency\n\nPriority for scheduling and follow-up (low through urgent).',
  assigned_to: 'Assigned to\n\nTeam member responsible for the work order. Leave unassigned if not known yet.',
  description: 'Description / notes\n\nDescribe the issue, work needed, and any context. Required.',
  scheduled_date:
    'Scheduled date\n\nService date shown on the fleet calendar. Leave blank if not scheduled yet.',
  scheduled_time: 'Time\n\nOptional start time used with the scheduled date (defaults to 9:00 AM if omitted).',
  estimated_duration:
    'Estimated duration (min)\n\nExpected length of the service in minutes for calendar planning.',
  body_repair_required: 'Body repair required\n\nFlag when exterior/body work is needed for this service.',
  new_stickers_applied: 'New decals required\n\nFlag when new decals or stickers must be applied.',
} as const;
