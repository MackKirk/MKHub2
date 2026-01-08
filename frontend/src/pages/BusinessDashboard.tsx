import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[400px] max-w-[95vw] bg-white rounded-lg shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b font-semibold">Custom Date Range</div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="p-3 flex items-center justify-end gap-2 border-t">
          <button 
            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-800" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="px-4 py-2 rounded bg-[#7f1010] hover:bg-[#a31414] text-white disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={handleConfirm}
            disabled={!startDate || !endDate}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
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

// Icon mapping for divisions
const getDivisionIcon = (label: string): string => {
  const iconMap: Record<string, string> = {
    'Roofing': '🏠',
    'Concrete Restoration & Waterproofing': '🏗️',
    'Cladding & Exterior Finishes': '🧱',
    'Repairs & Maintenance': '🔧',
    'Mechanical': '🔩',
    'Electrical': '⚡',
    'Carpentry': '🪵',
    'Welding & Custom Fabrication': '🔥',
    'Structural Upgrading': '📐',
    'Solar PV': '☀️',
    'Green Roofing': '🌱',
  };
  return iconMap[label] || '📦';
};

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
const warmPalette = ['#7f1010', '#a31414', '#d11616', '#ee2b2b', '#f97316', '#f59e0b', '#fbbf24', '#fde68a'];
const coolPalette = ['#0b1739', '#0f2a5a', '#1d4ed8', '#2563eb', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc'];

type DateFilterType = 'all' | 'last_year' | 'last_6_months' | 'last_3_months' | 'last_month' | 'custom';

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

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
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
  
  // Get project divisions (hierarchical)
  const { data: divisionsData, isLoading: divisionsLoading, error: divisionsError, refetch: refetchDivisions } = useQuery<ProjectDivision[]>({
    queryKey: ['project-divisions'],
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
    queryKey: ['business-divisions-stats-opp', selectedDivisionId, oppDivisionDateRange.date_from, oppDivisionDateRange.date_to, oppDivisionDisplayMode],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (selectedDivisionId) params.set('division_id', selectedDivisionId);
        if (oppDivisionDateRange.date_from) params.set('date_from', oppDivisionDateRange.date_from);
        if (oppDivisionDateRange.date_to) params.set('date_to', oppDivisionDateRange.date_to);
        params.set('mode', oppDivisionDisplayMode);
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
    queryKey: ['business-divisions-stats-proj', selectedDivisionId, projDivisionDateRange.date_from, projDivisionDateRange.date_to, projDivisionDisplayMode],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (selectedDivisionId) params.set('division_id', selectedDivisionId);
        if (projDivisionDateRange.date_from) params.set('date_from', projDivisionDateRange.date_from);
        if (projDivisionDateRange.date_to) params.set('date_to', projDivisionDateRange.date_to);
        params.set('mode', projDivisionDisplayMode);
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
    queryKey: ['business-dashboard-opp-status', selectedDivisionId, oppStatusDateRange.date_from, oppStatusDateRange.date_to, oppStatusDisplayMode],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedDivisionId) params.set('division_id', selectedDivisionId);
      if (oppStatusDateRange.date_from) params.set('date_from', oppStatusDateRange.date_from);
      if (oppStatusDateRange.date_to) params.set('date_to', oppStatusDateRange.date_to);
      params.set('mode', oppStatusDisplayMode);
      return api('GET', `/projects/business/dashboard?${params.toString()}`);
    },
  });

  // Get dashboard stats for Projects by Status
  const { data: projStatusStats, isLoading: projStatusLoading } = useQuery<DashboardStats>({
    queryKey: ['business-dashboard-proj-status', selectedDivisionId, projStatusDateRange.date_from, projStatusDateRange.date_to, projStatusDisplayMode],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedDivisionId) params.set('division_id', selectedDivisionId);
      if (projStatusDateRange.date_from) params.set('date_from', projStatusDateRange.date_from);
      if (projStatusDateRange.date_to) params.set('date_to', projStatusDateRange.date_to);
      params.set('mode', projStatusDisplayMode);
      return api('GET', `/projects/business/dashboard?${params.toString()}`);
    },
  });

  const divisions = Array.isArray(divisionsData) ? divisionsData : [];
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
  }, [selectedDivisionId, queryClient]);
  
  // Check if we're still loading critical initial data (not refetching)
  // Only show overlay on first load, not on background refetches
  const isInitialLoading = (divisionsLoading && !divisionsData);
  
  // Track when initial data is loaded to trigger entry animations
  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, hasAnimated]);

  const handleViewOpportunities = (divisionId?: string) => {
    const params = divisionId ? `?division_id=${encodeURIComponent(divisionId)}` : '';
    navigate(`/opportunities${params}`);
  };

  const handleViewProjects = (divisionId?: string) => {
    const params = divisionId ? `?division_id=${encodeURIComponent(divisionId)}` : '';
    navigate(`/projects${params}`);
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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <LoadingOverlay isLoading={isInitialLoading} text="Loading dashboard data...">
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6">
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">
              Business Dashboard{selectedDivision ? ` • ${selectedDivision.label}` : ''}
            </div>
            <div className="text-sm text-gray-500 font-medium">
              Opportunities and projects grouped by division
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
            <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-2">Filter by:</span>
            <div className="relative group">
              <button
                onClick={() => setSelectedDivisionId(null)}
                className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${
                  selectedDivisionId === null
                    ? 'bg-[#7f1010] text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                Show All
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900 rotate-45"></div>
              </div>
            </div>
            {divisions.map((division) => {
              const isActive = selectedDivisionId === division.id;
              const icon = getDivisionIcon(division.label);
              return (
                <div key={division.id} className="relative group">
                  <button
                    onClick={() => setSelectedDivisionId(division.id)}
                    className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 text-2xl ${
                      isActive
                        ? 'bg-[#7f1010] text-white shadow-md scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:scale-105'
                    }`}
                    title={division.label}
                  >
                    {icon}
                  </button>
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                    {division.label}
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 1: Charts */}
        <section>
          <div className="space-y-4">
            {/* Row 1: Opportunities by Division / Projects by Division */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
              {/* Opportunities by Division */}
              <LoadingOverlay isLoading={oppDivisionsLoading} minHeight="min-h-[200px]">
              <div 
                className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md flex flex-col"
                style={animationComplete ? {} : {
                  opacity: hasAnimated ? 1 : 0,
                  transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                  transition: 'opacity 400ms ease-out, transform 400ms ease-out'
                }}
              >
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Opportunities by Division{selectedDivision ? ` - ${selectedDivision.label}` : ''}
                  </div>
                  <div className="flex items-center gap-2">
                      <select
                        value={oppDivisionDateFilter}
                        onChange={(e) => {
                          const value = e.target.value as DateFilterType;
                          setOppDivisionDateFilter(value);
                          if (value === 'custom') {
                            setOppDivisionModalOpen(true);
                          }
                        }}
                        className="border border-gray-300 rounded px-2 py-1 text-xs"
                      >
                        <option value="all">All time</option>
                        <option value="last_year">Last year</option>
                        <option value="last_6_months">Last 6 months</option>
                        <option value="last_3_months">Last 3 months</option>
                        <option value="last_month">Last month</option>
                        <option value="custom">Custom</option>
                      </select>
                      {oppDivisionDateFilter === 'custom' && oppDivisionCustomStart && oppDivisionCustomEnd && (
                        <div className="relative group">
                          <button
                            onClick={() => setOppDivisionModalOpen(true)}
                            className="text-gray-500 hover:text-[#7f1010] transition-colors p-1"
                            title={`${formatDateForDisplay(oppDivisionCustomStart)} - ${formatDateForDisplay(oppDivisionCustomEnd)}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <div className="absolute right-0 bottom-full mb-2 px-2 py-1.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                            {formatDateForDisplay(oppDivisionCustomStart)} - {formatDateForDisplay(oppDivisionCustomEnd)}
                            <div className="absolute -bottom-1 right-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                          </div>
                        </div>
                      )}
                      <select
                        value={oppDivisionDisplayMode}
                        onChange={(e) => setOppDivisionDisplayMode(e.target.value as 'quantity' | 'value')}
                        className="border border-gray-300 rounded px-2 py-1 text-xs"
                      >
                        <option value="quantity">Quantity</option>
                        <option value="value">Value</option>
                      </select>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  {oppStatsByDivision.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center">No data</div>
                  ) : (() => {
                    const colors = warmPalette;
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

                    let currentAngle = 0;
                    const radius = 50;
                    const centerX = 60;
                    const centerY = 60;
                    return (
                      <div className="flex flex-col sm:flex-row items-center gap-4 justify-center w-full max-w-[760px] mx-auto px-2">
                        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
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
                              return (
                                <path
                                  key={div.id}
                                  d={createPieSlice(startAngle, endAngle, radius, centerX, centerY)}
                                  fill={colorById.get(div.id) || colors[idx % colors.length]}
                                  className="hover:opacity-80 transition-opacity"
                                  style={{
                                    opacity: hasAnimated ? 1 : 0,
                                    transition: `opacity 400ms ease-out ${hasAnimated ? idx * 80 + 'ms' : '0ms'}`
                                  }}
                                />
                              );
                            })
                          )}
                        </svg>
                        <div className="space-y-1 text-xs w-full flex-1 min-w-0">
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
                              <div key={div.id} className={oppDivisionDisplayMode === 'value' ? 'space-y-1' : ''}>
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
                                {oppDivisionDisplayMode === 'value' && div.opportunities_profit !== undefined && (
                                  <div className="flex items-center gap-2 pl-5">
                                    <span className="flex-1 min-w-0" />
                                    <span className="text-gray-700 font-semibold text-xs tabular-nums text-right min-w-[160px]">
                                      <span className="text-gray-500 font-medium">Profit:</span>{' '}
                                      {formatCurrency(div.opportunities_profit || 0)}{' '}
                                      {div.opportunities_value > 0 ? `(${(((div.opportunities_profit || 0) / (div.opportunities_value || 1)) * 100).toFixed(0)}%)` : '(0%)'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                </div>
              </LoadingOverlay>

                {/* Projects by Division */}
                <LoadingOverlay isLoading={projDivisionsLoading} minHeight="min-h-[200px]">
                <div 
                  className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md flex flex-col"
                  style={animationComplete ? {} : {
                    opacity: hasAnimated ? 1 : 0,
                    transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                    transition: `opacity 400ms ease-out 50ms, transform 400ms ease-out 50ms`
                  }}
                >
                  <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Projects by Division{selectedDivision ? ` - ${selectedDivision.label}` : ''}
                    </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={projDivisionDateFilter}
                          onChange={(e) => {
                            const value = e.target.value as DateFilterType;
                            setProjDivisionDateFilter(value);
                            if (value === 'custom') {
                              setProjDivisionModalOpen(true);
                            }
                          }}
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="all">All time</option>
                          <option value="last_year">Last year</option>
                          <option value="last_6_months">Last 6 months</option>
                          <option value="last_3_months">Last 3 months</option>
                          <option value="last_month">Last month</option>
                          <option value="custom">Custom</option>
                        </select>
                        {projDivisionDateFilter === 'custom' && projDivisionCustomStart && projDivisionCustomEnd && (
                          <div className="relative group">
                            <button
                              onClick={() => setProjDivisionModalOpen(true)}
                              className="text-gray-500 hover:text-[#7f1010] transition-colors p-1"
                              title={`${formatDateForDisplay(projDivisionCustomStart)} - ${formatDateForDisplay(projDivisionCustomEnd)}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <div className="absolute right-0 bottom-full mb-2 px-2 py-1.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                              {formatDateForDisplay(projDivisionCustomStart)} - {formatDateForDisplay(projDivisionCustomEnd)}
                              <div className="absolute -bottom-1 right-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <select
                          value={projDivisionDisplayMode}
                          onChange={(e) => setProjDivisionDisplayMode(e.target.value as 'quantity' | 'value')}
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="quantity">Quantity</option>
                          <option value="value">Value</option>
                        </select>
                      </div>
                    </div>
                  <div className="flex-1 flex items-center justify-center">
                    {projStatsByDivision.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center">No data</div>
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

                    let currentAngle = 0;
                    const radius = 50;
                    const centerX = 60;
                    const centerY = 60;
                    return (
                      <div className="flex flex-col sm:flex-row items-center gap-4 justify-center w-full max-w-[760px] mx-auto px-2">
                        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
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
                              return (
                                <path
                                  key={div.id}
                                  d={createPieSlice(startAngle, endAngle, radius, centerX, centerY)}
                                  fill={colorById.get(div.id) || colors[idx % colors.length]}
                                  className="hover:opacity-80 transition-opacity"
                                  style={{
                                    opacity: hasAnimated ? 1 : 0,
                                    transition: `opacity 400ms ease-out ${hasAnimated ? idx * 80 + 'ms' : '0ms'}`
                                  }}
                                />
                              );
                            })
                          )}
                        </svg>
                        <div className="space-y-1 text-xs w-full flex-1 min-w-0">
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
                              <div key={div.id} className={projDivisionDisplayMode === 'value' ? 'space-y-1' : ''}>
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
                                {projDivisionDisplayMode === 'value' && div.projects_profit !== undefined && (
                                  <div className="flex items-center gap-2 pl-5">
                                    <span className="flex-1 min-w-0" />
                                    <span className="text-gray-700 font-semibold text-xs tabular-nums text-right min-w-[160px]">
                                      <span className="text-gray-500 font-medium">Profit:</span>{' '}
                                      {formatCurrency(div.projects_profit || 0)}{' '}
                                      {div.projects_value > 0 ? `(${(((div.projects_profit || 0) / (div.projects_value || 1)) * 100).toFixed(0)}%)` : '(0%)'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                </div>
              </LoadingOverlay>
            </div>

            {/* Row 2: Opportunities by Status / Projects by Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
              {/* Opportunities by Status (horizontal bars) */}
              <LoadingOverlay isLoading={oppStatusLoading} minHeight="min-h-[200px]">
                  <div 
                    className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 min-w-0 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
                    style={animationComplete ? {} : {
                      opacity: hasAnimated ? 1 : 0,
                      transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                      transition: `opacity 400ms ease-out 100ms, transform 400ms ease-out 100ms`
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Opportunities by Status{selectedDivision ? ` - ${selectedDivision.label}` : ''}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={oppStatusDateFilter}
                          onChange={(e) => {
                            const value = e.target.value as DateFilterType;
                            setOppStatusDateFilter(value);
                            if (value === 'custom') {
                              setOppStatusModalOpen(true);
                            }
                          }}
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="all">All time</option>
                          <option value="last_year">Last year</option>
                          <option value="last_6_months">Last 6 months</option>
                          <option value="last_3_months">Last 3 months</option>
                          <option value="last_month">Last month</option>
                          <option value="custom">Custom</option>
                        </select>
                        {oppStatusDateFilter === 'custom' && oppStatusCustomStart && oppStatusCustomEnd && (
                          <div className="relative group">
                            <button
                              onClick={() => setOppStatusModalOpen(true)}
                              className="text-gray-500 hover:text-[#7f1010] transition-colors p-1"
                              title={`${formatDateForDisplay(oppStatusCustomStart)} - ${formatDateForDisplay(oppStatusCustomEnd)}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <div className="absolute right-0 bottom-full mb-2 px-2 py-1.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                              {formatDateForDisplay(oppStatusCustomStart)} - {formatDateForDisplay(oppStatusCustomEnd)}
                              <div className="absolute -bottom-1 right-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <select
                          value={oppStatusDisplayMode}
                          onChange={(e) => setOppStatusDisplayMode(e.target.value as 'quantity' | 'value')}
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="quantity">Quantity</option>
                          <option value="value">Value</option>
                        </select>
                      </div>
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
                            return <div className="text-xs text-gray-400">No status data</div>;
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
                              const profitMarginPercentage = valueData.final_total_with_gst > 0
                                ? (valueData.profit / valueData.final_total_with_gst) * 100
                                : 0;
                              const profitBarPercentage = Math.max(0, Math.min(100, profitMarginPercentage));
                              return (
                                <div key={status} className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 truncate w-28">
                                      {status}
                                    </span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative">
                                      <div
                                        className="bg-gradient-to-r from-[#7f1010] to-[#d11616] rounded-full h-3 transition-all duration-500 ease-out absolute inset-0"
                                        style={{ width: `${finalTotalPercentage}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-bold text-gray-900 whitespace-nowrap">
                                      {formatCurrency(valueData.final_total_with_gst)} ({valuePercentage.toFixed(0)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 pl-28">
                                    <span className="flex-1 min-w-0" />
                                    <span className="text-xs font-semibold text-gray-700 whitespace-nowrap tabular-nums text-right min-w-[170px]">
                                      <span className="text-gray-500 font-medium">Profit:</span>{' '}
                                      {formatCurrency(valueData.profit)} ({profitMarginPercentage.toFixed(0)}%)
                                    </span>
                                  </div>
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
                                      className="bg-gradient-to-r from-[#7f1010] to-[#d11616] rounded-full h-3 transition-all duration-500 ease-out"
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
                        <div className="text-xs text-gray-400">No status data</div>
                      )}
                    </div>
                  </div>
                  </LoadingOverlay>

                {/* Projects by Status (horizontal bars) */}
                <LoadingOverlay isLoading={projStatusLoading} minHeight="min-h-[200px]">
                  <div 
                    className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 min-w-0 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
                    style={animationComplete ? {} : {
                      opacity: hasAnimated ? 1 : 0,
                      transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                      transition: `opacity 400ms ease-out 150ms, transform 400ms ease-out 150ms`
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Projects by Status{selectedDivision ? ` - ${selectedDivision.label}` : ''}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={projStatusDateFilter}
                          onChange={(e) => {
                            const value = e.target.value as DateFilterType;
                            setProjStatusDateFilter(value);
                            if (value === 'custom') {
                              setProjStatusModalOpen(true);
                            }
                          }}
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="all">All time</option>
                          <option value="last_year">Last year</option>
                          <option value="last_6_months">Last 6 months</option>
                          <option value="last_3_months">Last 3 months</option>
                          <option value="last_month">Last month</option>
                          <option value="custom">Custom</option>
                        </select>
                        {projStatusDateFilter === 'custom' && projStatusCustomStart && projStatusCustomEnd && (
                          <div className="relative group">
                            <button
                              onClick={() => setProjStatusModalOpen(true)}
                              className="text-gray-500 hover:text-[#7f1010] transition-colors p-1"
                              title={`${formatDateForDisplay(projStatusCustomStart)} - ${formatDateForDisplay(projStatusCustomEnd)}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <div className="absolute right-0 bottom-full mb-2 px-2 py-1.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                              {formatDateForDisplay(projStatusCustomStart)} - {formatDateForDisplay(projStatusCustomEnd)}
                              <div className="absolute -bottom-1 right-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <select
                          value={projStatusDisplayMode}
                          onChange={(e) => setProjStatusDisplayMode(e.target.value as 'quantity' | 'value')}
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="quantity">Quantity</option>
                          <option value="value">Value</option>
                        </select>
                      </div>
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
                            return <div className="text-xs text-gray-400">No status data</div>;
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
                              const profitMarginPercentage = valueData.final_total_with_gst > 0
                                ? (valueData.profit / valueData.final_total_with_gst) * 100
                                : 0;
                              const profitBarPercentage = Math.max(0, Math.min(100, profitMarginPercentage));
                              return (
                                <div key={status} className="space-y-1.5">
                                  <div className="flex items-center gap-2">
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
                                  <div className="flex items-center gap-2 pl-28">
                                    <span className="flex-1 min-w-0" />
                                    <span className="text-xs font-semibold text-gray-700 whitespace-nowrap tabular-nums text-right min-w-[170px]">
                                      <span className="text-gray-500 font-medium">Profit:</span>{' '}
                                      {formatCurrency(valueData.profit)} ({profitMarginPercentage.toFixed(0)}%)
                                    </span>
                                  </div>
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
                        <div className="text-xs text-gray-400">No status data</div>
                      )}
                    </div>
                  </div>
                  </LoadingOverlay>
                </div>
            </div>
          </section>

        {/* Section 2: Division Cards Grid */}
        {divisionsError ? (
          <div className="rounded-lg border border-gray-200 bg-red-50 p-6 text-center">
            <div className="text-red-700 font-semibold mb-2">Error loading divisions</div>
            <div className="text-sm text-red-600">{String(divisionsError)}</div>
            <div className="text-xs text-gray-500 mt-2">Check console for details</div>
          </div>
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
                    <div
                      key={subdivisionStat.id}
                      className="rounded-lg border border-gray-200 bg-white shadow-sm p-5 flex flex-col h-full group transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
                      style={animationComplete ? {} : {
                        opacity: hasAnimated ? 1 : 0,
                        transform: hasAnimated ? 'translateY(0)' : 'translateY(-8px)',
                        transition: `opacity 400ms ease-out ${idx * 50}ms, transform 400ms ease-out ${idx * 50}ms`
                      }}
                    >
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="text-3xl flex-shrink-0">{icon}</div>
                          <div className="text-base font-semibold text-gray-900">{subdivisionStat.label}</div>
                        </div>
                      </div>

                      <div className="mt-auto flex items-center text-sm pt-3 border-t">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewOpportunities(subdivisionStat.id);
                          }}
                          className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-all group border border-transparent hover:border-gray-200 flex-1 flex items-center justify-center gap-1.5"
                          title="View Opportunities"
                        >
                          <span className="text-xl font-bold text-[#7f1010] group-hover:text-[#a31414] group-hover:opacity-100 opacity-95 transition-all duration-150">
                            <CountUp value={oppCount} enabled={hasAnimated} />
                          </span>
                          <span className="text-gray-600 group-hover:text-[#7f1010] transition-colors font-medium text-xs uppercase tracking-wide">
                            Opportunities
                          </span>
                        </div>
                        <div className="h-8 w-px bg-gray-200"></div>
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewProjects(subdivisionStat.id);
                          }}
                          className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-all group border border-transparent hover:border-gray-200 flex-1 flex items-center justify-center gap-1.5"
                          title="View Projects"
                        >
                          <span className="text-xl font-bold text-[#7f1010] group-hover:text-[#a31414] group-hover:opacity-100 opacity-95 transition-all duration-150">
                            <CountUp value={projCount} enabled={hasAnimated} />
                          </span>
                          <span className="text-gray-600 group-hover:text-[#7f1010] transition-colors font-medium text-xs uppercase tracking-wide">
                            Projects
                          </span>
                        </div>
                      </div>
                    </div>
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
                  <div
                    key={division.id}
                    className="rounded-lg border border-gray-200 bg-white shadow-sm p-5 flex flex-col h-full group transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
                    style={animationComplete ? {} : {
                      opacity: hasAnimated ? 1 : 0,
                      transform: hasAnimated ? 'translateY(0)' : 'translateY(-8px)',
                      transition: `opacity 400ms ease-out ${idx * 50}ms, transform 400ms ease-out ${idx * 50}ms`
                    }}
                  >
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="text-3xl flex-shrink-0">{getDivisionIcon(division.label)}</div>
                        <div className="text-base font-semibold text-gray-900">{division.label}</div>
                      </div>
                      {hasSubdivisions && (
                        <div className="relative group/sub flex-shrink-0">
                          <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap cursor-pointer">
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

                    <div className="mt-auto flex items-center text-sm pt-3 border-t">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewOpportunities(division.id);
                        }}
                        className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-all group border border-transparent hover:border-gray-200 flex-1 flex items-center justify-center gap-1.5"
                        title="View Opportunities"
                      >
                        <span className="text-xl font-bold text-[#7f1010] group-hover:text-[#a31414] group-hover:opacity-100 opacity-95 transition-all duration-150">
                          <CountUp value={oppCount} enabled={hasAnimated} />
                        </span>
                        <span className="text-gray-600 group-hover:text-[#7f1010] transition-colors font-medium text-xs uppercase tracking-wide">
                          Opportunities
                        </span>
                      </div>
                      <div className="h-8 w-px bg-gray-200"></div>
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewProjects(division.id);
                        }}
                        className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-all group border border-transparent hover:border-gray-200 flex-1 flex items-center justify-center gap-1.5"
                        title="View Projects"
                      >
                        <span className="text-xl font-bold text-[#7f1010] group-hover:text-[#a31414] group-hover:opacity-100 opacity-95 transition-all duration-150">
                          <CountUp value={projCount} enabled={hasAnimated} />
                        </span>
                        <span className="text-gray-600 group-hover:text-[#7f1010] transition-colors font-medium text-xs uppercase tracking-wide">
                          Projects
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </section>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
            <div className="text-gray-500 mb-3">No project divisions found.</div>
            <div className="text-sm text-gray-400 mb-4">
              {divisionsLoading ? 'Loading...' : 'Please run the seed script to create divisions.'}
            </div>
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['project-divisions'] });
                refetchDivisions();
              }}
              className="px-4 py-2 bg-[#7f1010] text-white rounded-lg hover:bg-[#a31414] transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {/* Section 3: Quick Actions */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to={`/opportunities${selectedDivisionId ? `?division_id=${encodeURIComponent(selectedDivisionId)}` : ''}`}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900">View All Opportunities</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Browse and manage all bidding opportunities
                  </div>
                </div>
                <div className="text-2xl text-gray-400">→</div>
              </div>
            </Link>

            <Link
              to={`/projects${selectedDivisionId ? `?division_id=${encodeURIComponent(selectedDivisionId)}` : ''}`}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900">View All Projects</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Browse and manage all active projects
                  </div>
                </div>
                <div className="text-2xl text-gray-400">→</div>
              </div>
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
