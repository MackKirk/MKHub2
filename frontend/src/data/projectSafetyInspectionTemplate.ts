/** MKI Safety Inspection Report — template version aligned with backend `template_version` */
export const SAFETY_TEMPLATE_VERSION = 'mki_safety_v1';

export type SafetyItemKind = 'yes_no_na' | 'text' | 'textarea' | 'checkboxes' | 'subheading' | 'hint';

export type SafetyTemplateItem =
  | { kind: 'subheading'; id: string; label: string }
  | { kind: 'hint'; id: string; text: string }
  | { key: string; label: string; kind: 'yes_no_na'; commentsField?: boolean }
  | { key: string; label: string; kind: 'text'; placeholder?: string }
  | { key: string; label: string; kind: 'textarea'; placeholder?: string }
  | { key: string; label: string; kind: 'checkboxes'; options: string[] };

export type SafetyTemplateSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: SafetyTemplateItem[];
};

/**
 * Structured to match the MKI PDF topics 1–9 (Safety Inspection Report).
 * Subheadings mirror in-form section titles (Hazards identified, PPE, etc.).
 */
export const PROJECT_SAFETY_INSPECTION_TEMPLATE: SafetyTemplateSection[] = [
  {
    id: 's1_general',
    title: '1. General information',
    subtitle: 'Information',
    items: [
      { key: 'project_name', label: 'Project name', kind: 'text' },
      { key: 'project_location', label: 'Project location', kind: 'text' },
      { key: 'inspection_type', label: 'Type of inspection', kind: 'text', placeholder: 'e.g. Daily' },
      { key: 'site_manager', label: 'Site manager', kind: 'text' },
      { key: 'site_foreman', label: 'Site foreman', kind: 'text' },
    ],
  },
  {
    id: 's2_crew_work',
    title: '2. Crew & work activities',
    items: [
      { key: 'worker_participating', label: 'Worker participating in inspection', kind: 'text' },
      {
        key: 'crews_present',
        label: 'Crews present (check all that apply)',
        kind: 'checkboxes',
        options: ['Repairs & Maintenance', 'Construction', 'Service / other', 'Subcontractor crew'],
      },
      { key: 'crew_inspected', label: 'Crew inspected', kind: 'text' },
      { key: 'work_being_performed', label: 'Work being performed', kind: 'textarea' },
      { key: 'other_crew_notes', label: 'Other', kind: 'textarea' },
    ],
  },
  {
    id: 's3_hazard_verification',
    title: '3. Hazard verification',
    items: [
      { kind: 'subheading', id: 's3_hazards_identified', label: 'Hazards identified' },
      { key: 'hv_working_at_heights', label: 'Working at heights', kind: 'yes_no_na', commentsField: true },
      { key: 'hv_hot_work', label: 'Hot work', kind: 'yes_no_na', commentsField: true },
      { key: 'hv_electrical_lockout', label: 'Electrical / lockout', kind: 'yes_no_na', commentsField: true },
      { key: 'hv_material_handling', label: 'Material handling / hoisting', kind: 'yes_no_na', commentsField: true },
      { key: 'hv_mobile_equipment', label: 'Mobile equipment', kind: 'yes_no_na', commentsField: true },
      { key: 'hv_hazardous_materials', label: 'Hazardous materials', kind: 'yes_no_na', commentsField: true },
      { key: 'hazards_identified_comments', label: 'Comments', kind: 'textarea' },
      { kind: 'subheading', id: 's3_controls', label: 'Controls in place' },
      { key: 'ctrl_ppe_appropriate', label: 'PPE appropriate and used', kind: 'yes_no_na', commentsField: true },
      { key: 'ctrl_fall_protection', label: 'Fall protection in place', kind: 'yes_no_na', commentsField: true },
      { key: 'ctrl_anchors_lifelines', label: 'Anchors/lifelines adequate', kind: 'yes_no_na', commentsField: true },
      { key: 'ctrl_rescue_plan', label: 'Rescue plan available', kind: 'yes_no_na', commentsField: true },
      { key: 'ctrl_permits_completed', label: 'Permits completed', kind: 'yes_no_na', commentsField: true },
    ],
  },
  {
    id: 's4_site_conditions',
    title: '4. Site conditions',
    items: [
      { key: 'sc_work_area_controlled', label: 'Work area controlled', kind: 'yes_no_na', commentsField: true },
      { kind: 'subheading', id: 's4_ppe', label: 'PPE' },
      { key: 'ppe_good_condition', label: 'PPE in good condition', kind: 'yes_no_na', commentsField: true },
      { key: 'ppe_appropriate_task', label: 'PPE appropriate for task', kind: 'yes_no_na', commentsField: true },
      { kind: 'subheading', id: 's4_fall', label: 'Fall protection' },
      { key: 'fp_guardrails', label: 'Guardrails in place', kind: 'yes_no_na', commentsField: true },
      { key: 'fp_workers_tied_off', label: 'Workers tied off properly', kind: 'yes_no_na', commentsField: true },
      { key: 'fp_anchors_rated', label: 'Anchors rated and verified', kind: 'yes_no_na', commentsField: true },
      { key: 'fp_lifelines_correct', label: 'Lifelines installed correctly', kind: 'yes_no_na', commentsField: true },
      { key: 'fp_roof_access_safe', label: 'Roof access safe', kind: 'yes_no_na', commentsField: true },
      { key: 'fp_leading_edge', label: 'Leading edge protection in place', kind: 'yes_no_na', commentsField: true },
      { key: 'fp_ladder_secured', label: 'Ladder secured and extends 3 ft above landing', kind: 'yes_no_na', commentsField: true },
      { kind: 'subheading', id: 's4_tools', label: 'Tools and equipment' },
      { key: 'te_tools_good', label: 'Tools in good condition', kind: 'yes_no_na', commentsField: true },
      { key: 'te_guards_in_place', label: 'Guards in place', kind: 'yes_no_na', commentsField: true },
      { key: 'te_cords_gfci', label: 'Cords/GFCI in good condition', kind: 'yes_no_na', commentsField: true },
      { key: 'te_operators_competent', label: 'Operators competent', kind: 'yes_no_na', commentsField: true },
      { kind: 'subheading', id: 's4_hot_work', label: 'Hot work (if applicable)' },
      { key: 'hw_permit_completed', label: 'Permit completed', kind: 'yes_no_na', commentsField: true },
      { key: 'hw_fire_watch', label: 'Fire watch assigned', kind: 'yes_no_na', commentsField: true },
      { key: 'hw_extinguisher', label: 'Fire extinguisher available', kind: 'yes_no_na', commentsField: true },
      { key: 'hw_combustibles', label: 'Combustibles controlled', kind: 'yes_no_na', commentsField: true },
      { kind: 'subheading', id: 's4_housekeeping', label: 'Housekeeping' },
      { key: 'hk_work_area_clean', label: 'Work area clean', kind: 'yes_no_na', commentsField: true },
      { key: 'hk_materials_stacked', label: 'Materials stacked safely', kind: 'yes_no_na', commentsField: true },
      { key: 'hk_walkways_clear', label: 'Walkways clear', kind: 'yes_no_na', commentsField: true },
      { key: 'hk_debris_nails', label: 'Debris/nails controlled', kind: 'yes_no_na', commentsField: true },
      { kind: 'subheading', id: 's4_environmental', label: 'Environmental' },
      { key: 'env_waste_disposed', label: 'Waste disposed properly', kind: 'yes_no_na', commentsField: true },
    ],
  },
  {
    id: 's5_worker_knowledge',
    title: '5. Worker knowledge verification',
    subtitle: 'Ask the worker the following questions.',
    items: [
      {
        key: 'wk_explain_hazards',
        label: 'Worker can explain hazards of task',
        kind: 'yes_no_na',
        commentsField: true,
      },
      { key: 'wk_explain_hazards_answer', label: 'Answer', kind: 'textarea', placeholder: 'Hazards of task' },
      {
        key: 'wk_explain_controls',
        label: 'Worker can explain controls in place',
        kind: 'yes_no_na',
        commentsField: true,
      },
      { key: 'wk_explain_controls_answer', label: 'Answer', kind: 'textarea', placeholder: 'Controls in place' },
      {
        key: 'wk_understands_ppe',
        label: 'Worker understands PPE requirements',
        kind: 'yes_no_na',
        commentsField: true,
      },
      { key: 'wk_understands_ppe_answer', label: 'Answer', kind: 'textarea', placeholder: 'PPE' },
      {
        key: 'wk_understands_permits',
        label: 'Worker understands permits/forms',
        kind: 'yes_no_na',
        commentsField: true,
      },
      { key: 'wk_understands_permits_answer', label: 'Answers', kind: 'textarea', placeholder: 'Permits/forms' },
      {
        key: 'wk_emergency',
        label: 'Worker knows what to do in emergency',
        kind: 'yes_no_na',
        commentsField: true,
      },
      { key: 'wk_emergency_answer', label: 'Answer', kind: 'textarea', placeholder: 'Emergency' },
      { key: 'wk_worker_comments', label: 'Worker comments / concerns', kind: 'textarea' },
      { key: 'wk_section_comments', label: 'Comments', kind: 'textarea' },
    ],
  },
  {
    id: 's6_safety_documentation',
    title: '6. Safety documentation & communication',
    items: [
      { key: 'doc_sds_available', label: 'SDS available', kind: 'yes_no_na', commentsField: true },
      { key: 'doc_workers_aware_hazards', label: 'Workers aware of hazards', kind: 'yes_no_na', commentsField: true },
      { key: 'doc_comments', label: 'Comments', kind: 'textarea' },
      {
        kind: 'hint',
        id: 's6_purpose',
        text:
          'Purpose: Results from this section are used to identify training gaps and determine required toolbox talks or refresher training.',
      },
      { key: 'wk_daily_site_plan', label: 'Daily site safety plan / daily hazard assessment', kind: 'yes_no_na', commentsField: true },
      { key: 'wk_participated_hazard_assessment', label: 'Workers participated in hazard assessment', kind: 'yes_no_na', commentsField: true },
      { key: 'wk_toolbox_talk', label: 'Toolbox talk completed', kind: 'yes_no_na', commentsField: true },
    ],
  },
  {
    id: 's7_multi_crew',
    title: '7. Multi-crew coordination',
    items: [
      { kind: 'subheading', id: 's7_toolbox', label: 'Toolbox talk' },
      { key: 'mc_toolbox_worker_aware', label: 'Worker aware of site hazards', kind: 'yes_no_na', commentsField: true },
      { key: 'mc_toolbox_other', label: 'Other', kind: 'textarea' },
      { key: 'mc_crews_aware', label: 'Crews aware of each other', kind: 'yes_no_na', commentsField: true },
      { key: 'mc_areas_separated', label: 'Work areas separated', kind: 'yes_no_na', commentsField: true },
      { key: 'mc_no_conflicting', label: 'No conflicting work', kind: 'yes_no_na', commentsField: true },
      { key: 'mc_supervisors_communicating', label: 'Supervisors communicating', kind: 'yes_no_na', commentsField: true },
      { key: 'mc_overhead_controlled', label: 'Overhead hazards controlled', kind: 'yes_no_na', commentsField: true },
      { key: 'mc_comments', label: 'Comments', kind: 'textarea' },
    ],
  },
  {
    id: 's8_emergency',
    title: '8. Emergency preparedness & first aid',
    items: [
      { key: 'em_posted', label: 'Emergency procedures posted', kind: 'yes_no_na', commentsField: true },
      { key: 'em_workers_know', label: 'Workers know emergency procedures', kind: 'yes_no_na', commentsField: true },
      { key: 'em_first_aid_kit', label: 'First aid kit available', kind: 'yes_no_na', commentsField: true },
      { key: 'em_first_aid_attendant', label: 'First aid attendant on site', kind: 'yes_no_na', commentsField: true },
      { key: 'em_first_aid_adequate', label: 'First aid adequate for crew size', kind: 'yes_no_na', commentsField: true },
      { key: 'em_comments', label: 'Comments', kind: 'textarea' },
    ],
  },
  {
    id: 's9_hazards_corrective',
    title: '9. Hazards & corrective actions',
    items: [
      { key: 'ca_hazards_identified', label: 'Hazards identified', kind: 'textarea' },
      { key: 'ca_corrective_action', label: 'Corrective action required', kind: 'textarea' },
      { key: 'ca_crew_informed', label: 'Crew informed', kind: 'yes_no_na', commentsField: true },
      { key: 'ca_person_responsible', label: 'Person responsible', kind: 'text' },
    ],
  },
  {
    id: 'signatures',
    title: 'Signatures — inspection sign-off',
    items: [
      { key: 'so_target_completion', label: 'Target completion date', kind: 'text' },
      { key: 'so_follow_up_required', label: 'Follow-up required?', kind: 'yes_no_na', commentsField: true },
      { key: 'so_follow_up_other', label: 'Other', kind: 'textarea' },
      {
        key: 'so_inspector_acknowledgement',
        label:
          'Inspector acknowledgement: I confirm that this inspection was conducted in accordance with company safety procedures, WorkSafeBC regulations, and COR requirements. Hazards, controls, and worker understanding were reviewed, and any deficiencies identified have been documented, communicated, and assigned for corrective action.',
        kind: 'textarea',
      },
      {
        key: 'so_worker_acknowledgement',
        label:
          'Worker participation acknowledgement: I confirm that I participated in this inspection, understand the hazards and controls related to my work, and was given the opportunity to ask questions and provide input regarding site safety.',
        kind: 'textarea',
      },
    ],
  },
];

export type YesNoNa = 'yes' | 'no' | 'na';

export type YesNoNaEntry = { status?: YesNoNa | ''; comments?: string };
