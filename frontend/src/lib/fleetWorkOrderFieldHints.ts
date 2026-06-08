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
  check_in_date:
    'Date\n\nCalendar date when service work started. Adjust if work began on a different day.',
  check_in_time: 'Time\n\nTime of day when service work started.',
  check_out_date:
    'Date\n\nCalendar date when service work finished. Adjust if completion was on a different day.',
  check_out_time: 'Time\n\nTime of day when service work finished.',
  odometer_reading:
    'Odometer reading\n\nOptional odometer on the linked asset when service starts or ends. Saved on the work order.',
  hours_reading:
    'Hours reading\n\nOptional hour meter reading for machinery or hour-based assets. Saved on the work order.',
  cost_name: 'Name\n\nShort label for this cost line (labor, part, or expense).',
  cost_amount: 'Price ($)\n\nDollar amount for this line item. Totals update when you save.',
} as const;
