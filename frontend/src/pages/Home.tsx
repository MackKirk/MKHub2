import ScheduleCard from '@/components/ScheduleCard';
import TaskBoard from '@/components/TaskBoard';
import MyTasks from '@/components/MyTasks';
import { useState } from 'react';

export default function Home(){
  const [activeSection, setActiveSection] = useState<'schedule' | 'tasks'>('schedule');
  
  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Home</div>
        <div className="text-sm opacity-90">Overview, quick links and shortcuts.</div>
      </div>
      
      {/* Section Toggle */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveSection('schedule')}
          className={`px-4 py-2 rounded-t-lg transition-colors ${
            activeSection === 'schedule'
              ? 'bg-white border-t border-l border-r text-gray-900 font-medium'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Schedule
        </button>
        <button
          onClick={() => setActiveSection('tasks')}
          className={`px-4 py-2 rounded-t-lg transition-colors ${
            activeSection === 'tasks'
              ? 'bg-white border-t border-l border-r text-gray-900 font-medium'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Tasks
        </button>
      </div>
      
      {/* Content */}
      {activeSection === 'schedule' ? (
        <div className="grid grid-cols-3 gap-4" style={{ minHeight: '600px' }}>
          {/* Schedule Card - 2/3 width */}
          <div className="col-span-2">
            <ScheduleCard />
          </div>
          
          {/* Task Board (Pending Attendances) - 1/3 width */}
          <div className="col-span-1">
            <TaskBoard />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-6">
          <MyTasks />
        </div>
      )}
    </div>
  );
}


