import { useState } from 'react';
import ScheduleModal from '@/components/ScheduleModal';

export default function Home(){
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Home</div>
        <div className="text-sm opacity-90">Overview, quick links and shortcuts.</div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-2">Inbox</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border rounded p-2"><span>Proposal awaiting review</span><span className="text-red-700 bg-red-50 border border-red-200 px-2 rounded-full">2</span></div>
            <div className="flex justify-between border rounded p-2"><span>Time entry approval</span><span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 rounded-full">Pending</span></div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-2">Company News</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="border rounded p-2">Welcome our new PMs to the team</div>
            <div className="border rounded p-2">Safety training next week</div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-3">Quick Links</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <a className="border rounded p-2" href="/customers">Customers</a>
            <a className="border rounded p-2" href="/proposals">Proposals</a>
            <a className="border rounded p-2" href="/inventory">Inventory</a>
            <a className="border rounded p-2" href="/settings">Settings</a>
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div 
          className="rounded-xl border bg-white p-4 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setShowScheduleModal(true)}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Schedule</h3>
              <p className="text-sm text-gray-600">View your shifts and clock in/out</p>
            </div>
          </div>
        </div>
      </div>

      {showScheduleModal && (
        <ScheduleModal onClose={() => setShowScheduleModal(false)} />
      )}
    </div>
  );
}


