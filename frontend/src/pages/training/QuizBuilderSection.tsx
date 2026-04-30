import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const FIELD =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20';
const CARD =
  'rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80 overflow-hidden';
const BTN_GHOST =
  'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 shadow-sm hover:bg-slate-50 disabled:opacity-40';
const BTN_DANGER =
  'inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50';

export type QuizQuestionRow = {
  id: string;
  question_text: string;
  question_type: string;
  order_index: number;
  correct_answer: string;
  options?: string[];
};

type Props = {
  courseId: string;
  quiz: {
    id: string;
    title: string;
    passing_score_percent: number;
    allow_retry: boolean;
    max_attempts?: number | null;
    questions: QuizQuestionRow[];
  };
};

function isSingleType(t: string) {
  return t === 'single_choice' || t === 'multiple_choice';
}

function isMultiSelect(t: string) {
  return t === 'multiple_select';
}

function isTrueFalse(t: string) {
  return t === 'true_false';
}

function parseMultiCorrect(ca: string): Set<number> {
  const s = new Set<number>();
  for (const p of (ca || '').split(',')) {
    const n = parseInt(p.trim(), 10);
    if (!Number.isNaN(n)) s.add(n);
  }
  return s;
}

function sortIndices(ids: Set<number>): string {
  return [...ids]
    .sort((a, b) => a - b)
    .map(String)
    .join(',');
}

export default function QuizBuilderSection({ courseId, quiz }: Props) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['training-admin-course', courseId] });
    queryClient.invalidateQueries({ queryKey: ['training-admin-courses'] });
  };

  const [attemptMode, setAttemptMode] = useState<'unlimited' | 'limited'>(() =>
    quiz.max_attempts == null ? 'unlimited' : 'limited',
  );
  const [attemptCap, setAttemptCap] = useState(() =>
    quiz.max_attempts != null && quiz.max_attempts >= 1 ? quiz.max_attempts : 3,
  );

  useEffect(() => {
    setAttemptMode(quiz.max_attempts == null ? 'unlimited' : 'limited');
    setAttemptCap(quiz.max_attempts != null && quiz.max_attempts >= 1 ? quiz.max_attempts : 3);
  }, [quiz.id, quiz.max_attempts]);

  const currentMaxAttempts = (): number | null =>
    attemptMode === 'unlimited' ? null : Math.max(1, attemptCap);

  const updateQuizMeta = useMutation({
    mutationFn: (payload: { quizId: string; title: string; passing: number; max_attempts: number | null }) =>
      api('PUT', `/training/admin/quizzes/${payload.quizId}`, {
        title: payload.title,
        passing_score_percent: payload.passing,
        max_attempts: payload.max_attempts,
      }),
    onSuccess: () => invalidate(),
  });

  const addQuestion = useMutation({
    mutationFn: (quizId: string) =>
      api('POST', `/training/admin/quizzes/${quizId}/questions`, {
        question_text: 'New question',
        question_type: 'single_choice',
        correct_answer: '0',
        options: ['Option 1', 'Option 2'],
      }),
    onSuccess: () => {
      toast.success('Question added');
      invalidate();
    },
    onError: () => toast.error('Failed to add question'),
  });

  const updateQuestion = useMutation({
    mutationFn: (payload: {
      quizId: string;
      questionId: string;
      body: Partial<{
        question_text: string;
        question_type: string;
        order_index: number;
        correct_answer: string;
        options: string[];
      }>;
    }) => api('PUT', `/training/admin/quizzes/${payload.quizId}/questions/${payload.questionId}`, payload.body),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Failed to save question'),
  });

  const deleteQuestion = useMutation({
    mutationFn: ({ quizId, questionId }: { quizId: string; questionId: string }) =>
      api('DELETE', `/training/admin/quizzes/${quizId}/questions/${questionId}`),
    onSuccess: () => {
      toast.success('Question removed');
      invalidate();
    },
    onError: () => toast.error('Failed to delete question'),
  });

  const reorderQuestions = useMutation({
    mutationFn: ({ quizId, questionIds }: { quizId: string; questionIds: string[] }) =>
      api('POST', `/training/admin/quizzes/${quizId}/questions/reorder`, { question_ids: questionIds }),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Failed to reorder'),
  });

  const sorted = [...(quiz.questions || [])].sort((a, b) => a.order_index - b.order_index);

  const moveQuestion = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= sorted.length) return;
    const ids = sorted.map((q) => q.id);
    const t = ids[index]!;
    ids[index] = ids[j]!;
    ids[j] = t;
    reorderQuestions.mutate({ quizId: quiz.id, questionIds: ids });
  };

  return (
    <div className="space-y-6">
      <div className={`${CARD} bg-gradient-to-br from-slate-50/90 to-white p-5`}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-red/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-red">
            Quiz
          </span>
          <p className="text-sm text-slate-600">
            Build questions like a form — choose type, set answers, reorder anytime.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-slate-500">
            Title
            <input
              className={`${FIELD} mt-1 bg-white`}
              defaultValue={quiz.title}
              key={quiz.id + quiz.title}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t)
                  updateQuizMeta.mutate({
                    quizId: quiz.id,
                    title: t,
                    passing: quiz.passing_score_percent,
                    max_attempts: currentMaxAttempts(),
                  });
              }}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-500">
            Pass at (%)
            <input
              type="number"
              min={0}
              max={100}
              className={`${FIELD} mt-1 bg-white`}
              defaultValue={quiz.passing_score_percent}
              key={quiz.id + String(quiz.passing_score_percent)}
              onBlur={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n))
                  updateQuizMeta.mutate({
                    quizId: quiz.id,
                    title: quiz.title,
                    passing: n,
                    max_attempts: currentMaxAttempts(),
                  });
              }}
            />
          </label>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:col-span-2 lg:col-span-2">
            <div className="text-xs font-semibold text-slate-500">Attempts</div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={`quiz-attempts-${quiz.id}`}
                checked={attemptMode === 'unlimited'}
                onChange={() => {
                  setAttemptMode('unlimited');
                  updateQuizMeta.mutate({
                    quizId: quiz.id,
                    title: quiz.title,
                    passing: quiz.passing_score_percent,
                    max_attempts: null,
                  });
                }}
              />
              Unlimited until the learner passes
            </label>
            <label className="flex flex-wrap cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={`quiz-attempts-${quiz.id}`}
                checked={attemptMode === 'limited'}
                onChange={() => {
                  const cap = Math.max(1, attemptCap);
                  setAttemptMode('limited');
                  setAttemptCap(cap);
                  updateQuizMeta.mutate({
                    quizId: quiz.id,
                    title: quiz.title,
                    passing: quiz.passing_score_percent,
                    max_attempts: cap,
                  });
                }}
              />
              <span>Max submissions:</span>
              <input
                type="number"
                min={1}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                value={attemptCap}
                disabled={attemptMode !== 'limited'}
                onChange={(e) => setAttemptCap(parseInt(e.target.value, 10) || 1)}
                onBlur={() => {
                  if (attemptMode !== 'limited') return;
                  const cap = Math.max(1, parseInt(String(attemptCap), 10) || 1);
                  setAttemptCap(cap);
                  updateQuizMeta.mutate({
                    quizId: quiz.id,
                    title: quiz.title,
                    passing: quiz.passing_score_percent,
                    max_attempts: cap,
                  });
                }}
              />
            </label>
            <p className="text-xs leading-snug text-slate-500">
              After a failed attempt, per-question correct/incorrect feedback stays hidden while the learner still has
              another attempt (so they cannot memorize answers).
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {sorted.map((q, idx) => (
          <article key={q.id} className={CARD}>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <span className="text-sm font-bold text-slate-400">{idx + 1}</span>
              <select
                className={`${FIELD} max-w-[220px] border-slate-200 bg-white py-1.5 text-xs font-semibold`}
                value={isSingleType(q.question_type) ? 'single_choice' : q.question_type}
                onChange={(e) => {
                  const next = e.target.value;
                  const opts = q.options?.length ? [...q.options] : ['Option 1', 'Option 2'];
                  if (next === 'true_false') {
                    updateQuestion.mutate({
                      quizId: quiz.id,
                      questionId: q.id,
                      body: {
                        question_type: 'true_false',
                        correct_answer: 'true',
                      },
                    });
                    return;
                  }
                  if (next === 'single_choice') {
                    updateQuestion.mutate({
                      quizId: quiz.id,
                      questionId: q.id,
                      body: {
                        question_type: 'single_choice',
                        options: opts.slice(0, Math.max(2, opts.length)),
                        correct_answer: '0',
                      },
                    });
                    return;
                  }
                  if (next === 'multiple_select') {
                    updateQuestion.mutate({
                      quizId: quiz.id,
                      questionId: q.id,
                      body: {
                        question_type: 'multiple_select',
                        options: opts.slice(0, Math.max(2, opts.length)),
                        correct_answer: '0,1',
                      },
                    });
                  }
                }}
              >
                <option value="single_choice">Single choice</option>
                <option value="multiple_select">Multiple choice (several correct)</option>
                <option value="true_false">True / False</option>
              </select>
              <div className="ml-auto flex flex-wrap gap-1">
                <button type="button" className={BTN_GHOST} disabled={idx === 0} onClick={() => moveQuestion(idx, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className={BTN_GHOST}
                  disabled={idx === sorted.length - 1}
                  onClick={() => moveQuestion(idx, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={BTN_DANGER}
                  onClick={() => {
                    if (confirm('Delete this question?')) deleteQuestion.mutate({ quizId: quiz.id, questionId: q.id });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Question
                <textarea
                  className={`${FIELD} mt-1 min-h-[88px] resize-y`}
                  defaultValue={q.question_text}
                  key={q.id + q.question_text}
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    if (t && t !== q.question_text)
                      updateQuestion.mutate({ quizId: quiz.id, questionId: q.id, body: { question_text: t } });
                  }}
                />
              </label>

              {isTrueFalse(q.question_type) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500">Correct answer</p>
                  <div className="flex flex-wrap gap-3">
                    {(['true', 'false'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          updateQuestion.mutate({
                            quizId: quiz.id,
                            questionId: q.id,
                            body: { correct_answer: v, question_type: 'true_false' },
                          })
                        }
                        className={`rounded-full border-2 px-5 py-2.5 text-sm font-semibold transition-all ${
                          (q.correct_answer || '').toLowerCase() === v
                            ? 'border-brand-red bg-brand-red text-white shadow-md'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {v === 'true' ? 'True' : 'False'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isSingleType(q.question_type) && (
                <OptionBlockSingle
                  q={q}
                  onUpdate={(body) => updateQuestion.mutate({ quizId: quiz.id, questionId: q.id, body })}
                />
              )}

              {isMultiSelect(q.question_type) && (
                <OptionBlockMulti
                  q={q}
                  onUpdate={(body) => updateQuestion.mutate({ quizId: quiz.id, questionId: q.id, body })}
                />
              )}
            </div>
          </article>
        ))}
      </div>

      <button
        type="button"
        disabled={addQuestion.isPending}
        onClick={() => addQuestion.mutate(quiz.id)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 py-4 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-red/40 hover:bg-brand-red/5 hover:text-brand-red disabled:opacity-50"
      >
        <span className="text-lg leading-none">+</span> Add question
      </button>
    </div>
  );
}

function OptionBlockSingle({
  q,
  onUpdate,
}: {
  q: QuizQuestionRow;
  onUpdate: (body: Record<string, unknown>) => void;
}) {
  const options = q.options?.length ? q.options : ['Option 1', 'Option 2'];
  const correct = parseInt(q.correct_answer, 10);
  const safeCorrect = Number.isNaN(correct) ? 0 : Math.min(Math.max(0, correct), options.length - 1);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500">Options — click the circle next to the correct answer</p>
      <ul className="space-y-2">
        {options.map((opt, i) => (
          <li
            key={`${q.id}-opt-${i}`}
            className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2"
          >
            <button
              type="button"
              title="Mark as correct"
              onClick={() =>
                onUpdate({
                  question_type: 'single_choice',
                  options,
                  correct_answer: String(i),
                })
              }
              className={`mt-1.5 h-5 w-5 shrink-0 rounded-full border-2 ${
                safeCorrect === i ? 'border-brand-red bg-brand-red ring-2 ring-brand-red/25' : 'border-slate-300 bg-white'
              }`}
            />
            <input
              className={`${FIELD} flex-1 bg-white`}
              defaultValue={opt}
              onBlur={(e) => {
                const v = e.target.value.trim();
                const next = [...options];
                next[i] = v || `Option ${i + 1}`;
                onUpdate({
                  question_type: 'single_choice',
                  options: next,
                  correct_answer: String(Math.min(safeCorrect, next.length - 1)),
                });
              }}
            />
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-30"
              disabled={options.length <= 2}
              onClick={() => {
                const next = options.filter((_, j) => j !== i);
                let newCorrect = safeCorrect;
                if (i === safeCorrect) newCorrect = 0;
                else if (i < safeCorrect) newCorrect = safeCorrect - 1;
                onUpdate({
                  question_type: 'single_choice',
                  options: next,
                  correct_answer: String(Math.min(newCorrect, next.length - 1)),
                });
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-xs font-semibold text-brand-red hover:underline"
        onClick={() =>
          onUpdate({
            question_type: 'single_choice',
            options: [...options, `Option ${options.length + 1}`],
            correct_answer: String(safeCorrect),
          })
        }
      >
        Add option
      </button>
    </div>
  );
}

function OptionBlockMulti({
  q,
  onUpdate,
}: {
  q: QuizQuestionRow;
  onUpdate: (body: Record<string, unknown>) => void;
}) {
  const options = q.options?.length ? q.options : ['Option 1', 'Option 2'];
  const selected = parseMultiCorrect(q.correct_answer);

  const toggle = (idx: number) => {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    if (next.size === 0) {
      toast.error('Keep at least one correct answer');
      return;
    }
    onUpdate({
      question_type: 'multiple_select',
      options,
      correct_answer: sortIndices(next),
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500">
        Options — check every correct answer (learners must match all)
      </p>
      <ul className="space-y-2">
        {options.map((opt, i) => (
          <li
            key={`${q.id}-m-${i}`}
            className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2"
          >
            <button
              type="button"
              title="Toggle correct"
              onClick={() => toggle(i)}
              className={`mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                selected.has(i) ? 'border-brand-red bg-brand-red text-white' : 'border-slate-300 bg-white'
              }`}
            >
              {selected.has(i) ? '✓' : ''}
            </button>
            <input
              className={`${FIELD} flex-1 bg-white`}
              defaultValue={opt}
              onBlur={(e) => {
                const v = e.target.value.trim();
                const nextOpts = [...options];
                nextOpts[i] = v || `Option ${i + 1}`;
                const kept = new Set<number>();
                selected.forEach((si) => {
                  if (si < nextOpts.length) kept.add(si);
                });
                if (kept.size === 0) kept.add(0);
                onUpdate({
                  question_type: 'multiple_select',
                  options: nextOpts,
                  correct_answer: sortIndices(kept),
                });
              }}
            />
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-30"
              disabled={options.length <= 2}
              onClick={() => {
                const nextOpts = options.filter((_, j) => j !== i);
                const kept = new Set<number>();
                selected.forEach((si) => {
                  if (si === i) return;
                  if (si > i) kept.add(si - 1);
                  else kept.add(si);
                });
                if (kept.size === 0) kept.add(0);
                onUpdate({
                  question_type: 'multiple_select',
                  options: nextOpts,
                  correct_answer: sortIndices(kept),
                });
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-xs font-semibold text-brand-red hover:underline"
        onClick={() =>
          onUpdate({
            question_type: 'multiple_select',
            options: [...options, `Option ${options.length + 1}`],
            correct_answer: sortIndices(selected),
          })
        }
      >
        Add option
      </button>
    </div>
  );
}
