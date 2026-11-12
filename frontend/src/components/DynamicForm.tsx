/**
 * Shared Form Engine renderer alias.
 * Implementation remains in DynamicSafetyForm (Safety + Employee Reviews + Fieldwork).
 * Prefer importing DynamicForm for new Fieldwork code.
 */
export { default } from '@/components/DynamicSafetyForm';
export { default as DynamicForm } from '@/components/DynamicSafetyForm';
export type { SafetyFieldFlagState } from '@/components/DynamicSafetyForm';
