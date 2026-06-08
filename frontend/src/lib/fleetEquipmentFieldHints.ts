/** fieldHint strings for equipment create/edit forms. */
export const FLEET_EQUIPMENT_FIELD_HINTS = {
  name: 'Name\n\nDisplay name for this item in lists and checkout.',
  unit_number: 'Unit Number\n\nInternal ID or tag number used to track the item. Required.',
  category:
    'Category\n\nEquipment type (generator, tool, electronics, small tool, or safety).',
  serial_number: 'Serial Number\n\nManufacturer serial number for warranty and search.',
  brand: 'Brand\n\nManufacturer or brand name.',
  model: 'Model\n\nModel name or number from the manufacturer.',
  value: 'Value ($)\n\nPurchase or insured value in dollars (optional).',
  warranty_expiry: 'Warranty Expiry\n\nDate warranty coverage ends, if applicable.',
  purchase_date: 'Purchase Date\n\nDate the item was acquired.',
  status:
    'Status\n\nActive items can be assigned. Inactive, maintenance, or retired limits use.',
  notes: 'Notes\n\nOptional details, location, or maintenance notes.',
} as const;
