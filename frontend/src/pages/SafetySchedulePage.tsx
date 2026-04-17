import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import SafetyServiceCalendar from './SafetyServiceCalendar';
import OverlayPortal from '@/components/OverlayPortal';
import {
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SAFETY_MODAL_OVERLAY,
  SafetyFormModalLayout,
} from '@/components/safety/SafetyModalChrome';
import PageHeaderBar from '@/components/PageHeaderBar';
import { api } from '@/lib/api';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';

type BizProject = { id: string; name: string; code?: string; business_line?: string };

type FormTemplatePick = {
  id: string;
  name: string;
  version_label: string;
};

function formatProjectLabel(p: BizProject): string {
  return p.code ? `${p.code} — ${p.name}` : p.name;
}

type SafetyInspectionCreated = {
  id: string;
  project_id: string;
  inspection_date: string | null;
  status?: string;
};

export default function SafetySchedulePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  /** Text in the project combobox: search query or selected project label */
  const [projectInput, setProjectInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectComboRef = useRef<HTMLDivElement>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scheduledLocal, setScheduledLocal] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(projectInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [projectInput]);

  useEffect(() => {
    if (!projectDropdownOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (projectComboRef.current && !projectComboRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [projectDropdownOpen]);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = new Set((me?.permissions || []) as string[]);
  const canSchedule = isAdmin || permissions.has('business:projects:safety:write');

  const { data: schedulableTemplates = [] } = useQuery({
    queryKey: ['formTemplatesSchedulable', showModal],
    queryFn: () => api<FormTemplatePick[]>('GET', '/form-templates?schedulable=true'),
    enabled: showModal && canSchedule,
  });

  const { data: projectsRes, isLoading: projectsLoading } = useQuery({
    queryKey: ['business-projects-safety-picker', debouncedQ],
    queryFn: () =>
      api<{ items: BizProject[] }>(
        'GET',
        `/projects/business/projects?limit=100&page=1${debouncedQ ? `&q=${encodeURIComponent(debouncedQ)}` : ''}`
      ),
    enabled: showModal && canSchedule,
  });

  const projectItems = projectsRes?.items ?? [];

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('Select a project');
      if (!selectedTemplateId) throw new Error('Select a template');
      const t = new Date(scheduledLocal);
      if (Number.isNaN(t.getTime())) throw new Error('Invalid date');
      return api<SafetyInspectionCreated>('POST', `/projects/${encodeURIComponent(selectedProjectId)}/safety-inspections`, {
        form_template_id: selectedTemplateId,
        form_payload: {},
        inspection_date: t.toISOString(),
      });
    },
    onSuccess: (row) => {
      toast.success('Inspection scheduled');
      queryClient.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['safetyInspections'] });
      queryClient.invalidateQueries({ queryKey: ['projectSafetyInspections', row.project_id] });
      const selected = projectItems.find((p) => p.id === row.project_id);
      const base =
        selected?.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
      const q = new URLSearchParams({ tab: 'safety', safety_inspection: row.id });
      setShowModal(false);
      setSelectedProjectId('');
      setProjectInput('');
      setSelectedTemplateId('');
      navigate(`${base}/${encodeURIComponent(row.project_id)}?${q.toString()}`);
    },
    onError: () => toast.error('Could not schedule inspection'),
  });

  useEffect(() => {
    if (!showModal) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [showModal]);

  const canSubmit = useMemo(
    () =>
      !!selectedProjectId &&
      !!selectedTemplateId &&
      !!scheduledLocal &&
      !scheduleMutation.isPending,
    [selectedProjectId, selectedTemplateId, scheduledLocal, scheduleMutation.isPending]
  );

  return (
    <div className="space-y-4 min-w-0 max-w-6xl mx-auto px-4 pb-16">
      <PageHeaderBar
        title="Safety schedule"
        subtitle="Scheduled site safety inspections on the calendar. Open the project Safety tab to complete forms."
        trailing={
          <>
            <Link
              to="/safety/inspections"
              className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              Inspections list
            </Link>
            {canSchedule && (
              <button
                type="button"
                onClick={() => {
                  setProjectInput('');
                  setSelectedProjectId('');
                  setDebouncedQ('');
                  setProjectDropdownOpen(false);
                  setSelectedTemplateId('');
                  setShowModal(true);
                }}
                className="px-3 py-2 rounded-lg bg-brand-red text-white text-xs font-medium hover:bg-[#aa1212] transition-colors"
              >
                Schedule new inspection
              </button>
            )}
          </>
        }
      />

      <SafetyServiceCalendar embedView />

      {showModal && canSchedule && (
        <OverlayPortal>
          <div className={SAFETY_MODAL_OVERLAY} onClick={() => setShowModal(false)} role="presentation">
            <SafetyFormModalLayout
              widthClass="w-full max-w-lg"
              titleId="schedule-safety-inspection-title"
              title="Schedule site safety inspection"
              subtitle="Pick an active form template, an awarded project, and a planned date. Complete the form on the project Safety tab."
              onClose={() => setShowModal(false)}
              shellOverflow="visible"
              bodyClassName="overflow-visible flex-1 p-4 min-h-0 relative z-20"
              innerCardClassName="overflow-visible"
              footer={
                <>
                  <button type="button" onClick={() => setShowModal(false)} className={SAFETY_MODAL_BTN_CANCEL}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={() => scheduleMutation.mutate()}
                    className={SAFETY_MODAL_BTN_PRIMARY}
                  >
                    {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule inspection'}
                  </button>
                </>
              }
            >
              <div className="space-y-4">
                <div>
                  <label className={SAFETY_MODAL_FIELD_LABEL}>
                    Form template <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                  >
                    <option value="">— Select template —</option>
                    {schedulableTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {(t.version_label || '').trim() ? ` (${(t.version_label || '').trim()})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div ref={projectComboRef} className="relative z-30">
                  <label className={SAFETY_MODAL_FIELD_LABEL}>
                    Project <span className="text-red-600">*</span>
                  </label>
                  <div className="relative mt-1">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      role="combobox"
                      aria-expanded={projectDropdownOpen}
                      aria-autocomplete="list"
                      value={projectInput}
                      placeholder="Search by name or code…"
                      autoComplete="off"
                      onChange={(e) => {
                        const v = e.target.value;
                        setProjectInput(v);
                        setSelectedProjectId('');
                        setProjectDropdownOpen(true);
                      }}
                      onFocus={() => setProjectDropdownOpen(true)}
                      className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                    />
                  </div>
                  {projectDropdownOpen && (
                    <ul
                      role="listbox"
                      className="absolute left-0 right-0 z-[100] mt-1 max-h-52 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
                    >
                      {projectsLoading ? (
                        <li className="px-3 py-2 text-sm text-gray-500">Loading…</li>
                      ) : projectItems.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-amber-800">No projects match. Try another search.</li>
                      ) : (
                        projectItems.map((p) => (
                          <li key={p.id} role="option">
                            <button
                              type="button"
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                                selectedProjectId === p.id ? 'bg-gray-50 font-medium' : ''
                              }`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSelectedProjectId(p.id);
                                setProjectInput(formatProjectLabel(p));
                                setProjectDropdownOpen(false);
                              }}
                            >
                              {formatProjectLabel(p)}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <div>
                  <label className={SAFETY_MODAL_FIELD_LABEL}>
                    Planned date and time <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(e) => setScheduledLocal(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                  />
                </div>
              </div>
            </SafetyFormModalLayout>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
