type ClockActionTileProps = {
  kind: 'in' | 'out';
  enabled: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
};

function ClockActionIcon({ kind, enabled }: { kind: 'in' | 'out'; enabled: boolean }) {
  const toneClass = enabled
    ? kind === 'in'
      ? 'bg-green-600 text-white'
      : 'bg-red-600 text-white'
    : 'bg-gray-300 text-gray-500';

  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
        {kind === 'in' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 12h-3m3 0l-2 2m2-2l-2-2" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h3m-3 0l2 2m-2-2l2-2" />
        )}
      </svg>
    </div>
  );
}

export function ClockActionTile({ kind, enabled, disabled = false, onClick, title }: ClockActionTileProps) {
  const interactive = enabled && !disabled;
  const isIn = kind === 'in';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      title={title}
      className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
        interactive
          ? isIn
            ? 'cursor-pointer border-green-200 bg-green-50/50 hover:border-green-300 hover:bg-green-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]'
            : 'cursor-pointer border-red-200 bg-red-50/50 hover:border-red-300 hover:bg-red-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]'
          : 'cursor-not-allowed border-gray-200 bg-gray-50/50 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        <ClockActionIcon kind={kind} enabled={interactive} />
        <div className="min-w-0 flex-1">
          <div className={`mb-1 text-base font-semibold ${interactive ? 'text-gray-900' : 'text-gray-400'}`}>
            {isIn ? 'Clock In' : 'Clock Out'}
          </div>
          <div className={`text-xs ${interactive ? 'text-gray-600' : 'text-gray-400'}`}>
            {isIn ? 'Start tracking your work time' : 'End your current work session'}
          </div>
        </div>
      </div>
    </button>
  );
}

