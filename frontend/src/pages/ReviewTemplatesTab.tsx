import FormTemplatesPage from './FormTemplatesPage';

export default function ReviewTemplatesTab() {
  return (
    <div className="max-w-6xl min-w-0">
      <p className="text-sm text-gray-600 mb-4">
        Create and edit templates for review cycles. Uses the same builder as Safety forms (sections, field types, preview, custom lists).
      </p>
      <FormTemplatesPage variant="employee_review" embedded />
    </div>
  );
}
