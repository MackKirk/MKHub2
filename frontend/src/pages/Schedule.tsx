import ScheduleCard from '@/components/ScheduleCard';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMemo } from 'react';

export default function Schedule() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);
  
  return (
    <div className="space-y-6 min-h-screen">
      {/* Page Header */}
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Schedule</div>
          <div className="text-sm text-gray-500 font-medium">View and manage your work schedule</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      
      <ScheduleCard />
    </div>
  );
}

