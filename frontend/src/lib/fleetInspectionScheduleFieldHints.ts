/** fieldHint strings for fleet inspection schedule forms. */
export const FLEET_INSPECTION_SCHEDULE_FIELD_HINTS = {
  vehicle:
    'Vehicle\n\nFleet asset this inspection schedule applies to. Locked when scheduling from an asset detail page.',
  scheduled_at:
    'Date\n\nPlanned inspection date. Creates pending Body and Mechanical inspections for this schedule.',
  urgency: 'Urgency\n\nPriority for scheduling and follow-up (low through urgent).',
  category: 'Category\n\nWork category label stored on the schedule (typically Inspection).',
  notes: 'Notes\n\nOptional internal notes for the schedule.',
} as const;
