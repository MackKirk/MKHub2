/**
 * Shared Form Engine types (alias of safetyFormTemplate).
 * Prefer these names for Fieldwork and new shared code.
 */
export type {
  SafetyFormFieldType as FormFieldType,
  SafetyFormField as FormField,
  SafetyFormSection as FormSection,
  SafetyFormDefinition as FormDefinition,
  VisibilityWhen,
  OptionsSourceCustomList,
  FieldTypeOption,
  SignatureRolePolicy,
} from '@/types/safetyFormTemplate';

export {
  DEFAULT_DEFINITION,
  FIELD_TYPE_OPTIONS,
  fieldShowsRequiredIndicator,
  isFieldVisible,
  normalizeDefinition,
  validateDynamicFormMissing,
  validateDynamicForm,
  collectPassFailNaKeysOrdered,
  computePftAggregate,
  DYNAMIC_FORM_WORKER_SIGNATURE_HIGHLIGHT_KEY,
} from '@/types/safetyFormTemplate';

/** Template categories shared with backend app.services.form_engine */
export const FORM_TEMPLATE_CATEGORIES = {
  inspection: 'inspection',
  follow_up: 'follow_up',
  employee_review: 'employee_review',
  site_assessment: 'site_assessment',
  work_report: 'work_report',
} as const;

export type FormTemplateCategory =
  (typeof FORM_TEMPLATE_CATEGORIES)[keyof typeof FORM_TEMPLATE_CATEGORIES];

export const SAFETY_TEMPLATE_CATEGORIES = new Set<string>([
  FORM_TEMPLATE_CATEGORIES.inspection,
  FORM_TEMPLATE_CATEGORIES.follow_up,
]);

export const FIELDWORK_TEMPLATE_CATEGORIES = new Set<string>([
  FORM_TEMPLATE_CATEGORIES.site_assessment,
  FORM_TEMPLATE_CATEGORIES.work_report,
]);
