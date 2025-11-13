import ScheduleCard from '@/components/ScheduleCard';
import TaskBoard from '@/components/TaskBoard';

export default function Home(){
  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Home</div>
        <div className="text-sm opacity-90">Overview, quick links and shortcuts.</div>
      </div>
      
      {/* Main Content: Schedule (2/3) and Task Board (1/3) */}
      <div className="grid grid-cols-3 gap-4" style={{ minHeight: '600px' }}>
        {/* Schedule Card - 2/3 width */}
        <div className="col-span-2">
          <ScheduleCard />
        </div>
        
        {/* Task Board - 1/3 width */}
        <div className="col-span-1">
          <TaskBoard />
        </div>
      </div>
    </div>
  );
}


