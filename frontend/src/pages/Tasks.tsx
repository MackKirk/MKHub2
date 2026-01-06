import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useNavigate, useLocation } from 'react-router-dom';
import TaskCard from '@/components/tasks/TaskCard';
import TaskModal from '@/components/tasks/TaskModal';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import ArchivedTasksModal from '@/components/tasks/ArchivedTasksModal';
import LoadingOverlay from '@/components/LoadingOverlay';

type TaskBasic = {
  id: string;
  title: string;
  description?: string;
  status: 'accepted' | 'in_progress' | 'done';
  priority: string;
  due_date?: string | null;
  requested_by?: { id?: string | null; name?: string | null } | null;
  assigned_to?: { id?: string | null; name?: string | null; division?: string | null } | null;
  project?: { id?: string | null; name?: string | null; code?: string | null } | null;
  origin?: { type?: string; reference?: string | null; id?: string | null } | null;
  request?: { id: string; title: string; status: string } | null;
  created_at: string;
  started_at?: string | null;
  started_by?: { id?: string | null; name?: string | null } | null;
  concluded_at?: string | null;
  concluded_by?: { id?: string | null; name?: string | null } | null;
  permissions: {
    can_start: boolean;
    can_conclude: boolean;
  };
};

type TaskBuckets = {
  accepted: TaskBasic[];
  in_progress: TaskBasic[];
  done: TaskBasic[];
};

const originLabels: Record<string, string> = {
  manual_request: 'Manual request',
  system_order: 'System – Order',
  system_attendance: 'System – Attendance',
  bug: '🐛 Bug Report',
};

const priorityDot: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-500',
};

function BugReportDescription({ description }: { description: string }) {
  // Parse bug report description to extract structured information
  const lines = description.split('\n');
  const mainDescription: string[] = [];
  const bugDetails: Record<string, string> = {};
  let inBugSection = false;
  let inMetadata = false;
  let metadataJson = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip separator lines
    if (trimmed.startsWith('═') || trimmed.startsWith('─') || trimmed === '') {
      continue;
    }
    
    // Detect start of bug report section
    if (trimmed.includes('BUG REPORT INFORMATION')) {
      inBugSection = true;
      continue;
    }
    
    // Detect metadata section
    if (trimmed.includes('Technical Metadata')) {
      inMetadata = true;
      continue;
    }
    
    // Parse JSON metadata
    if (inMetadata && trimmed.startsWith('{')) {
      let jsonLines = [line];
      let braceCount = line.split('{').length - line.split('}').length;
      i++;
      while (i < lines.length && braceCount > 0) {
        jsonLines.push(lines[i]);
        braceCount += lines[i].split('{').length - lines[i].split('}').length;
        i++;
      }
      metadataJson = jsonLines.join('\n');
      try {
        const parsed = JSON.parse(metadataJson);
        if (!bugDetails.severity) bugDetails.severity = parsed.severity || '';
        if (!bugDetails.page_url) bugDetails.page_url = parsed.report_page || '';
        if (!bugDetails.user_agent) bugDetails.user_agent = parsed.report_user_agent || '';
        if (!bugDetails.screen && parsed.report_screen) {
          bugDetails.screen = `${parsed.report_screen.width} × ${parsed.report_screen.height}`;
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
      continue;
    }
    
    // Parse bug details lines
    if (inBugSection && !inMetadata) {
      const severityMatch = trimmed.match(/[🔴🟡🟢⚪]?\s*Severity:\s*(.+)/i);
      if (severityMatch) {
        bugDetails.severity = severityMatch[1].trim();
        continue;
      }
      
      const pageMatch = trimmed.match(/📄\s*Page URL:\s*(.+)/i);
      if (pageMatch) {
        bugDetails.page_url = pageMatch[1].trim();
        continue;
      }
      
      const screenMatch = trimmed.match(/💻\s*Screen Resolution:\s*(.+)/i);
      if (screenMatch) {
        bugDetails.screen = screenMatch[1].trim();
        continue;
      }
      
      const reportedMatch = trimmed.match(/👤\s*Reported by:\s*(.+)/i);
      if (reportedMatch) {
        bugDetails.reported_by = reportedMatch[1].trim();
        continue;
      }
      
      // Browser info section
      if (trimmed.includes('Browser & Device Information')) {
        // Next non-empty line is the user agent
        i++;
        while (i < lines.length && lines[i].trim() === '') i++;
        if (i < lines.length && !lines[i].trim().startsWith('─')) {
          bugDetails.user_agent = lines[i].trim();
        }
        continue;
      }
    }
    
    // Collect main description (before bug section)
    if (!inBugSection && trimmed) {
      mainDescription.push(line);
    }
  }
  
  const mainDescText = mainDescription.join('\n').trim();
  
  return (
    <div className="space-y-4">
      {/* Main Description */}
      {mainDescText && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wide">Description</div>
          <div className="text-gray-900 whitespace-pre-wrap leading-relaxed bg-white rounded p-3 border border-gray-200">
            {mainDescText}
          </div>
        </div>
      )}
      
      {/* Bug Details Card */}
      {(bugDetails.severity || bugDetails.page_url || bugDetails.screen || bugDetails.reported_by) && (
        <div className="border-t pt-4">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">Bug Report Details</div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            {bugDetails.severity && (
              <div className="flex items-center gap-3">
                <span className="text-gray-500 font-medium text-xs min-w-[90px]">Severity:</span>
                <span className={`font-semibold text-sm px-2 py-1 rounded ${
                  bugDetails.severity === 'High' ? 'bg-red-100 text-red-700' :
                  bugDetails.severity === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {bugDetails.severity}
                </span>
              </div>
            )}
            
            {bugDetails.page_url && (
              <div className="flex items-start gap-3">
                <span className="text-gray-500 font-medium text-xs min-w-[90px] pt-1">Page URL:</span>
                <a 
                  href={bugDetails.page_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline break-all text-sm flex-1"
                >
                  {bugDetails.page_url}
                </a>
              </div>
            )}
            
            {bugDetails.screen && (
              <div className="flex items-center gap-3">
                <span className="text-gray-500 font-medium text-xs min-w-[90px]">Screen:</span>
                <span className="text-gray-700 text-sm font-mono">{bugDetails.screen}</span>
              </div>
            )}
            
            {bugDetails.reported_by && (
              <div className="flex items-center gap-3">
                <span className="text-gray-500 font-medium text-xs min-w-[90px]">Reported by:</span>
                <span className="text-gray-700 text-sm">{bugDetails.reported_by}</span>
              </div>
            )}
            
            {bugDetails.user_agent && (
              <div className="flex items-start gap-3 pt-2 border-t">
                <span className="text-gray-500 font-medium text-xs min-w-[90px] pt-1">Browser:</span>
                <span className="text-gray-600 text-xs font-mono break-all flex-1 bg-gray-50 p-2 rounded border">
                  {bugDetails.user_agent}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<TaskBuckets>('GET', '/tasks'),
    refetchInterval: 30_000,
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [archivedModalOpen, setArchivedModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const tasksInProgress = useMemo(
    () => [...(data?.in_progress || []), ...((data as any)?.blocked || [])],
    [data]
  );
  const tasksTodo = data?.accepted || [];
  const tasksDone = data?.done || [];

  // Check if we're still loading initial data (only show overlay if no data yet)
  const isInitialLoading = isLoading && !data;
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  // Track when animation completes to remove inline styles for hover to work
  useEffect(() => {
    if (hasAnimated) {
      const timer = setTimeout(() => setAnimationComplete(true), 400);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated]);

  // Track when initial data is loaded to trigger entry animations
  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, hasAnimated]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <LoadingOverlay isLoading={isInitialLoading} text="Loading tasks...">
      <div className="space-y-4">
        <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-6 flex items-center justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1.5">Tasks</h1>
            <p className="text-sm text-gray-600 font-medium">A simple checklist of what to do next.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
              <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New task
            </button>
          </div>
        </div>
      
      {fromHome && (
        <div className="flex items-center justify-between">
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

      <div className="space-y-6">
        {/* In Progress */}
        <section className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200/60 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">In Progress</div>
              <div className="text-sm text-gray-500">Work that’s currently underway.</div>
            </div>
            <div className="text-sm text-gray-500">{tasksInProgress.length} task(s)</div>
          </div>
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : tasksInProgress.length === 0 ? (
              <div className="text-sm text-gray-500">Nothing in progress.</div>
            ) : (
              tasksInProgress.map((t) => (
                <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
              ))
            )}
          </div>
        </section>

        {/* To Do */}
        <section className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200/60 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">To Do</div>
              <div className="text-sm text-gray-500">Ready to start.</div>
            </div>
            <div className="text-sm text-gray-500">{tasksTodo.length} task(s)</div>
          </div>
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : tasksTodo.length === 0 ? (
              <div className="text-sm text-gray-500">Nothing to do right now.</div>
            ) : (
              tasksTodo.map((t) => (
                <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
              ))
            )}
          </div>
        </section>

        {/* Done (collapsed) */}
        <section className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setDoneExpanded((v) => !v)}
            className="w-full px-6 py-4 border-b border-gray-200/60 flex items-center justify-between gap-3 text-left"
          >
            <div>
              <div className="font-semibold text-gray-900">Done</div>
              <div className="text-sm text-gray-500">Completed tasks.</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-500">{tasksDone.length} task(s)</div>
              <div className="text-sm font-medium text-brand-red">{doneExpanded ? 'Hide' : 'Show'}</div>
            </div>
          </button>
          {doneExpanded && (
            <div className="p-4 space-y-3">
              {isLoading ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : tasksDone.length === 0 ? (
                <div className="text-sm text-gray-500">No completed tasks yet.</div>
              ) : (
                tasksDone.map((t) => (
                  <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
                ))
              )}
            </div>
          )}
        </section>
      </div>

      {/* View Archived Button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setArchivedModalOpen(true)}
          className="px-4 py-2 border border-gray-200/60 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          View archived tasks
        </button>
      </div>

      <TaskModal
        open={!!selectedTaskId}
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onUpdated={() => queryClient.invalidateQueries({ queryKey: ['tasks'] })}
      />

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(t) => {
          setCreateOpen(false);
          setSelectedTaskId(t.id);
        }}
      />

      <ArchivedTasksModal
        open={archivedModalOpen}
        onClose={() => setArchivedModalOpen(false)}
      />
    </div>
    </LoadingOverlay>
  );
}

