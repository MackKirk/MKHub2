import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';

type PendingAttendance = {
  id: string;
  notification_id: string;
  attendance_id: string;
  worker_id: string;
  worker_name: string;
  shift_id: string;
  project_id: string;
  project_name: string;
  type: 'in' | 'out';
  time_selected_utc: string;
  created_at: string;
};

export default function TaskBoard() {
  const { data: pendingAttendances = [], isLoading, refetch } = useQuery<PendingAttendance[]>({
    queryKey: ['pending-attendance-notifications'],
    queryFn: () => api<PendingAttendance[]>('GET', '/notifications/pending-attendance'),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  return (
    <div className="rounded-xl border bg-white h-full flex flex-col overflow-hidden">
      <div className="border-b p-4 bg-white">
        <h2 className="text-xl font-semibold">Task Board</h2>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-gray-500 text-sm py-4">Loading...</div>
        ) : pendingAttendances.length > 0 ? (
          <div className="space-y-3">
            {pendingAttendances.map((item) => (
              <Link
                key={item.id}
                to={`/projects/${item.project_id}?tab=timesheet`}
                className="block p-3 rounded-lg border bg-yellow-50 border-yellow-200 hover:bg-yellow-100 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      Attendance Approval Required
                    </div>
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div>
                        <span className="font-medium">Worker:</span> {item.worker_name}
                      </div>
                      <div>
                        <span className="font-medium">Project:</span> {item.project_name}
                      </div>
                      <div>
                        <span className="font-medium">Type:</span> Clock-{item.type === 'in' ? 'In' : 'Out'}
                      </div>
                      {item.time_selected_utc && (
                        <div>
                          <span className="font-medium">Time:</span>{' '}
                          {new Date(item.time_selected_utc).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="px-2 py-1 rounded text-xs bg-yellow-200 text-yellow-800 font-medium">
                      Pending
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {new Date(item.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 text-sm py-8">
            No pending tasks
          </div>
        )}
      </div>
    </div>
  );
}

