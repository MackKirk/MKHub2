import ScheduleCard from '@/components/ScheduleCard';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMemo } from 'react';

export default function Schedule() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);
  
  return (
    <div className="space-y-4 min-h-screen">
      {/* Title Bar - same layout and font sizes as Projects / Customers */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">Schedule</div>
              <div className="text-xs text-gray-500 mt-0.5">View and manage your work schedule</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>
      
      <ScheduleCard />
    </div>
  );
}

