import Calendar from '@/components/Calendar';
import EmployeeCommunity from '@/components/EmployeeCommunity';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

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
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Welcome Back, {displayName}!</div>
        <div className="text-sm opacity-90">Overview, quick links and shortcuts.</div>
      </div>
      
      {/* Quick Links - First Row, Smaller */}
      <div className="grid grid-cols-5 gap-3">
        <Link
          to="/profile"
          className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-gray-900">My Information</div>
        </Link>
        
        <Link
          to="/clock-in-out"
          className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-gray-900">Clock-in/out</div>
        </Link>
        
        <Link
          to="/tasks"
          className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-gray-900">Tasks</div>
        </Link>
        
        <Link
          to="/schedule"
          className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-gray-900">Schedule</div>
        </Link>

        <button
          onClick={() => setShowReportModal(true)}
          className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-gray-900">Project Report</div>
        </button>
      </div>

      {/* Main Content - Employee Community and Calendar */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 min-w-0">
        {/* Left column - Employee Community Feed */}
        <div className="flex flex-col min-w-0" style={{ height: '600px' }}>
          <EmployeeCommunity feedMode={true} />
        </div>
        
        {/* Right column - Calendar (Always Open, Smaller) */}
        <div className="rounded-xl border bg-white p-4 flex-shrink-0">
          <h3 className="text-lg font-semibold mb-3">Calendar</h3>
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


