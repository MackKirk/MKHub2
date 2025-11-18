import Calendar from '@/components/Calendar';
import EmployeeCommunity from '@/components/EmployeeCommunity';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

export default function Home(){
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
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
                
                <button
                  onClick={() => {
                    // TODO: Implement Clock-in/out functionality
                    console.log('Clock-in/out clicked');
                  }}
                  className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer text-left"
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
                </button>
                
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
    </div>
  );
}


