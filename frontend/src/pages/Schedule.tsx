import ScheduleCard from '@/components/ScheduleCard';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Schedule() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  
  return (
    <div className="space-y-6 min-h-screen">
      {/* Page Header */}
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1.5">Schedule</h1>
        <p className="text-sm text-gray-600 font-medium">View and manage your work schedule</p>
      </div>
      
      <ScheduleCard />
    </div>
  );
}

