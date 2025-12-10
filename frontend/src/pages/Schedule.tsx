import ScheduleCard from '@/components/ScheduleCard';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Schedule() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  
  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Schedule</div>
        <div className="text-sm opacity-90">View and manage your work schedule.</div>
      </div>
      
      {fromHome && (
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/home')}
            className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center gap-2"
            title="Back to Home"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm text-gray-700 font-medium">Back to Home</span>
          </button>
        </div>
      )}
      
      <div className="rounded-xl border bg-white">
        <ScheduleCard />
      </div>
    </div>
  );
}

