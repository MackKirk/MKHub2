import type { Task } from './types';
import { getStatusBadgeClass, getStatusLabel, getTaskSourceLabel, priorityDot } from './taskUi';

type Props = {
  task: Task;
  onClick: () => void;
};

export default function TaskCard({ task, onClick }: Props) {
  const source = getTaskSourceLabel(task);
  const statusLabel = getStatusLabel(task.status);
  const dotClass = priorityDot[task.priority] || priorityDot.normal;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-gray-200/60 shadow-sm hover:bg-gray-50 transition-colors px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900 truncate">{task.title}</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-600 font-medium">{source}</div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className={`text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border ${getStatusBadgeClass(
                  task.status
                )}`}
              >
                {statusLabel}
              </span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${dotClass}`}
                title={`Priority: ${task.priority || 'normal'}`}
                aria-label={`Priority: ${task.priority || 'normal'}`}
              />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

