import Calendar from '@/components/Calendar';
import EmployeeCommunity from '@/components/EmployeeCommunity';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';

// Helper function to get time-based greeting
function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home(){
  const location = useLocation();
  const [showReportModal, setShowReportModal] = useState(false);
  const { data: meProfile } = useQuery({ 
    queryKey: ['me-profile'], 
    queryFn: () => api<any>('GET', '/auth/me/profile') 
  });
  const { data: settings } = useQuery({ 
    queryKey: ['settings'], 
    queryFn: () => api<any>('GET', '/settings') 
  });
  
  const profile = meProfile?.profile || {};
  const user = meProfile?.user || {};
  const displayName = profile.preferred_name || 
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 
    user.username || 
    'User';
  const jobTitle = profile.job_title || '';
  
  // Get current date formatted (same as Business Dashboard)
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);
  
  // Overlay image from settings (same as Project hero overlay)
  const overlayUrl = useMemo(() => {
    const branding = Array.isArray(settings?.branding) ? settings.branding : [];
    const row = branding.find((i: any) => 
      ['project_hero_overlay_url', 'hero_overlay_url', 'project hero overlay', 'hero overlay'].includes(
        String(i.label || '').toLowerCase()
      )
    );
    return row?.value || '';
  }, [settings]);
  
  const [overlayResolved, setOverlayResolved] = useState<string>('');
  useEffect(() => {
    (async () => {
      try {
        if (!overlayUrl) {
          setOverlayResolved('');
          return;
        }
        if (overlayUrl.startsWith('/files/')) {
          const r: any = await api('GET', overlayUrl);
          setOverlayResolved(r.download_url || '');
        } else {
          setOverlayResolved(overlayUrl);
        }
      } catch {
        setOverlayResolved('');
      }
    })();
  }, [overlayUrl]);
  
  return (
    <div className="space-y-6 min-h-screen">
      {/* Compact Header with subtle gradient */}
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">
            {getTimeBasedGreeting()}, {displayName}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      
      {/* Quick Actions - 2x2 Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Clock In/Out Hero Card */}
        <ClockInOutHeroCard />
        
        {/* Tasks Card */}
        <QuickActionCard
          to="/tasks"
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          label="Tasks"
          summaryKey="tasks"
        />
        
        {/* Requests Card */}
        <QuickActionCard
          to="/task-requests"
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          iconPath="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          label="Requests"
          summaryKey="requests"
        />
        
        {/* Schedule Card */}
        <QuickActionCard
          to="/schedule"
          iconBg="bg-green-100"
          iconColor="text-green-600"
          iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          label="Schedule"
          summaryKey="schedule"
        />
      </div>

      {/* Main Content - Employee Community and Calendar */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 min-w-0">
        {/* Left column - Employee Community Feed */}
        <div className="flex flex-col min-w-0" style={{ height: '600px' }}>
          <EmployeeCommunity feedMode={true} />
        </div>
        
        {/* Right column - Calendar (Always Open, Smaller) */}
        <div className="rounded-[12px] border border-gray-200/80 bg-white shadow-sm p-5 flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900 mb-4 tracking-tight">Calendar</h3>
          <div className="overflow-auto" style={{ maxHeight: '600px' }}>
            <Calendar />
          </div>
        </div>
      </div>

      {showReportModal && (
        <QuickReportModal
          onClose={() => setShowReportModal(false)}
          onSuccess={() => {
            setShowReportModal(false);
            toast.success('Report created successfully');
          }}
        />
      )}
    </div>
  );
}

// Clock In/Out Hero Card - Larger, prominent card
function ClockInOutHeroCard() {
  const today = formatDateLocal(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });
  
  const { data: todayAttendance } = useQuery({
    queryKey: ['attendance-today', today],
    queryFn: () => api<any[]>('GET', `/settings/attendance/list?start_date=${today}&end_date=${today}`).catch(() => []),
  });
  
  // Update time every minute for working duration
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);
  
  const clockStatus = useMemo(() => {
    if (!currentUser?.id || !Array.isArray(todayAttendance)) {
      return { status: 'not_clocked', message: "You haven't clocked in today!", time: null, workingDuration: null };
    }
    const myAttendance = todayAttendance.find((a: any) => {
      if (String(a.worker_id) !== String(currentUser?.id)) return false;
      const attendanceDate = a.clock_in_time 
        ? new Date(a.clock_in_time).toISOString().split('T')[0]
        : (a.clock_out_time ? new Date(a.clock_out_time).toISOString().split('T')[0] : null);
      return attendanceDate === today;
    });
    
    if (!myAttendance || !myAttendance.clock_in_time) {
      return { status: 'not_clocked', message: "Ready to clock in", time: null, workingDuration: null };
    }
    if (myAttendance.clock_in_time && myAttendance.clock_out_time) {
      const clockInTime = new Date(myAttendance.clock_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const clockOutTime = new Date(myAttendance.clock_out_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return { 
        status: 'completed', 
        message: `Clocked in at ${clockInTime}, out at ${clockOutTime}`, 
        time: { in: clockInTime, out: clockOutTime },
        workingDuration: null
      };
    }
    if (myAttendance.clock_in_time) {
      const timeStr = new Date(myAttendance.clock_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      // Calculate working duration using currentTime state
      const clockInDate = new Date(myAttendance.clock_in_time);
      const diffMs = currentTime.getTime() - clockInDate.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const workingDuration = diffHours > 0 
        ? `${diffHours}h ${diffMinutes}m`
        : `${diffMinutes}m`;
      return { 
        status: 'clocked_in', 
        message: `Clocked in at ${timeStr}`, 
        time: { in: timeStr },
        workingDuration
      };
    }
    return { status: 'not_clocked', message: "Ready to clock in", time: null, workingDuration: null };
  }, [todayAttendance, currentUser?.id, today, currentTime]);
  
  return (
    <Link
      to="/clock-in-out"
      state={{ fromHome: true }}
      className="group rounded-[12px] border border-orange-200/60 bg-gradient-to-br from-orange-50/80 via-orange-50/50 to-white shadow-sm hover:shadow-md hover:shadow-orange-200/30 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col p-6"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-[10px] border border-orange-200/40 bg-white/60 flex items-center justify-center flex-shrink-0 shadow-sm">
          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold text-gray-900 mb-1 tracking-tight">Clock In / Out</div>
          <div className={`text-sm font-semibold ${
            clockStatus.status === 'clocked_in' ? 'text-green-600' :
            clockStatus.status === 'completed' ? 'text-gray-500' :
            'text-orange-600'
          }`}>
            {clockStatus.status === 'clocked_in' ? 'Clocked In' :
             clockStatus.status === 'completed' ? 'Completed' :
             'Not Clocked In'}
          </div>
          {clockStatus.status === 'clocked_in' && clockStatus.workingDuration && (
            <div className="text-xs text-gray-500 mt-0.5 font-medium">
              Working for {clockStatus.workingDuration}
            </div>
          )}
        </div>
      </div>
      
      <div className="text-sm text-gray-600 mb-5 line-clamp-2 leading-relaxed">
        {clockStatus.message}
      </div>
      
      <div className="w-full px-4 py-3 rounded-lg bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-semibold text-center transition-all duration-150 shadow-sm hover:shadow-md active:scale-[0.98]">
        {clockStatus.status === 'clocked_in' ? 'Clock Out' : 'Clock In'}
      </div>
    </Link>
  );
}

// Quick Action Card - Smaller cards for Tasks, Requests, Schedule
function QuickActionCard({ to, iconBg, iconColor, iconPath, label, summaryKey }: { 
  to: string; 
  iconBg: string; 
  iconColor: string; 
  iconPath: string; 
  label: string; 
  summaryKey: 'tasks' | 'requests' | 'schedule' 
}) {
  const today = formatDateLocal(new Date());
  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });
  
  // Tasks summary
  const { data: tasksData } = useQuery({
    queryKey: ['tasks-summary'],
    queryFn: () => api<any>('GET', '/tasks').catch(() => ({ accepted: [], in_progress: [], done: [] })),
    enabled: summaryKey === 'tasks',
  });
  
  // Requests summary
  const { data: requestsData } = useQuery({
    queryKey: ['task-requests-summary'],
    queryFn: () => api<any>('GET', '/task-requests').catch(() => ({ sent: [], received: [] })),
    enabled: summaryKey === 'requests',
  });
  
  // Schedule summary
  const { data: shiftsToday } = useQuery({
    queryKey: ['schedule-today', today, currentUser?.id],
    queryFn: () => {
      if (!currentUser?.id) return Promise.resolve([]);
      return api<any[]>('GET', `/dispatch/shifts?date_range=${today},${today}&worker_id=${currentUser.id}`).catch(() => []);
    },
    enabled: summaryKey === 'schedule' && !!currentUser?.id,
  });
  
  const summary = useMemo(() => {
    if (summaryKey === 'tasks') {
      const accepted = Array.isArray(tasksData?.accepted) ? tasksData.accepted.length : 0;
      const inProgress = Array.isArray(tasksData?.in_progress) ? tasksData.in_progress.length : 0;
      const total = accepted + inProgress;
      return total > 0 ? `${total} pending` : 'All caught up 🎉';
    }
    if (summaryKey === 'requests') {
      const received = Array.isArray(requestsData?.received) ? requestsData.received : [];
      const sent = Array.isArray(requestsData?.sent) ? requestsData.sent : [];
      const newReceived = received.filter((r: any) => r.status === 'new').length;
      const newSent = sent.filter((r: any) => r.status === 'new').length;
      const totalNew = newReceived + newSent;
      const pendingReceived = received.filter((r: any) => r.status !== 'accepted' && r.status !== 'refused' && r.status !== 'new').length;
      const pendingSent = sent.filter((r: any) => r.status !== 'accepted' && r.status !== 'refused' && r.status !== 'new').length;
      const totalPending = pendingReceived + pendingSent;
      const total = totalNew + totalPending;
      if (totalNew > 0 && totalPending > 0) {
        return `${totalNew} new, ${totalPending} awaiting`;
      } else if (totalNew > 0) {
        return `${totalNew} new`;
      } else if (totalPending > 0) {
        return `${totalPending} awaiting`;
      }
      return 'No pending requests';
    }
    if (summaryKey === 'schedule') {
      const hasShift = Array.isArray(shiftsToday) && shiftsToday.length > 0;
      return hasShift ? `Today's shift` : 'No shifts today';
    }
    return '';
  }, [summaryKey, tasksData, requestsData, shiftsToday, currentUser?.id]);
  
  return (
    <Link
      to={to}
      state={{ fromHome: true }}
      className="group rounded-[12px] border border-gray-200/80 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300 transition-all duration-200 cursor-pointer flex flex-col p-5"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-[10px] border border-gray-200 bg-gray-50/50 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-100/80 transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
        <div className="text-base font-bold text-gray-900 tracking-tight">{label}</div>
      </div>
      <div className="text-sm text-gray-500 font-medium leading-relaxed">
        {summary}
      </div>
    </Link>
  );
}

function QuickReportModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }){
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<File|null>(null);
  const { data: projects } = useQuery({
    queryKey: ['projects-for-report'],
    queryFn: () => api<any[]>('GET', '/projects?is_bidding=false'),
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
  });

  const reportCategories = (settings?.report_categories || []) as any[];
  
  // Separate categories into commercial and production based on meta.group
  const commercialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'commercial';
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);
  
  const productionCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'production';
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);

  const handleCreate = async () => {
    if (!selectedProjectId) {
      toast.error('Please select a project');
      return;
    }
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!desc.trim()) {
      toast.error('Please enter a description');
      return;
    }
    try {
      let imgMeta: any = undefined;
      if (file) {
        const selectedProject = Array.isArray(projects) ? projects.find(p => String(p.id) === selectedProjectId) : null;
        const up: any = await api('POST', '/files/upload', {
          project_id: selectedProjectId,
          client_id: selectedProject?.client_id || null,
          employee_id: null,
          category_id: 'project-report',
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        });
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-ms-blob-type': 'BlockBlob'
          },
          body: file
        });
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: file.size,
          checksum_sha256: 'na',
          content_type: file.type || 'application/octet-stream'
        });
        imgMeta = {
          file_object_id: conf.id,
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        };
      }
      await api('POST', `/projects/${selectedProjectId}/reports`, {
        title: title.trim(),
        category_id: category || null,
        description: desc,
        images: imgMeta ? { attachments: [imgMeta] } : undefined
      });
      setSelectedProjectId('');
      setTitle('');
      setCategory('');
      setDesc('');
      setFile(null);
      onSuccess();
    } catch (_e) {
      toast.error('Failed to create report');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Create Project Report</h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-white hover:text-gray-200 w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Project *</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
              >
                <option value="">Select project...</option>
                {projects?.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.code || p.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Title *</label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Enter report title..."
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Category</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="">Select category...</option>
                {commercialCategories.length > 0 && (
                  <optgroup label="Commercial">
                    {commercialCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
                {productionCategories.length > 0 && (
                  <optgroup label="Production / Execution">
                    {productionCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Description *</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                rows={6}
                placeholder="Describe what happened, how the day went, or any events on site..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Attachment (optional)</label>
              <input
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full border rounded px-3 py-2 text-sm"
                accept="image/*,.pdf,.doc,.docx"
              />
              {file && (
                <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
                  <span>📎</span>
                  <span>{file.name}</span>
                  <button onClick={() => setFile(null)} className="text-red-600 hover:text-red-700">×</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded bg-brand-red hover:bg-red-700 text-white text-sm font-medium"
          >
            Create Report
          </button>
        </div>
      </div>
    </div>
  );
}


