import { useMemo } from 'react';

type WelcomeVariant = 'self' | 'supervisor';

function RatingScaleTable() {
  const rows = useMemo(
    () =>
      [
        { score: '5', title: 'Outstanding', detail: 'Goes above and beyond what is expected.' },
        { score: '4', title: 'Above average', detail: 'Often exceeds expectations.' },
        { score: '3', title: 'Meets expectations', detail: 'Reliable and consistent.' },
        { score: '2', title: 'Needs improvement', detail: 'Requires more support or follow-up.' },
        { score: '1', title: 'Not meeting standards', detail: 'Serious gaps in conduct or results.' },
      ] as const,
    []
  );

  return (
    <div className="overflow-x-auto text-sm">
      <table className="w-full min-w-[240px] text-left text-gray-800">
        <thead>
          <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-2">Score</th>
            <th className="py-2 pr-2">Meaning</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.score}>
              <td className="py-2 pr-2 align-top font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                {r.score}
              </td>
              <td className="py-2 align-top">
                <span className="font-medium text-gray-900">{r.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-gray-600">{r.detail}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        If a question uses a different scale or words, follow the labels on that question.
      </p>
    </div>
  );
}

/** Collapsible on small screens; sticky sidebar on large screens. */
export function EmployeeReviewRatingScalePanel() {
  return (
    <>
      <details className="mb-3 rounded-xl border border-gray-200 bg-gray-50/95 shadow-sm lg:hidden">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-gray-900">
          <span className="flex items-center justify-between gap-2">
            Rating guide (1–5)
            <span className="text-xs font-normal text-gray-500">Tap to open</span>
          </span>
        </summary>
        <div className="border-t border-gray-200 px-3 py-3">
          <RatingScaleTable />
        </div>
      </details>
      <aside className="hidden lg:block lg:sticky lg:top-2 lg:self-start">
        <div className="rounded-xl border border-gray-200 bg-gray-50/95 shadow-sm">
          <div className="border-b border-gray-200 bg-gray-100/90 px-3 py-2">
            <h4 className="text-sm font-semibold text-gray-900">Rating guide</h4>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-600">Use this when you see a 1–5 score.</p>
          </div>
          <div className="p-3">
            <RatingScaleTable />
          </div>
        </div>
      </aside>
    </>
  );
}

type WelcomeProps = {
  open: boolean;
  variant: WelcomeVariant;
  /** Supervisor flow: employee being evaluated */
  revieweeDisplayName?: string;
  onContinue: () => void;
};

/**
 * Full-height overlay inside the review modal. Plain language for people who are not comfortable with technology.
 */
export function EmployeeReviewWelcomeOverlay({ open, variant, revieweeDisplayName, onContinue }: WelcomeProps) {
  if (!open) return null;

  const name = (revieweeDisplayName || 'this employee').trim();

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/97 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-welcome-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-lg sm:p-6">
        <h2 id="review-welcome-title" className="text-lg font-bold text-gray-900 sm:text-xl">
          Before you begin
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Please read this short page once. You can open the rating guide on the side (or at the top on a phone) any
          time.
        </p>

        {variant === 'self' ? (
          <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-gray-800">
            <li>This review is about your own performance and growth, not anyone else&apos;s.</li>
            <li>
              <strong className="font-semibold text-gray-900">Finish in one visit if you can.</strong> If you close this
              window before you press <strong className="font-semibold">Submit</strong> at the bottom, your answers may
              not be saved.
            </li>
            <li>Answer as honestly as you can. This helps your manager and HR support you.</li>
            <li>If you see numbers 1 to 5, use the rating guide so the numbers mean the same thing for everyone.</li>
          </ul>
        ) : (
          <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-gray-800">
            <li>
              You are reviewing <strong className="font-semibold text-gray-900">{name}</strong> for this cycle. Your
              answers should describe <em>their</em> work, not yours.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">Try to complete this in one visit.</strong> Use{' '}
              <strong className="font-semibold">Submit</strong> at the bottom when you are finished. Closing early may
              lose unsaved answers.
            </li>
            <li>Be fair and specific. Your input becomes part of the employee&apos;s review record.</li>
            <li>
              Tap the <strong className="font-semibold">speech bubble</strong> next to a question when you want a short
              supervisor note.
            </li>
            <li>For 1–5 scores, use the rating guide on the side (or under &quot;Rating guide&quot; on a phone).</li>
          </ul>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95 sm:w-auto sm:px-6"
          >
            Continue to the form
          </button>
        </div>
      </div>
    </div>
  );
}
