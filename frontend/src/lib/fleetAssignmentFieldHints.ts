/** fieldHint strings for fleet assign / return modals (Title\n\nBody). */
export const FLEET_ASSIGNMENT_FIELD_HINTS = {
  assigned_to:
    'Name\n\nTeam member receiving this asset. Phone, address, and department pre-fill from their profile when available.',
  phone_snapshot: 'Phone\n\nContact number for this assignment. Edit if different from the profile default.',
  address_snapshot:
    'Address\n\nWhere the assignee is based for this check-out. Suggestions appear as you type.',
  sleeps_snapshot:
    'Sleep\n\nWhere the asset sleeps / is parked for this assignment. Defaults from the asset yard location when set.',
  department_snapshot: 'Department\n\nDepartment or division for this assignment.',
  odometer_out:
    'Odometer out\n\nOdometer reading at check-out. Must be at least the asset’s current odometer when recorded.',
  hours_out: 'Hours out\n\nHour meter reading at check-out for machinery or other hour-based assets.',
  photos_out: 'Image out\n\nPhotos at check-out (condition, damage, etc.). Drag, paste, or choose multiple images.',
  notes_out: 'Notes out\n\nOptional notes recorded with this check-out.',
  odometer_in:
    'Odometer in\n\nOdometer reading at return. Must be at least the odometer recorded at check-out.',
  hours_in: 'Hours in\n\nHour meter reading when the asset is returned.',
  photos_in: 'Images in\n\nPhotos at return. Drag, paste, or choose multiple images.',
  notes_in: 'Notes in\n\nOptional notes recorded with this return.',
} as const;
