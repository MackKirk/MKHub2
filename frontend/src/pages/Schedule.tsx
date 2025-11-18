import ScheduleCard from '@/components/ScheduleCard';

export default function Schedule() {
  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Schedule</div>
        <div className="text-sm opacity-90">View and manage your work schedule.</div>
      </div>
      
      <div className="rounded-xl border bg-white">
        <ScheduleCard />
      </div>
    </div>
  );
}

