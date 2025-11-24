import Calendar from '@/components/Calendar';
import EmployeeCommunity from '@/components/EmployeeCommunity';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function Home(){
  const location = useLocation();
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
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
  
  // Overlay image from settings (same as Project hero overlay)
  const overlayUrl = useMemo(() => {
    const branding = (settings?.branding || []) as any[];
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
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Home - Welcome Back, {displayName}!</div>
        <div className="text-sm opacity-90">Overview, quick links and shortcuts.</div>
      </div>
      
      {/* User Card */}
      <div className="rounded-xl border bg-white">
        <div className="p-5">
          {/* Content */}
          <div className="grid grid-cols-2 gap-4 items-stretch" style={{ minHeight: '600px' }}>
            {/* Left column - Employee Community (1/2 width) */}
            <div className="flex flex-col">
              <div className="flex-1 min-h-0">
                <EmployeeCommunity expanded={true} />
              </div>
            </div>
            
            {/* Right column - Quick Links and Calendar (1/2 width) */}
            <div className={`space-y-4 ${isCalendarExpanded ? 'flex flex-col' : ''}`}>
              {/* Quick Links Cards - Always visible */}
              <div className="grid grid-cols-2 gap-4">
                <Link
                  to="/profile"
                  className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">My Information</div>
                      <div className="text-sm text-gray-500">View and edit your profile</div>
                    </div>
                  </div>
                </Link>
                
                <Link
                  to="/clock-in-out"
                  className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Clock-in/out</div>
                      <div className="text-sm text-gray-500">Record your attendance</div>
                    </div>
                  </div>
                </Link>
                
                <Link
                  to="/tasks"
                  className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Tasks</div>
                      <div className="text-sm text-gray-500">View and manage tasks</div>
                    </div>
                  </div>
                </Link>
                
                <Link
                  to="/schedule"
                  className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Schedule</div>
                      <div className="text-sm text-gray-500">View your work schedule</div>
                    </div>
                  </div>
                </Link>

                <button
                  onClick={() => setShowReportModal(true)}
                  className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Project Report</div>
                      <div className="text-sm text-gray-500">Create a new project report</div>
                    </div>
                  </div>
                </button>
              </div>
              
              {/* Calendar Card or Expanded Calendar */}
              <div className={isCalendarExpanded ? 'flex-1 min-h-0 flex flex-col' : ''}>
                {!isCalendarExpanded ? (
                  <button
                    onClick={() => setIsCalendarExpanded(true)}
                    className="w-full rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">Calendar</div>
                        <div className="text-sm text-gray-500">View your calendar</div>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="relative flex-1 min-h-0 flex flex-col">
                    <button
                      onClick={() => setIsCalendarExpanded(false)}
                      className="absolute top-2 right-2 z-10 px-3 py-1 rounded border bg-white hover:bg-gray-50 text-sm shadow-sm"
                    >
                      Close
                    </button>
                    <div className="flex-1 min-h-0 overflow-auto">
                      <Calendar />
                    </div>
                  </div>
                )}
              </div>
            </div>
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
        const selectedProject = projects?.find(p => String(p.id) === selectedProjectId);
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
                {reportCategories.map(cat => (
                  <option key={cat.value || cat.id} value={cat.value || cat.label}>{cat.label}</option>
                ))}
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


