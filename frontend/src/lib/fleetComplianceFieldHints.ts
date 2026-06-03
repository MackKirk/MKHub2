/** fieldHint strings for fleet compliance create/edit forms. */
export const FLEET_COMPLIANCE_FIELD_HINTS = {
  record_type:
    'Record type\n\nCertification category (CVIP, CRANE, NDT, PROPANE, or OTHER).',
  facility: 'Facility\n\nShop or location where the inspection or certification was completed.',
  completed_by: 'Completed by\n\nInspector or technician name on the record.',
  equipment_classification:
    'Equipment classification\n\nClass or rating for the equipment (when applicable).',
  equipment_make_model:
    'Equipment make / model\n\nMake and model of the certified equipment.',
  serial_number: 'Serial number\n\nEquipment serial number for traceability.',
  annual_inspection_date:
    'Annual inspection date\n\nDate of the last annual inspection (if tracked separately from expiry).',
  expiry_date: 'Expiry date\n\nWhen this certification expires. Used for due/overdue status on the asset.',
  file_reference_number:
    'File reference number\n\nInternal file or document reference for this record.',
  notes: 'Notes\n\nAdditional context, conditions, or follow-up items.',
} as const;
