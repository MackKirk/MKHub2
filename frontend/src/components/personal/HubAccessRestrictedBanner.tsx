import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { uiCx } from '@/components/ui';

type HubAccessRestrictedBannerProps = {
  className?: string;
  showSignNow?: boolean;
};

export default function HubAccessRestrictedBanner({
  className,
  showSignNow = false,
}: HubAccessRestrictedBannerProps) {
  const navigate = useNavigate();

  return (
    <div
      className={uiCx(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3',
        className,
      )}
      role="alert"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
          <Lock className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">Hub access restricted</p>
          <p className="text-sm text-red-800">
            An overdue signature requires your attention. Sign the overdue document to restore access.
          </p>
        </div>
      </div>
      {showSignNow ? (
        <button
          type="button"
          onClick={() => navigate('/personal/signatures')}
          className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
        >
          Sign now
        </button>
      ) : null}
    </div>
  );
}
