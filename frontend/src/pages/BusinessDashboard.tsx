import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, LayoutDashboard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';
import { DivisionIcon } from '@/components/DivisionIcon';
import { useBusinessLine } from '@/context/BusinessLineContext';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE, filterProjectDivisionsForBusinessLine, PROJECT_DIVISIONS_QUERY_KEY } from '@/lib/businessLine';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppTooltip,
  type AppSelectOption,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

// Hook for count-up animation
function useCountUp(end: number, duration: number = 600, enabled: boolean = true): number {
  const [count, setCount] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const prevEndRef = useRef(end);

  useEffect(() => {
    if (!enabled || end === 0) {
      setCount(end);
      return;
    }

    // Reset if target changed
    if (prevEndRef.current !== end) {
      setCount(0);
      prevEndRef.current = end;
    }

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentCount = Math.floor(end * eased);
      
      setCount(currentCount);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      startTimeRef.current = null;
    };
  }, [end, duration, enabled]);

  return count;
}

// CountUp component for displaying animated numbers
function CountUp({ value, duration = 600, enabled = true }: { value: number; duration?: number; enabled?: boolean }) {
  const count = useCountUp(value, duration, enabled);
  return <>{count}</>;
}

// Date Range Modal Component
type DateRangeModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (startDate: string, endDate: string) => void;
  initialStartDate?: string;
  initialEndDate?: string;
};

function DateRangeModal({ open, onClose, onConfirm, initialStartDate = '', initialEndDate = '' }: DateRangeModalProps) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  useEffect(() => {
    if (open) {
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
    }
  }, [open, initialStartDate, initialEndDate]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && startDate && endDate) {
        onConfirm(startDate, endDate);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, startDate, endDate, onClose, onConfirm]);

  if (!open) return null;

  const handleConfirm = () => {
    if (startDate && endDate) {
      onConfirm(startDate, endDate);
    }
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Custom Date Range"
      description="Choose start and end dates for the chart filter"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" disabled={!startDate || !endDate} onClick={handleConfirm}>
            Apply
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppInput
          type="date"
          label="Start Date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <AppInput
          type="date"
          label="End Date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
    </AppFormModal>
  );
}

type ProjectDivision = {
  id: string;
  label: string;
  value: string;
  subdivisions: Array<{ id: string; label: string; value: string }>;
};

type DivisionStats = {
  id: string;
  label: string;
  value: string;
  opportunities_count: number;
  projects_count: number;
  opportunities_value: number;
  projects_value: number;
  opportunities_profit?: number;
  projects_profit?: number;
  subdivisions: Array<{ id: string; label: string; value: string }>;
};

type StatusValueData = {
  final_total_with_gst: number;
  profit: number;
};

type DashboardStats = {
  total_opportunities: number;
  total_projects: number;
  opportunities_by_status: Record<string, number | StatusValueData>;
  projects_by_status: Record<string, number | StatusValueData>;
  total_estimated_value: number;
  total_actual_value: number;
  division_id?: string;
};

// Division icons use images from @/icons via DivisionIcon component
const DIVISION_ICON_SIZE = 24;
const FILTER_DIVISION_ICON_SIZE = 32;

const getDivisionIcon = (label: string) => <DivisionIcon label={label} size={DIVISION_ICON_SIZE} />;
const getFilterDivisionIcon = (label: string) => (
  <DivisionIcon label={label} size={FILTER_DIVISION_ICON_SIZE} suppressNativeTitle />
);

// Helper function to create pie chart path
const createPieSlice = (startAngle: number, endAngle: number, radius: number, centerX: number, centerY: number): string => {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z'
  ].join(' ');
};

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
};

// Palettes are ordered from darkest -> lightest so the largest slice can start darker.
const greenPalette = ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'];
const coolPalette = ['#0b1739', '#0f2a5a', '#1d4ed8', '#2563eb', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc'];

type DateFilterType = 'all' | 'last_year' | 'last_6_months' | 'last_3_months' | 'last_month' | 'custom';

const DATE_FILTER_OPTIONS: AppSelectOption[] = [
  { value: 'all', label: 'All time' },
  { value: 'last_year', label: 'Last year' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];

const DISPLAY_MODE_OPTIONS: AppSelectOption[] = [
  { value: 'quantity', label: 'Quantity' },
  { value: 'value', label: 'Value' },
];

const BUSINESS_DASHBOARD_PREFS_KEY = 'business-dashboard-prefs';

type BusinessDashboardPrefs = {
  selectedDivisionId: string | null;
  /** Same as widget "Show only … related to me" — API param related_to_me */
  relatedToMe: boolean;
  oppDivisionDateFilter: DateFilterType;
  oppDivisionCustomStart: string;
  oppDivisionCustomEnd: string;
  oppDivisionDisplayMode: 'quantity' | 'value';
  projDivisionDateFilter: DateFilterType;
  projDivisionCustomStart: string;
  projDivisionCustomEnd: string;
  projDivisionDisplayMode: 'quantity' | 'value';
  oppStatusDateFilter: DateFilterType;
  oppStatusCustomStart: string;
  oppStatusCustomEnd: string;
  oppStatusDisplayMode: 'quantity' | 'value';
  projStatusDateFilter: DateFilterType;
  projStatusCustomStart: string;
  projStatusCustomEnd: string;
  projStatusDisplayMode: 'quantity' | 'value';
};

const DEFAULT_DASHBOARD_PREFS: BusinessDashboardPrefs = {
  selectedDivisionId: null,
  relatedToMe: false,
  oppDivisionDateFilter: 'all',
  oppDivisionCustomStart: '',
  oppDivisionCustomEnd: '',
  oppDivisionDisplayMode: 'quantity',
  projDivisionDateFilter: 'all',
  projDivisionCustomStart: '',
  projDivisionCustomEnd: '',
  projDivisionDisplayMode: 'quantity',
  oppStatusDateFilter: 'all',
  oppStatusCustomStart: '',
  oppStatusCustomEnd: '',
  oppStatusDisplayMode: 'quantity',
  projStatusDateFilter: 'all',
  projStatusCustomStart: '',
  projStatusCustomEnd: '',
  projStatusDisplayMode: 'quantity',
};

function getDashboardPrefsKey(userId: string | number, businessLine: string): string {
  return `${BUSINESS_DASHBOARD_PREFS_KEY}-${userId}-${businessLine}`;
}

function loadDashboardPrefs(userId: string | number, businessLine: string): BusinessDashboardPrefs | null {
  try {
    const raw = localStorage.getItem(getDashboardPrefsKey(String(userId), businessLine));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BusinessDashboardPrefs>;
    const dateFilters: DateFilterType[] = ['all', 'last_year', 'last_6_months', 'last_3_months', 'last_month', 'custom'];
    const displayModes: ('quantity' | 'value')[] = ['quantity', 'value'];
    return {
      ...DEFAULT_DASHBOARD_PREFS,
      ...parsed,
      relatedToMe: typeof parsed.relatedToMe === 'boolean' ? parsed.relatedToMe : DEFAULT_DASHBOARD_PREFS.relatedToMe,
      selectedDivisionId: typeof parsed.selectedDivisionId === 'string' || parsed.selectedDivisionId === null ? parsed.selectedDivisionId : null,
      oppDivisionDateFilter: dateFilters.includes(parsed.oppDivisionDateFilter as DateFilterType) ? parsed.oppDivisionDateFilter! : 'all',
      oppDivisionDisplayMode: displayModes.includes(parsed.oppDivisionDisplayMode!) ? parsed.oppDivisionDisplayMode! : 'quantity',
      projDivisionDateFilter: dateFilters.includes(parsed.projDivisionDateFilter as DateFilterType) ? parsed.projDivisionDateFilter! : 'all',
      projDivisionDisplayMode: displayModes.includes(parsed.projDivisionDisplayMode!) ? parsed.projDivisionDisplayMode! : 'quantity',
      oppStatusDateFilter: dateFilters.includes(parsed.oppStatusDateFilter as DateFilterType) ? parsed.oppStatusDateFilter! : 'all',
      oppStatusDisplayMode: displayModes.includes(parsed.oppStatusDisplayMode!) ? parsed.oppStatusDisplayMode! : 'quantity',
      projStatusDateFilter: dateFilters.includes(parsed.projStatusDateFilter as DateFilterType) ? parsed.projStatusDateFilter! : 'all',
      projStatusDisplayMode: displayModes.includes(parsed.projStatusDisplayMode!) ? parsed.projStatusDisplayMode! : 'quantity',
    };
  } catch {
    return null;
  }
}

// Helper function to format date for display
const formatDateForDisplay = (dateString: string): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
};

// Helper function to calculate date range from filter
const calculateDateRange = (dateFilter: DateFilterType, customDateStart: string, customDateEnd: string) => {
  if (dateFilter === 'all') {
    return { date_from: undefined, date_to: undefined };
  }
  if (dateFilter === 'custom') {
    return {
      date_from: customDateStart || undefined,
      date_to: customDateEnd || undefined,
    };
  }
  const now = new Date();
  const dateTo = now.toISOString().split('T')[0];
  let dateFrom: string;
  switch (dateFilter) {
    case 'last_year':
      dateFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
      break;
    case 'last_6_months':
      dateFrom = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'last_3_months':
      dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'last_month':
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    default:
      return { date_from: undefined, date_to: undefined };
  }
  return { date_from: dateFrom, date_to: dateTo };
};

type DashboardChartFiltersProps = {
  dateFilter: DateFilterType;
  setDateFilter: (value: DateFilterType) => void;
  customStart: string;
  customEnd: string;
  openCustomModal: () => void;
  displayMode: 'quantity' | 'value';
  setDisplayMode: (value: 'quantity' | 'value') => void;
};

function DashboardChartFilters({
  dateFilter,
  setDateFilter,
  customStart,
  customEnd,
  openCustomModal,
  displayMode,
  setDisplayMode,
}: DashboardChartFiltersProps) {
  return (
    <div className={uiCx(uiLayout.actionsRow, 'shrink-0 flex-wrap gap-2')}>
      <AppSelect
        className="w-[8.5rem] shrink-0"
        options={DATE_FILTER_OPTIONS}
        value={dateFilter}
        onChange={(e) => {
          const value = e.target.value as DateFilterType;
          setDateFilter(value);
          if (value === 'custom') openCustomModal();
        }}
      />
      {dateFilter === 'custom' && customStart && customEnd ? (
        <AppButton
          type="button"
          variant="ghost"
          size="sm"
          className="px-2"
          title={`${formatDateForDisplay(customStart)} - ${formatDateForDisplay(customEnd)}`}
          onClick={openCustomModal}
          aria-label="Edit custom date range"
        >
          <Calendar className="h-4 w-4" />
        </AppButton>
      ) : null}
      <AppSelect
        className="w-[6.5rem] shrink-0"
        options={DISPLAY_MODE_OPTIONS}
        value={displayMode}
        onChange={(e) => setDisplayMode(e.target.value as 'quantity' | 'value')}
      />
    </div>
  );
}

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const businessLine = useBusinessLine();
  const { data: currentUser } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const loadedPrefsKeyRef = useRef<string | null>(null);

  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [relatedToMe, setRelatedToMe] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  
  // Track when animation completes to remove inline styles for hover to work
  useEffect(() => {
    if (hasAnimated) {
      const timer = setTimeout(() => setAnimationComplete(true), 500);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated]);
  
  // Separate filter states for each chart
  // Pie charts (Division charts)
  const [oppDivisionDateFilter, setOppDivisionDateFilter] = useState<DateFilterType>('all');
  const [oppDivisionCustomStart, setOppDivisionCustomStart] = useState<string>('');
  const [oppDivisionCustomEnd, setOppDivisionCustomEnd] = useState<string>('');
  const [oppDivisionModalOpen, setOppDivisionModalOpen] = useState(false);
  const [oppDivisionDisplayMode, setOppDivisionDisplayMode] = useState<'quantity' | 'value'>('quantity');
  
  const [projDivisionDateFilter, setProjDivisionDateFilter] = useState<DateFilterType>('all');
  const [projDivisionCustomStart, setProjDivisionCustomStart] = useState<string>('');
  const [projDivisionCustomEnd, setProjDivisionCustomEnd] = useState<string>('');
  const [projDivisionModalOpen, setProjDivisionModalOpen] = useState(false);
  const [projDivisionDisplayMode, setProjDivisionDisplayMode] = useState<'quantity' | 'value'>('quantity');
  
  // Bar charts (Status charts)
  const [oppStatusDateFilter, setOppStatusDateFilter] = useState<DateFilterType>('all');
  const [oppStatusCustomStart, setOppStatusCustomStart] = useState<string>('');
  const [oppStatusCustomEnd, setOppStatusCustomEnd] = useState<string>('');
  const [oppStatusDisplayMode, setOppStatusDisplayMode] = useState<'quantity' | 'value'>('quantity');
  const [oppStatusModalOpen, setOppStatusModalOpen] = useState(false);
  
  const [projStatusDateFilter, setProjStatusDateFilter] = useState<DateFilterType>('all');
  const [projStatusCustomStart, setProjStatusCustomStart] = useState<string>('');
  const [projStatusCustomEnd, setProjStatusCustomEnd] = useState<string>('');
  const [projStatusDisplayMode, setProjStatusDisplayMode] = useState<'quantity' | 'value'>('quantity');
  const [projStatusModalOpen, setProjStatusModalOpen] = useState(false);

  // Pie chart hover tooltip (division charts)
  type PieTooltipData = { chart: 'opp' | 'proj'; label: string; value: number; percentage: number; profit?: number };
  const [pieTooltip, setPieTooltip] = useState<PieTooltipData | null>(null);
  const [pieTooltipPos, setPieTooltipPos] = useState({ x: 0, y: 0 });

  // Load persisted dashboard prefs for this user and business line
  useEffect(() => {
    const userId = currentUser?.id != null ? String(currentUser.id) : null;
    const prefsKey = userId ? `${userId}:${businessLine}` : null;
    if (!prefsKey || loadedPrefsKeyRef.current === prefsKey) return;
    const prefs = loadDashboardPrefs(userId!, businessLine);
    if (prefs) {
      setSelectedDivisionId(prefs.selectedDivisionId);
      setRelatedToMe(prefs.relatedToMe);
      setOppDivisionDateFilter(prefs.oppDivisionDateFilter);
      setOppDivisionCustomStart(prefs.oppDivisionCustomStart);
      setOppDivisionCustomEnd(prefs.oppDivisionCustomEnd);
      setOppDivisionDisplayMode(prefs.oppDivisionDisplayMode);
      setProjDivisionDateFilter(prefs.projDivisionDateFilter);
      setProjDivisionCustomStart(prefs.projDivisionCustomStart);
      setProjDivisionCustomEnd(prefs.projDivisionCustomEnd);
      setProjDivisionDisplayMode(prefs.projDivisionDisplayMode);
      setOppStatusDateFilter(prefs.oppStatusDateFilter);
      setOppStatusCustomStart(prefs.oppStatusCustomStart);
      setOppStatusCustomEnd(prefs.oppStatusCustomEnd);
      setOppStatusDisplayMode(prefs.oppStatusDisplayMode);
      setProjStatusDateFilter(prefs.projStatusDateFilter);
      setProjStatusCustomStart(prefs.projStatusCustomStart);
      setProjStatusCustomEnd(prefs.projStatusCustomEnd);
      setProjStatusDisplayMode(prefs.projStatusDisplayMode);
    }
    loadedPrefsKeyRef.current = prefsKey;
  }, [currentUser?.id, businessLine]);

  // Persist dashboard prefs whenever any filter/display state changes
  useEffect(() => {
    const userId = currentUser?.id != null ? String(currentUser.id) : null;
    const prefsKey = userId ? `${userId}:${businessLine}` : null;
    if (!userId || !prefsKey || loadedPrefsKeyRef.current !== prefsKey) return;
    const prefs: BusinessDashboardPrefs = {
      selectedDivisionId,
      relatedToMe,
      oppDivisionDateFilter,
      oppDivisionCustomStart,
      oppDivisionCustomEnd,
      oppDivisionDisplayMode,
      projDivisionDateFilter,
      projDivisionCustomStart,
      projDivisionCustomEnd,
      projDivisionDisplayMode,
      oppStatusDateFilter,
      oppStatusCustomStart,
      oppStatusCustomEnd,
      oppStatusDisplayMode,
      projStatusDateFilter,
      projStatusCustomStart,
      projStatusCustomEnd,
      projStatusDisplayMode,
    };
    try {
      localStorage.setItem(getDashboardPrefsKey(userId, businessLine), JSON.stringify(prefs));
    } catch {
      // ignore quota / private mode
    }
  }, [
    currentUser?.id,
    businessLine,
    selectedDivisionId,
    relatedToMe,
    oppDivisionDateFilter,
    oppDivisionCustomStart,
    oppDivisionCustomEnd,
    oppDivisionDisplayMode,
    projDivisionDateFilter,
    projDivisionCustomStart,
    projDivisionCustomEnd,
    projDivisionDisplayMode,
    oppStatusDateFilter,
    oppStatusCustomStart,
    oppStatusCustomEnd,
    oppStatusDisplayMode,
    projStatusDateFilter,
    projStatusCustomStart,
    projStatusCustomEnd,
    projStatusDisplayMode,
  ]);
  
  // Get project divisions (hierarchical)
  const { data: divisionsData, isLoading: divisionsLoading, error: divisionsError, refetch: refetchDivisions } = useQuery<ProjectDivision[]>({
    queryKey: PROJECT_DIVISIONS_QUERY_KEY,
    queryFn: async () => {
      const result = await api<ProjectDivision[]>('GET', '/settings/project-divisions');
      console.log('Project divisions loaded:', result, 'Type:', Array.isArray(result), 'Length:', result?.length);
      if (!Array.isArray(result)) {
        console.warn('Project divisions response is not an array:', result);
        return [];
      }
      return result;
    },
    staleTime: 300_000,
    retry: 2,
  });

  // Force refetch on mount to ensure fresh data
  useEffect(() => {
    refetchDivisions();
  }, [refetchDivisions]);

  // Calculate date ranges for each chart
  const oppDivisionDateRange = useMemo(() => 
    calculateDateRange(oppDivisionDateFilter, oppDivisionCustomStart, oppDivisionCustomEnd),
    [oppDivisionDateFilter, oppDivisionCustomStart, oppDivisionCustomEnd]
  );
  
  const projDivisionDateRange = useMemo(() => 
    calculateDateRange(projDivisionDateFilter, projDivisionCustomStart, projDivisionCustomEnd),
    [projDivisionDateFilter, projDivisionCustomStart, projDivisionCustomEnd]
  );
  
  const oppStatusDateRange = useMemo(() => 
    calculateDateRange(oppStatusDateFilter, oppStatusCustomStart, oppStatusCustomEnd),
    [oppStatusDateFilter, oppStatusCustomStart, oppStatusCustomEnd]
  );
  
  const projStatusDateRange = useMemo(() => 
    calculateDateRange(projStatusDateFilter, projStatusCustomStart, projStatusCustomEnd),
    [projStatusDateFilter, projStatusCustomStart, projStatusCustomEnd]
  );

  // Get division statistics for Opportunities by Division
  const { data: oppDivisionsStats, isLoading: oppDivisionsLoading } = useQuery<DivisionStats[]>({
    queryKey: ['business-divisions-stats-opp', businessLine, selectedDivisionId, relatedToMe, oppDivisionDateRange.date_from, oppDivisionDateRange.date_to, oppDivisionDisplayMode],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        params.set('business_line', businessLine);
        if (selectedDivisionId) params.set('division_id', selectedDivisionId);
        if (oppDivisionDateRange.date_from) params.set('date_from', oppDivisionDateRange.date_from);
        if (oppDivisionDateRange.date_to) params.set('date_to', oppDivisionDateRange.date_to);
        params.set('mode', oppDivisionDisplayMode);
        if (relatedToMe) params.set('related_to_me', 'true');
        const url = `/projects/business/divisions-stats${params.toString() ? '?' + params.toString() : ''}`;
        return await api('GET', url);
      } catch (e) {
        console.warn('Failed to load division stats:', e);
        return [];
      }
    },
    staleTime: 60_000,
  });

  // Get division statistics for Projects by Division
  const { data: projDivisionsStats, isLoading: projDivisionsLoading } = useQuery<DivisionStats[]>({
    queryKey: ['business-divisions-stats-proj', businessLine, selectedDivisionId, relatedToMe, projDivisionDateRange.date_from, projDivisionDateRange.date_to, projDivisionDisplayMode],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        params.set('business_line', businessLine);
        if (selectedDivisionId) params.set('division_id', selectedDivisionId);
        if (projDivisionDateRange.date_from) params.set('date_from', projDivisionDateRange.date_from);
        if (projDivisionDateRange.date_to) params.set('date_to', projDivisionDateRange.date_to);
        params.set('mode', projDivisionDisplayMode);
        if (relatedToMe) params.set('related_to_me', 'true');
        const url = `/projects/business/divisions-stats${params.toString() ? '?' + params.toString() : ''}`;
        return await api('GET', url);
      } catch (e) {
        console.warn('Failed to load division stats:', e);
        return [];
      }
    },
    staleTime: 60_000,
  });

  // Get dashboard stats for Opportunities by Status
  const { data: oppStatusStats, isLoading: oppStatusLoading } = useQuery<DashboardStats>({
    queryKey: ['business-dashboard-opp-status', businessLine, selectedDivisionId, relatedToMe, oppStatusDateRange.date_from, oppStatusDateRange.date_to, oppStatusDisplayMode],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('business_line', businessLine);
      if (selectedDivisionId) params.set('division_id', selectedDivisionId);
      if (oppStatusDateRange.date_from) params.set('date_from', oppStatusDateRange.date_from);
      if (oppStatusDateRange.date_to) params.set('date_to', oppStatusDateRange.date_to);
      params.set('mode', oppStatusDisplayMode);
      if (relatedToMe) params.set('related_to_me', 'true');
      return api('GET', `/projects/business/dashboard?${params.toString()}`);
    },
  });

  // Get dashboard stats for Projects by Status
  const { data: projStatusStats, isLoading: projStatusLoading } = useQuery<DashboardStats>({
    queryKey: ['business-dashboard-proj-status', businessLine, selectedDivisionId, relatedToMe, projStatusDateRange.date_from, projStatusDateRange.date_to, projStatusDisplayMode],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('business_line', businessLine);
      if (selectedDivisionId) params.set('division_id', selectedDivisionId);
      if (projStatusDateRange.date_from) params.set('date_from', projStatusDateRange.date_from);
      if (projStatusDateRange.date_to) params.set('date_to', projStatusDateRange.date_to);
      params.set('mode', projStatusDisplayMode);
      if (relatedToMe) params.set('related_to_me', 'true');
      return api('GET', `/projects/business/dashboard?${params.toString()}`);
    },
  });

  const divisions = useMemo(
    () =>
      filterProjectDivisionsForBusinessLine(
        (Array.isArray(divisionsData) ? divisionsData : []) as Parameters<typeof filterProjectDivisionsForBusinessLine>[0],
        businessLine
      ) as ProjectDivision[],
    [divisionsData, businessLine]
  );
  const oppStatsByDivision = Array.isArray(oppDivisionsStats) ? oppDivisionsStats : [];
  const projStatsByDivision = Array.isArray(projDivisionsStats) ? projDivisionsStats : [];
  
  // Get selected division name for breadcrumb and titles
  const selectedDivision = selectedDivisionId ? divisions.find(d => d.id === selectedDivisionId) : null;
  
  // Invalidate queries when selectedDivisionId changes
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['business-divisions-stats-opp'] });
    queryClient.invalidateQueries({ queryKey: ['business-divisions-stats-proj'] });
    queryClient.invalidateQueries({ queryKey: ['business-dashboard-opp-status'] });
    queryClient.invalidateQueries({ queryKey: ['business-dashboard-proj-status'] });
  }, [selectedDivisionId, businessLine, queryClient]);
  
  // Check if we're still loading critical initial data (not refetching)
  // Only show overlay on first load, not on background refetches
  const isInitialLoading = (divisionsLoading && !divisionsData);
  
  // Track when initial data is loaded to trigger entry animations (after overlay with logo spinner is gone)
  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      const timer = setTimeout(() => setHasAnimated(true), 80);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, hasAnimated]);

  const handleViewOpportunities = (divisionId?: string) => {
    const params = divisionId ? `?division_id=${encodeURIComponent(divisionId)}` : '';
    const base = businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-opportunities' : '/opportunities';
    navigate(`${base}${params}`);
  };

  const handleViewProjects = (divisionId?: string) => {
    const params = divisionId ? `?division_id=${encodeURIComponent(divisionId)}` : '';
    const base = businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
    navigate(`${base}${params}`);
  };

  // Helper function to format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculate max count/value for progress bar scaling
  const maxOpportunityStatusCount = useMemo(() => {
    if (!oppStatusStats?.opportunities_by_status) return 1;
    const values = Object.values(oppStatusStats.opportunities_by_status);
    if (oppStatusDisplayMode === 'value') {
      // When in value mode, get max of final_total_with_gst values
      const totals = values.map(v => {
        if (typeof v === 'object' && v !== null && 'final_total_with_gst' in v) {
          return (v as StatusValueData).final_total_with_gst;
        }
        return 0;
      });
      return Math.max(...totals, 1);
    }
    return Math.max(...(values as number[]), 1);
  }, [oppStatusStats?.opportunities_by_status, oppStatusDisplayMode]);

  const maxProjectStatusCount = useMemo(() => {
    if (!projStatusStats?.projects_by_status) return 1;
    const values = Object.values(projStatusStats.projects_by_status);
    if (projStatusDisplayMode === 'value') {
      // When in value mode, get max of final_total_with_gst values
      const totals = values.map(v => {
        if (typeof v === 'object' && v !== null && 'final_total_with_gst' in v) {
          return (v as StatusValueData).final_total_with_gst;
        }
        return 0;
      });
      return Math.max(...totals, 1);
    }
    return Math.max(...(values as number[]), 1);
  }, [projStatusStats?.projects_by_status, projStatusDisplayMode]);

  const chartCardAnimClass = animationComplete
    ? uiShadows.card
    : uiCx(
        uiShadows.card,
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]',
      );

  const divisionCardAnimClass = animationComplete
    ? undefined
    : uiCx(
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
      );

  return (
    <LoadingOverlay isLoading={isInitialLoading} text="Loading dashboard data...">
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title={
            <>
              Business Dashboard
              {selectedDivision ? ` • ${selectedDivision.label}` : ''}
            </>
          }
          subtitle="Opportunities and projects grouped by division"
          icon={<LayoutDashboard className="h-4 w-4" />}
        />

        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-3')}>
            <span className={uiTypography.overline}>Filter by:</span>
            <AppTooltip content="Show All">
              <AppButton
                type="button"
                variant={selectedDivisionId === null ? 'primary' : 'secondary'}
                size="sm"
                className="h-12 w-12 shrink-0 p-0"
                onClick={() => setSelectedDivisionId(null)}
                aria-label="Show all divisions"
              >
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </AppButton>
            </AppTooltip>
            {divisions.map((division) => {
              const isActive = selectedDivisionId === division.id;
              const icon = getFilterDivisionIcon(division.label);
              return (
                <AppTooltip key={division.id} content={division.label}>
                  <AppButton
                    type="button"
                    variant={isActive ? 'primary' : 'secondary'}
                    size="sm"
                    className={uiCx('h-12 w-12 shrink-0 p-0', isActive && 'scale-105')}
                    onClick={() => setSelectedDivisionId(division.id)}
                    aria-label={division.label}
                    aria-pressed={isActive}
                  >
                    {icon}
                  </AppButton>
                </AppTooltip>
              );
            })}
            <label
              className={uiCx(uiLayout.actionsRow, 'ml-auto shrink-0 cursor-pointer select-none gap-2.5')}
              title="Only opportunities and projects where you are estimator, project admin, or onsite lead"
            >
              <span className={uiTypography.body}>Show me</span>
              <button
                type="button"
                role="switch"
                aria-checked={relatedToMe}
                aria-label="Show only opportunities and projects related to me"
                onClick={() => setRelatedToMe(!relatedToMe)}
                className={uiCx(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1',
                  relatedToMe ? 'border-gray-900 bg-gray-900' : 'border-gray-300 bg-gray-200',
                )}
              >
                <span
                  className={uiCx(
                    'pointer-events-none mt-0.5 inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                    relatedToMe ? 'ml-0.5 translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </label>
          </div>
        </AppCard>

        {/* Section 1: Charts */}
        <section>
          <div className="space-y-4">
            {/* Row 1: Opportunities by Division / Projects by Division */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
              {/* Opportunities by Division */}
              <LoadingOverlay isLoading={oppDivisionsLoading} minHeight="min-h-[200px]">
              <AppCard
                className={uiCx('flex flex-col transition-all duration-200 ease-out hover:-translate-y-0.5', chartCardAnimClass)}
                bodyClassName={uiCx(uiSpacing.cardPadding, 'flex flex-1 flex-col min-h-0')}
              >
                <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
                  <div className={uiTypography.overline}>
                    Opportunities by Division{selectedDivision ? ` - ${selectedDivision.label}` : ''}
                  </div>
                  <DashboardChartFilters
                    dateFilter={oppDivisionDateFilter}
                    setDateFilter={setOppDivisionDateFilter}
                    customStart={oppDivisionCustomStart}
                    customEnd={oppDivisionCustomEnd}
                    openCustomModal={() => setOppDivisionModalOpen(true)}
                    displayMode={oppDivisionDisplayMode}
                    setDisplayMode={setOppDivisionDisplayMode}
                  />
                </div>
                <div className="flex-1 flex items-center justify-center">
                  {oppStatsByDivision.length === 0 ? (
                    <p className={uiCx(uiTypography.helper, 'text-center')}>No data</p>
                  ) : (() => {
                    const colors = greenPalette;
                    // Always start from divisions that have opportunities, regardless of value.
                    const divisionsForList = oppStatsByDivision
                      .filter(d => (d.opportunities_count || 0) > 0)
                      .slice()
                      .sort((a, b) => {
                        return oppDivisionDisplayMode === 'value'
                          ? (b.opportunities_value || 0) - (a.opportunities_value || 0)
                          : (b.opportunities_count || 0) - (a.opportunities_count || 0);
                      });

                    // For the pie itself, we only draw slices with a positive contribution to avoid 0° arcs.
                    const divisionsForChart = oppDivisionDisplayMode === 'value'
                      ? divisionsForList.filter(d => (d.opportunities_value || 0) > 0)
                      : divisionsForList;

                    const total = oppDivisionDisplayMode === 'value'
                      ? divisionsForChart.reduce((sum, d) => sum + (d.opportunities_value || 0), 0)
                      : divisionsForChart.reduce((sum, d) => sum + (d.opportunities_count || 0), 0);

                    const hasChartData = total > 0 && divisionsForChart.length > 0;

                    const colorById = new Map<string, string>();
                    divisionsForChart.forEach((d, idx) => {
                      colorById.set(d.id, colors[idx % colors.length]);
                    });

                    const radius = 40;
                    const centerX = 50;
                    const centerY = 50;
                    const explodeOffset = 5;
                    const handleOppSliceMouseEnter = (div: typeof divisionsForChart[0], ev: React.MouseEvent) => {
                      const val = oppDivisionDisplayMode === 'value' ? (div.opportunities_value || 0) : (div.opportunities_count || 0);
                      const pct = total > 0 ? (val / total) * 100 : 0;
                      setPieTooltip({
                        chart: 'opp',
                        label: div.label,
                        value: val,
                        percentage: pct,
                        profit: div.opportunities_profit,
                      });
                      setPieTooltipPos({ x: ev.clientX, y: ev.clientY });
                    };
                    const handleOppSliceMouseMove = (ev: React.MouseEvent) => {
                      if (pieTooltip?.chart === 'opp') setPieTooltipPos({ x: ev.clientX, y: ev.clientY });
                    };
                    const handleOppSliceMouseLeave = () => {
                      setPieTooltip((prev) => (prev?.chart === 'opp' ? null : prev));
                    };
                    let currentAngle = 0;
                    return (
                      <div className="flex flex-row gap-3 flex-1 min-h-0 w-full">
                        <div className="flex-[0_0_40%] min-w-0 min-h-0 flex items-center justify-center relative">
                          <svg
                            viewBox="0 0 100 100"
                            className="w-full h-full max-w-full max-h-full min-h-[80px]"
                            preserveAspectRatio="xMidYMid meet"
                            onMouseLeave={handleOppSliceMouseLeave}
                          >
                            {!hasChartData ? (
                              <circle cx={centerX} cy={centerY} r={radius} fill="#e5e7eb" />
                            ) : divisionsForChart.length === 1 ? (
                              <circle cx={centerX} cy={centerY} r={radius} fill={colors[0]} />
                            ) : (
                              divisionsForChart.map((div, idx) => {
                                const percentage = oppDivisionDisplayMode === 'value'
                                  ? ((div.opportunities_value || 0) / total) * 100
                                  : ((div.opportunities_count || 0) / total) * 100;
                                const angle = (percentage / 100) * 360;
                                const startAngle = currentAngle;
                                const endAngle = currentAngle + angle;
                                currentAngle = endAngle;
                                const midAngle = (startAngle + endAngle) / 2;
                                const isHovered = pieTooltip?.chart === 'opp' && pieTooltip?.label === div.label;
                                const { x: ox, y: oy } = polarToCartesian(centerX, centerY, explodeOffset, midAngle);
                                const tx = isHovered ? ox - centerX : 0;
                                const ty = isHovered ? oy - centerY : 0;
                                return (
                                  <g
                                    key={div.id}
                                    transform={`translate(${tx}, ${ty})`}
                                    style={{
                                      cursor: 'pointer',
                                      opacity: hasAnimated ? 1 : 0,
                                      transition: `transform 0.15s ease-out, opacity 400ms ease-out ${hasAnimated ? idx * 80 + 'ms' : '0ms'}`,
                                    }}
                                    onMouseEnter={(ev) => handleOppSliceMouseEnter(div, ev)}
                                    onMouseMove={handleOppSliceMouseMove}
                                    onMouseLeave={handleOppSliceMouseLeave}
                                  >
                                    <path
                                      d={createPieSlice(startAngle, endAngle, radius, centerX, centerY)}
                                      fill={colorById.get(div.id) || colors[idx % colors.length]}
                                      style={{
                                        filter: isHovered ? 'brightness(1.12)' : undefined,
                                        transition: 'filter 0.2s ease-out',
                                      }}
                                    />
                                  </g>
                                );
                              })
                            )}
                          </svg>
                          {pieTooltip?.chart === 'opp' &&
                            createPortal(
                              <div
                                className="fixed z-[9999] pointer-events-none px-2.5 py-1.5 rounded-lg shadow-xl bg-gray-900 text-white text-xs whitespace-nowrap transition-shadow duration-150"
                                style={{ left: pieTooltipPos.x + 10, top: pieTooltipPos.y + 10 }}
                              >
                                <div className="font-semibold">{pieTooltip.label}</div>
                                <div className="text-gray-300">
                                  {oppDivisionDisplayMode === 'value'
                                    ? `${formatCurrency(pieTooltip.value)} (${pieTooltip.percentage.toFixed(0)}%)`
                                    : `${pieTooltip.value} (${pieTooltip.percentage.toFixed(0)}%)`}
                                </div>
                              </div>,
                              document.body
                            )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1 text-xs overflow-y-auto py-0.5 border-l border-gray-200 pl-3">
                          {divisionsForList.length === 0 ? (
                            <div className="text-xs text-gray-400">No data</div>
                          ) : divisionsForList.slice(0, 7).map((div) => {
                            const valuePercentage = oppDivisionDisplayMode === 'value' && total > 0
                              ? ((div.opportunities_value || 0) / total) * 100
                              : 0;
                            const countPercentage = oppDivisionDisplayMode === 'quantity' && total > 0
                              ? ((div.opportunities_count || 0) / total) * 100
                              : 0;
                            const dotColor = colorById.get(div.id) || '#d1d5db';
                            
                            return (
                              <div key={div.id}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: dotColor }}
                                  />
                                  <span className="text-gray-700 truncate flex-1 min-w-0 pr-2">{div.label}</span>
                                  <span className="text-gray-900 font-semibold tabular-nums text-right min-w-[120px]">
                                    {oppDivisionDisplayMode === 'value' ? (
                                      <>
                                        {formatCurrency(div.opportunities_value || 0)} ({valuePercentage.toFixed(0)}%)
                                      </>
                                    ) : (
                                      <>
                                        <CountUp value={div.opportunities_count || 0} enabled={hasAnimated} /> ({countPercentage.toFixed(0)}%)
                                      </>
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </AppCard>
              </LoadingOverlay>

                {/* Projects by Division */}
                <LoadingOverlay isLoading={projDivisionsLoading} minHeight="min-h-[200px]">
                <AppCard
                  className={uiCx('flex flex-col transition-all duration-200 ease-out hover:-translate-y-0.5', chartCardAnimClass)}
                  bodyClassName={uiCx(uiSpacing.cardPadding, 'flex flex-1 flex-col min-h-0')}
                >
                  <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
                    <div className={uiTypography.overline}>
                      Projects by Division{selectedDivision ? ` - ${selectedDivision.label}` : ''}
                    </div>
                    <DashboardChartFilters
                      dateFilter={projDivisionDateFilter}
                      setDateFilter={setProjDivisionDateFilter}
                      customStart={projDivisionCustomStart}
                      customEnd={projDivisionCustomEnd}
                      openCustomModal={() => setProjDivisionModalOpen(true)}
                      displayMode={projDivisionDisplayMode}
                      setDisplayMode={setProjDivisionDisplayMode}
                    />
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    {projStatsByDivision.length === 0 ? (
                      <p className={uiCx(uiTypography.helper, 'text-center')}>No data</p>
                    ) : (() => {
                    const colors = coolPalette;
                    const divisionsForList = projStatsByDivision
                      .filter(d => (d.projects_count || 0) > 0)
                      .slice()
                      .sort((a, b) => {
                        return projDivisionDisplayMode === 'value'
                          ? (b.projects_value || 0) - (a.projects_value || 0)
                          : (b.projects_count || 0) - (a.projects_count || 0);
                      });

                    const divisionsForChart = projDivisionDisplayMode === 'value'
                      ? divisionsForList.filter(d => (d.projects_value || 0) > 0)
                      : divisionsForList;

                    const total = projDivisionDisplayMode === 'value'
                      ? divisionsForChart.reduce((sum, d) => sum + (d.projects_value || 0), 0)
                      : divisionsForChart.reduce((sum, d) => sum + (d.projects_count || 0), 0);

                    const hasChartData = total > 0 && divisionsForChart.length > 0;

                    const colorById = new Map<string, string>();
                    divisionsForChart.forEach((d, idx) => {
                      colorById.set(d.id, colors[idx % colors.length]);
                    });

                    const radius = 40;
                    const centerX = 50;
                    const centerY = 50;
                    const explodeOffset = 5;
                    const handleProjSliceMouseEnter = (div: typeof divisionsForChart[0], ev: React.MouseEvent) => {
                      const val = projDivisionDisplayMode === 'value' ? (div.projects_value || 0) : (div.projects_count || 0);
                      const pct = total > 0 ? (val / total) * 100 : 0;
                      setPieTooltip({
                        chart: 'proj',
                        label: div.label,
                        value: val,
                        percentage: pct,
                        profit: div.projects_profit,
                      });
                      setPieTooltipPos({ x: ev.clientX, y: ev.clientY });
                    };
                    const handleProjSliceMouseMove = (ev: React.MouseEvent) => {
                      if (pieTooltip?.chart === 'proj') setPieTooltipPos({ x: ev.clientX, y: ev.clientY });
                    };
                    const handleProjSliceMouseLeave = () => {
                      setPieTooltip((prev) => (prev?.chart === 'proj' ? null : prev));
                    };
                    let currentAngle = 0;
                    return (
                      <div className="flex flex-row gap-3 flex-1 min-h-0 w-full">
                        <div className="flex-[0_0_40%] min-w-0 min-h-0 flex items-center justify-center relative">
                          <svg
                            viewBox="0 0 100 100"
                            className="w-full h-full max-w-full max-h-full min-h-[80px]"
                            preserveAspectRatio="xMidYMid meet"
                            onMouseLeave={handleProjSliceMouseLeave}
                          >
                            {!hasChartData ? (
                              <circle cx={centerX} cy={centerY} r={radius} fill="#e5e7eb" />
                            ) : divisionsForChart.length === 1 ? (
                              <circle cx={centerX} cy={centerY} r={radius} fill={colors[0]} />
                            ) : (
                              divisionsForChart.map((div, idx) => {
                                const percentage = projDivisionDisplayMode === 'value'
                                  ? ((div.projects_value || 0) / total) * 100
                                  : ((div.projects_count || 0) / total) * 100;
                                const angle = (percentage / 100) * 360;
                                const startAngle = currentAngle;
                                const endAngle = currentAngle + angle;
                                currentAngle = endAngle;
                                const midAngle = (startAngle + endAngle) / 2;
                                const isHovered = pieTooltip?.chart === 'proj' && pieTooltip?.label === div.label;
                                const { x: ox, y: oy } = polarToCartesian(centerX, centerY, explodeOffset, midAngle);
                                const tx = isHovered ? ox - centerX : 0;
                                const ty = isHovered ? oy - centerY : 0;
                                return (
                                  <g
                                    key={div.id}
                                    transform={`translate(${tx}, ${ty})`}
                                    style={{
                                      cursor: 'pointer',
                                      opacity: hasAnimated ? 1 : 0,
                                      transition: `transform 0.15s ease-out, opacity 400ms ease-out ${hasAnimated ? idx * 80 + 'ms' : '0ms'}`,
                                    }}
                                    onMouseEnter={(ev) => handleProjSliceMouseEnter(div, ev)}
                                    onMouseMove={handleProjSliceMouseMove}
                                    onMouseLeave={handleProjSliceMouseLeave}
                                  >
                                    <path
                                      d={createPieSlice(startAngle, endAngle, radius, centerX, centerY)}
                                      fill={colorById.get(div.id) || colors[idx % colors.length]}
                                      style={{
                                        filter: isHovered ? 'brightness(1.12)' : undefined,
                                        transition: 'filter 0.2s ease-out',
                                      }}
                                    />
                                  </g>
                                );
                              })
                            )}
                          </svg>
                          {pieTooltip?.chart === 'proj' &&
                            createPortal(
                              <div
                                className="fixed z-[9999] pointer-events-none px-2.5 py-1.5 rounded-lg shadow-xl bg-gray-900 text-white text-xs whitespace-nowrap transition-shadow duration-150"
                                style={{ left: pieTooltipPos.x + 10, top: pieTooltipPos.y + 10 }}
                              >
                                <div className="font-semibold">{pieTooltip.label}</div>
                                <div className="text-gray-300">
                                  {projDivisionDisplayMode === 'value'
                                    ? `${formatCurrency(pieTooltip.value)} (${pieTooltip.percentage.toFixed(0)}%)`
                                    : `${pieTooltip.value} (${pieTooltip.percentage.toFixed(0)}%)`}
                                </div>
                              </div>,
                              document.body
                            )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1 text-xs overflow-y-auto py-0.5 border-l border-gray-200 pl-3">
                          {divisionsForList.length === 0 ? (
                            <div className="text-xs text-gray-400">No data</div>
                          ) : divisionsForList.slice(0, 7).map((div) => {
                            const valuePercentage = projDivisionDisplayMode === 'value' && total > 0
                              ? ((div.projects_value || 0) / total) * 100
                              : 0;
                            const countPercentage = projDivisionDisplayMode === 'quantity' && total > 0
                              ? ((div.projects_count || 0) / total) * 100
                              : 0;
                            const dotColor = colorById.get(div.id) || '#d1d5db';
                            
                            return (
                              <div key={div.id}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: dotColor }}
                                  />
                                  <span className="text-gray-700 truncate flex-1 min-w-0 pr-2">{div.label}</span>
                                  <span className="text-gray-900 font-semibold tabular-nums text-right min-w-[120px]">
                                    {projDivisionDisplayMode === 'value' ? (
                                      <>
                                        {formatCurrency(div.projects_value || 0)} ({valuePercentage.toFixed(0)}%)
                                      </>
                                    ) : (
                                      <>
                                        <CountUp value={div.projects_count || 0} enabled={hasAnimated} /> ({countPercentage.toFixed(0)}%)
                                      </>
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </AppCard>
              </LoadingOverlay>
            </div>

            {/* Row 2: Opportunities by Status / Projects by Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
              {/* Opportunities by Status (horizontal bars) */}
              <LoadingOverlay isLoading={oppStatusLoading} minHeight="min-h-[200px]">
                  <AppCard
                    className={uiCx('min-w-0 transition-all duration-200 ease-out hover:-translate-y-0.5', chartCardAnimClass)}
                    bodyClassName={uiSpacing.cardPadding}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className={uiTypography.overline}>
                        Opportunities by Status{selectedDivision ? ` - ${selectedDivision.label}` : ''}
                      </div>
                      <DashboardChartFilters
                        dateFilter={oppStatusDateFilter}
                        setDateFilter={setOppStatusDateFilter}
                        customStart={oppStatusCustomStart}
                        customEnd={oppStatusCustomEnd}
                        openCustomModal={() => setOppStatusModalOpen(true)}
                        displayMode={oppStatusDisplayMode}
                        setDisplayMode={setOppStatusDisplayMode}
                      />
                    </div>
                    <div className="space-y-2">
                      {oppStatusStats && Object.entries(oppStatusStats.opportunities_by_status).length > 0 ? (
                        (() => {
                          const entries = Object.entries(oppStatusStats.opportunities_by_status)
                            .filter(([, data]) => {
                              if (oppStatusDisplayMode === 'value') {
                                const valueData = data as StatusValueData;
                                return valueData && valueData.final_total_with_gst > 0;
                              } else {
                                return typeof data === 'number' && data > 0;
                              }
                            });
                          if (entries.length === 0) {
                            return <p className={uiTypography.helper}>No status data</p>;
                          }
                          const sorted = oppStatusDisplayMode === 'value'
                            ? entries.sort(([, a], [, b]) => {
                                const valA = typeof a === 'object' && a !== null && 'final_total_with_gst' in a
                                  ? (a as StatusValueData).final_total_with_gst : 0;
                                const valB = typeof b === 'object' && b !== null && 'final_total_with_gst' in b
                                  ? (b as StatusValueData).final_total_with_gst : 0;
                                return valB - valA;
                              })
                            : entries.sort(([, a], [, b]) => (b as number) - (a as number));

                          const totalCount = oppStatusDisplayMode === 'quantity' 
                            ? sorted.slice(0, 6).reduce((sum, [, d]) => sum + (typeof d === 'number' ? d : 0), 0)
                            : 0;
                          const totalValue = oppStatusDisplayMode === 'value'
                            ? sorted.slice(0, 6).reduce((sum, [, d]) => {
                                if (typeof d === 'object' && d !== null && 'final_total_with_gst' in d) {
                                  return sum + (d as StatusValueData).final_total_with_gst;
                                }
                                return sum;
                              }, 0)
                            : 0;
                          return sorted.slice(0, 6).map(([status, data]) => {
                            if (oppStatusDisplayMode === 'value') {
                              const valueData = data as StatusValueData;
                              const finalTotalPercentage = (valueData.final_total_with_gst / maxOpportunityStatusCount) * 100;
                              const valuePercentage = totalValue > 0 ? (valueData.final_total_with_gst / totalValue) * 100 : 0;
                              return (
                                <div key={status} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 truncate w-28">
                                    {status}
                                  </span>
                                  <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative">
                                    <div
                                      className="bg-gradient-to-r from-[#14532d] to-[#22c55e] rounded-full h-3 transition-all duration-500 ease-out absolute inset-0"
                                      style={{ width: `${finalTotalPercentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-gray-900 whitespace-nowrap">
                                    {formatCurrency(valueData.final_total_with_gst)} ({valuePercentage.toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            } else {
                              const count = data as number;
                              const percentage = totalCount > 0 ? (count / totalCount) * 100 : 0;
                              const barPercentage = (count / maxOpportunityStatusCount) * 100;
                              return (
                                <div key={status} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 truncate w-28">
                                    {status}
                                  </span>
                                  <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative">
                                    <div
                                      className="bg-gradient-to-r from-[#14532d] to-[#22c55e] rounded-full h-3 transition-all duration-500 ease-out"
                                      style={{ width: `${barPercentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-gray-900 whitespace-nowrap">
                                    <CountUp value={count} enabled={hasAnimated || oppStatusStats !== undefined} /> ({percentage.toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            }
                          });
                        })()
                      ) : (
                        <p className={uiTypography.helper}>No status data</p>
                      )}
                    </div>
                  </AppCard>
                  </LoadingOverlay>

                {/* Projects by Status (horizontal bars) */}
                <LoadingOverlay isLoading={projStatusLoading} minHeight="min-h-[200px]">
                  <AppCard
                    className={uiCx('min-w-0 transition-all duration-200 ease-out hover:-translate-y-0.5', chartCardAnimClass)}
                    bodyClassName={uiSpacing.cardPadding}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className={uiTypography.overline}>
                        Projects by Status{selectedDivision ? ` - ${selectedDivision.label}` : ''}
                      </div>
                      <DashboardChartFilters
                        dateFilter={projStatusDateFilter}
                        setDateFilter={setProjStatusDateFilter}
                        customStart={projStatusCustomStart}
                        customEnd={projStatusCustomEnd}
                        openCustomModal={() => setProjStatusModalOpen(true)}
                        displayMode={projStatusDisplayMode}
                        setDisplayMode={setProjStatusDisplayMode}
                      />
                    </div>
                    <div className="space-y-2">
                      {projStatusStats && Object.entries(projStatusStats.projects_by_status).length > 0 ? (
                        (() => {
                          const entries = Object.entries(projStatusStats.projects_by_status)
                            .filter(([, data]) => {
                              if (projStatusDisplayMode === 'value') {
                                const valueData = data as StatusValueData;
                                return valueData && valueData.final_total_with_gst > 0;
                              } else {
                                return typeof data === 'number' && data > 0;
                              }
                            });
                          if (entries.length === 0) {
                            return <p className={uiTypography.helper}>No status data</p>;
                          }
                          const sorted = projStatusDisplayMode === 'value'
                            ? entries.sort(([, a], [, b]) => {
                                const valA = typeof a === 'object' && a !== null && 'final_total_with_gst' in a
                                  ? (a as StatusValueData).final_total_with_gst : 0;
                                const valB = typeof b === 'object' && b !== null && 'final_total_with_gst' in b
                                  ? (b as StatusValueData).final_total_with_gst : 0;
                                return valB - valA;
                              })
                            : entries.sort(([, a], [, b]) => (b as number) - (a as number));

                          const totalCount = projStatusDisplayMode === 'quantity' 
                            ? sorted.slice(0, 6).reduce((sum, [, d]) => sum + (typeof d === 'number' ? d : 0), 0)
                            : 0;
                          const totalValue = projStatusDisplayMode === 'value'
                            ? sorted.slice(0, 6).reduce((sum, [, d]) => {
                                if (typeof d === 'object' && d !== null && 'final_total_with_gst' in d) {
                                  return sum + (d as StatusValueData).final_total_with_gst;
                                }
                                return sum;
                              }, 0)
                            : 0;
                          return sorted.slice(0, 6).map(([status, data]) => {
                            if (projStatusDisplayMode === 'value') {
                              const valueData = data as StatusValueData;
                              const finalTotalPercentage = (valueData.final_total_with_gst / maxProjectStatusCount) * 100;
                              const valuePercentage = totalValue > 0 ? (valueData.final_total_with_gst / totalValue) * 100 : 0;
                              return (
                                <div key={status} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 truncate w-28">
                                    {status}
                                  </span>
                                  <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative">
                                    <div
                                      className="bg-gradient-to-r from-[#0b1739] to-[#1d4ed8] rounded-full h-3 transition-all duration-500 ease-out absolute inset-0"
                                      style={{ width: `${finalTotalPercentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-gray-900 whitespace-nowrap">
                                    {formatCurrency(valueData.final_total_with_gst)} ({valuePercentage.toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            } else {
                              const count = data as number;
                              const percentage = totalCount > 0 ? (count / totalCount) * 100 : 0;
                              const barPercentage = (count / maxProjectStatusCount) * 100;
                              return (
                                <div key={status} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 truncate w-28">
                                    {status}
                                  </span>
                                  <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative">
                                    <div
                                      className="bg-gradient-to-r from-[#0b1739] to-[#1d4ed8] rounded-full h-3 transition-all duration-500 ease-out"
                                      style={{ width: `${barPercentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-gray-900 whitespace-nowrap">
                                    <CountUp value={count} enabled={hasAnimated || projStatusStats !== undefined} /> ({percentage.toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            }
                          });
                        })()
                      ) : (
                        <p className={uiTypography.helper}>No status data</p>
                      )}
                    </div>
                  </AppCard>
                  </LoadingOverlay>
                </div>
            </div>
          </section>

        {/* Section 2: Division Cards Grid */}
        {divisionsError ? (
          <AppCard className="border-red-200 bg-red-50" bodyClassName={uiSpacing.cardPadding}>
            <AppEmptyState
              title="Error loading divisions"
              description={
                <>
                  <span className="text-red-700">{String(divisionsError)}</span>
                  <span className="mt-2 block text-gray-500">Check console for details</span>
                </>
              }
            />
          </AppCard>
        ) : (selectedDivisionId ? oppStatsByDivision.length > 0 || projStatsByDivision.length > 0 : divisions.length > 0) ? (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {selectedDivisionId ? (
                // Mode Focus: Show subdivision cards or division card if no subdivisions
                oppStatsByDivision.map((subdivisionStat, idx) => {
                  const oppCount = subdivisionStat.opportunities_count || 0;
                  const projCount = subdivisionStat.projects_count || 0;
                  
                  // Use parent division icon for subdivisions, or division icon if showing division itself
                  const isDivisionItself = subdivisionStat.id === selectedDivisionId;
                  const icon = isDivisionItself 
                    ? getDivisionIcon(selectedDivision?.label || subdivisionStat.label)
                    : (selectedDivision ? getDivisionIcon(selectedDivision.label) : getDivisionIcon(subdivisionStat.label));
                  
                  return (
                    <AppCard
                      key={subdivisionStat.id}
                      className={uiCx('group flex h-full flex-col transition-all duration-200 ease-out hover:-translate-y-0.5', divisionCardAnimClass)}
                      bodyClassName={uiCx(uiSpacing.cardPadding, 'flex flex-1 flex-col')}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="shrink-0 text-2xl">{icon}</div>
                          <div className={uiTypography.sectionTitle}>{subdivisionStat.label}</div>
                        </div>
                      </div>

                      <div className={uiCx('mt-auto flex items-center border-t pt-3 text-sm', uiBorders.subtle)}>
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewOpportunities(subdivisionStat.id);
                          }}
                          className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-all group border border-transparent hover:border-gray-200 flex-1 flex items-center justify-center gap-1.5"
                          title="View Opportunities"
                        >
                          <span className="text-sm font-bold text-brand-red opacity-95 transition-all duration-150 group-hover:opacity-100">
                            <CountUp value={oppCount} enabled={hasAnimated} />
                          </span>
                          <span className={uiCx(uiTypography.overline, 'group-hover:text-brand-red')}>
                            Opportunities
                          </span>
                        </div>
                        <div className="h-8 w-px bg-gray-200" />
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewProjects(subdivisionStat.id);
                          }}
                          className={uiCx(
                            'group flex flex-1 cursor-pointer items-center justify-center gap-1.5 border border-transparent p-2 transition-all hover:border-gray-200 hover:bg-gray-50',
                            uiRadius.control,
                          )}
                          title="View Projects"
                        >
                          <span className="text-sm font-bold text-brand-red opacity-95 transition-all duration-150 group-hover:opacity-100">
                            <CountUp value={projCount} enabled={hasAnimated} />
                          </span>
                          <span className={uiCx(uiTypography.overline, 'group-hover:text-brand-red')}>
                            Projects
                          </span>
                        </div>
                      </div>
                    </AppCard>
                  );
                })
              ) : (
                // Mode Overview: Show all division cards
                divisions.map((division, idx) => {
                  // Use opportunities stats for display (or could combine both)
                  const divisionStat = oppStatsByDivision.find(s => s.id === division.id) || projStatsByDivision.find(s => s.id === division.id);
                  const oppCount = divisionStat?.opportunities_count || 0;
                  const projCount = divisionStat?.projects_count || 0;
                  const hasSubdivisions = division.subdivisions && division.subdivisions.length > 0;

                return (
                  <AppCard
                    key={division.id}
                    className={uiCx('group flex h-full flex-col transition-all duration-200 ease-out hover:-translate-y-0.5', divisionCardAnimClass)}
                    bodyClassName={uiCx(uiSpacing.cardPadding, 'flex flex-1 flex-col')}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="shrink-0 text-2xl">{getDivisionIcon(division.label)}</div>
                        <div className={uiTypography.sectionTitle}>{division.label}</div>
                      </div>
                      {hasSubdivisions && (
                        <div className="group/sub relative shrink-0">
                          <div className={uiCx(uiTypography.overline, 'cursor-pointer whitespace-nowrap bg-gray-100 px-2 py-1', uiRadius.control)}>
                            {division.subdivisions.length} sub
                          </div>
                          <div className="absolute right-0 bottom-full mb-1 px-2 py-1.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover/sub:opacity-100 transition-opacity pointer-events-none z-10 min-w-max">
                            <div className="space-y-0.5">
                              {division.subdivisions.map((sub) => (
                                <div key={sub.id}>{sub.label}</div>
                              ))}
                            </div>
                            <div className="absolute -bottom-1 right-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={uiCx('mt-auto flex items-center border-t pt-3 text-sm', uiBorders.subtle)}>
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewOpportunities(division.id);
                        }}
                        className={uiCx(
                          'group flex flex-1 cursor-pointer items-center justify-center gap-1.5 border border-transparent p-2 transition-all hover:border-gray-200 hover:bg-gray-50',
                          uiRadius.control,
                        )}
                        title="View Opportunities"
                      >
                        <span className="text-sm font-bold text-brand-red opacity-95 transition-all duration-150 group-hover:opacity-100">
                          <CountUp value={oppCount} enabled={hasAnimated} />
                        </span>
                        <span className={uiCx(uiTypography.overline, 'group-hover:text-brand-red')}>
                          Opportunities
                        </span>
                      </div>
                      <div className="h-8 w-px bg-gray-200" />
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewProjects(division.id);
                        }}
                        className={uiCx(
                          'group flex flex-1 cursor-pointer items-center justify-center gap-1.5 border border-transparent p-2 transition-all hover:border-gray-200 hover:bg-gray-50',
                          uiRadius.control,
                        )}
                        title="View Projects"
                      >
                        <span className="text-sm font-bold text-brand-red opacity-95 transition-all duration-150 group-hover:opacity-100">
                          <CountUp value={projCount} enabled={hasAnimated} />
                        </span>
                        <span className={uiCx(uiTypography.overline, 'group-hover:text-brand-red')}>
                          Projects
                        </span>
                      </div>
                    </div>
                  </AppCard>
                );
              })
              )}
            </div>
          </section>
        ) : (
          <AppCard bodyClassName={uiSpacing.cardPadding}>
            <AppEmptyState
              title="No project divisions found"
              description={
                divisionsLoading ? 'Loading...' : 'Please run the seed script to create divisions.'
              }
              action={
                <AppButton
                  type="button"
                  size="sm"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: PROJECT_DIVISIONS_QUERY_KEY });
                    refetchDivisions();
                  }}
                >
                  Retry
                </AppButton>
              }
            />
          </AppCard>
        )}

        {/* Section 3: Quick Actions */}
        <section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Link
              to={`/opportunities${selectedDivisionId ? `?division_id=${encodeURIComponent(selectedDivisionId)}` : ''}`}
              className="block"
            >
              <AppCard className="transition-all duration-200 ease-out hover:-translate-y-0.5" bodyClassName={uiSpacing.cardPadding}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className={uiTypography.sectionTitle}>View All Opportunities</div>
                    <p className={uiTypography.sectionSubtitle}>
                      Browse and manage all bidding opportunities
                    </p>
                  </div>
                  <div className="text-xl text-gray-400">→</div>
                </div>
              </AppCard>
            </Link>

            <Link
              to={`/projects${selectedDivisionId ? `?division_id=${encodeURIComponent(selectedDivisionId)}` : ''}`}
              className="block"
            >
              <AppCard className="transition-all duration-200 ease-out hover:-translate-y-0.5" bodyClassName={uiSpacing.cardPadding}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className={uiTypography.sectionTitle}>View All Projects</div>
                    <p className={uiTypography.sectionSubtitle}>
                      Browse and manage all active projects
                    </p>
                  </div>
                  <div className="text-xl text-gray-400">→</div>
                </div>
              </AppCard>
            </Link>
          </div>
        </section>

        {/* Date Range Modals */}
        <DateRangeModal
          open={oppDivisionModalOpen}
          onClose={() => {
            setOppDivisionModalOpen(false);
            // Reset filter if no dates were set
            if (!oppDivisionCustomStart || !oppDivisionCustomEnd) {
              setOppDivisionDateFilter('all');
            }
          }}
          onConfirm={(startDate, endDate) => {
            setOppDivisionCustomStart(startDate);
            setOppDivisionCustomEnd(endDate);
            setOppDivisionModalOpen(false);
          }}
          initialStartDate={oppDivisionCustomStart}
          initialEndDate={oppDivisionCustomEnd}
        />

        <DateRangeModal
          open={projDivisionModalOpen}
          onClose={() => {
            setProjDivisionModalOpen(false);
            // Reset filter if no dates were set
            if (!projDivisionCustomStart || !projDivisionCustomEnd) {
              setProjDivisionDateFilter('all');
            }
          }}
          onConfirm={(startDate, endDate) => {
            setProjDivisionCustomStart(startDate);
            setProjDivisionCustomEnd(endDate);
            setProjDivisionModalOpen(false);
          }}
          initialStartDate={projDivisionCustomStart}
          initialEndDate={projDivisionCustomEnd}
        />

        <DateRangeModal
          open={oppStatusModalOpen}
          onClose={() => {
            setOppStatusModalOpen(false);
            // Reset filter if no dates were set
            if (!oppStatusCustomStart || !oppStatusCustomEnd) {
              setOppStatusDateFilter('all');
            }
          }}
          onConfirm={(startDate, endDate) => {
            setOppStatusCustomStart(startDate);
            setOppStatusCustomEnd(endDate);
            setOppStatusModalOpen(false);
          }}
          initialStartDate={oppStatusCustomStart}
          initialEndDate={oppStatusCustomEnd}
        />

        <DateRangeModal
          open={projStatusModalOpen}
          onClose={() => {
            setProjStatusModalOpen(false);
            // Reset filter if no dates were set
            if (!projStatusCustomStart || !projStatusCustomEnd) {
              setProjStatusDateFilter('all');
            }
          }}
          onConfirm={(startDate, endDate) => {
            setProjStatusCustomStart(startDate);
            setProjStatusCustomEnd(endDate);
            setProjStatusModalOpen(false);
          }}
          initialStartDate={projStatusCustomStart}
          initialEndDate={projStatusCustomEnd}
        />
      </div>
    </LoadingOverlay>
  );
}
