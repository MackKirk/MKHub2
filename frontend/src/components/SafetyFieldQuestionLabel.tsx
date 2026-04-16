import { fieldShowsRequiredIndicator, type SafetyFormField } from '@/types/safetyFormTemplate';

/** Question label with visible required marker for respondents. */
export function SafetyFieldQuestionLabel({
  field,
  className,
  as: Wrapper = 'div',
}: {
  field: SafetyFormField;
  className: string;
  as?: 'div' | 'span';
}) {
  if (!fieldShowsRequiredIndicator(field)) {
    return <Wrapper className={className}>{field.label}</Wrapper>;
  }
  return (
    <Wrapper className={className}>
      <span className="inline-flex flex-wrap items-baseline gap-x-1">
        <span>{field.label}</span>
        <span className="text-red-600 font-semibold" aria-hidden>
          *
        </span>
        <span className="sr-only"> (required)</span>
      </span>
    </Wrapper>
  );
}
