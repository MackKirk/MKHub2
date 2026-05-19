import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { ClockActionTile } from '@/components/ClockActionTile';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  MapPin,
} from 'lucide-react';

function attendanceBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  return 'danger';
}

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

function sundayOfWeekContaining(dateStr: string): Date {
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

type Shift = {
  id: string;
  project_id: string;
  project_name?: string;
  worker_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  job_name?: string;
  geofences?: any[];
};

type Attendance = {
  id: string;
  shift_id: string;
  type?: 'in' | 'out'; // For backward compatibility
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  time_selected_utc?: string | null; // For backward compatibility
  status: string;
  source: string;
};

export default function ScheduleCard() {
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const shiftParam = searchParams.get('shift');

  // anchorDate now represents the Sunday of the current week
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date();
    // Get Sunday of current week
    const day = d.getDay(); // 0 = Sunday, 6 = Saturday
    d.setDate(d.getDate() - day); // Go back to Sunday
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  // Calculate week range for API query (Sunday to Saturday)
  const weekStart = useMemo(() => {
    // anchorDate is already Sunday
    return new Date(anchorDate);
  }, [anchorDate]);

  const weekEnd = useMemo(() => {
    // Saturday is 6 days after Sunday
    const saturday = new Date(anchorDate);
    saturday.setDate(saturday.getDate() + 6);
    return saturday;
  }, [anchorDate]);

  const dateRange = useMemo(() => {
    return `${formatDateLocal(weekStart)},${formatDateLocal(weekEnd)}`;
  }, [weekStart, weekEnd]);

  // Fetch current user first
  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });

  // Fetch shifts - always filter by current user's worker_id
  // This ensures only the logged-in user's shifts are shown in the schedule
  const { data: shifts = [], refetch: refetchShifts } = useQuery({
    queryKey: ['schedule-shifts', dateRange, currentUser?.id],
    queryFn: () => {
      // Always filter by current user's ID to show only their shifts
      const workerId = currentUser?.id;
      if (!workerId) return Promise.resolve([]);
      return api<Shift[]>('GET', `/dispatch/shifts?date_range=${dateRange}&worker_id=${workerId}`);
    },
    enabled: !!currentUser?.id,
  });

  useEffect(() => {
    if (!dateParam) return;
    setAnchorDate(sundayOfWeekContaining(dateParam));
  }, [dateParam]);

  useEffect(() => {
    if (!shiftParam || shifts.length === 0) return;
    const shift = shifts.find((s) => s.id === shiftParam);
    if (shift) setSelectedShift(shift);
  }, [shiftParam, shifts]);

  // Fetch employees for worker names
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  // Fetch projects list (basic info)
  const { data: projectsList } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<any[]>('GET', '/projects?limit=100'),
  });

  // Get unique project IDs from shifts
  const uniqueProjectIds = useMemo(() => {
    const ids = new Set<string>();
    shifts.forEach((shift) => {
      if (shift.project_id) {
        ids.add(shift.project_id);
      }
    });
    return Array.from(ids);
  }, [shifts]);

  // Fetch detailed project info for projects that have shifts
  const { data: projectsDetails } = useQuery({
    queryKey: ['projects-details', uniqueProjectIds.join(',')],
    queryFn: async () => {
      if (uniqueProjectIds.length === 0) return [];
      const promises = uniqueProjectIds.map((id) => 
        api<any>('GET', `/projects/${id}`).catch(() => null)
      );
      const results = await Promise.all(promises);
      return results.filter(Boolean);
    },
    enabled: uniqueProjectIds.length > 0,
  });

  // Combine projects list with details
  const projects = useMemo(() => {
    if (!projectsList) return null;
    if (!projectsDetails || projectsDetails.length === 0) return projectsList;
    
    // Create a map of detailed projects
    const detailsMap = new Map(projectsDetails.map((p: any) => [p.id, p]));
    
    // Merge list with details
    return projectsList.map((p: any) => {
      const details = detailsMap.get(p.id);
      return details ? { ...p, ...details } : p;
    });
  }, [projectsList, projectsDetails]);

  // Fetch project details when a shift is selected
  const { data: project } = useQuery({
    queryKey: ['project', selectedShift?.project_id],
    queryFn: () => api<any>('GET', `/projects/${selectedShift?.project_id}`),
    enabled: !!selectedShift?.project_id,
  });

  // Fetch worker's employee profile to get supervisor
  const { data: workerProfile } = useQuery({
    queryKey: ['worker-profile', selectedShift?.worker_id],
    queryFn: () => api<any>('GET', `/users/${selectedShift?.worker_id}`),
    enabled: !!selectedShift?.worker_id,
  });

  // Fetch all attendances for shifts in the current month
  const shiftIds = useMemo(() => shifts.map((s) => s.id), [shifts]);
  const { data: attendances = [], refetch: refetchAttendances } = useQuery({
    queryKey: ['schedule-attendances', shiftIds.join(',')],
    queryFn: async () => {
      if (shiftIds.length === 0) return [];
      const promises = shiftIds.map(async (shiftId) => {
        try {
          const atts = await api<Attendance[]>('GET', `/dispatch/shifts/${shiftId}/attendance`);
          return atts;
        } catch (e) {
          console.error(`Failed to fetch attendance for shift ${shiftId}:`, e);
          return [];
        }
      });
      const allAttendances = await Promise.all(promises);
      return allAttendances.flat();
    },
    enabled: shiftIds.length > 0,
  });

  // Fetch attendances for selected shift
  const { data: selectedShiftAttendances = [], refetch: refetchSelectedShiftAttendances } = useQuery({
    queryKey: ['shift-attendances', selectedShift?.id],
    queryFn: () => api<Attendance[]>('GET', `/dispatch/shifts/${selectedShift?.id}/attendance`),
    enabled: !!selectedShift?.id,
  });

  // Get project address helper
  const getProjectAddress = (projectId: string): string => {
    const proj = projects?.find((p: any) => p.id === projectId);
    if (!proj) return 'No address available';
    
    // First try to use project address fields
    let addressParts = [
      proj.address,
      proj.address_city,
      proj.address_province,
      proj.address_country,
    ].filter(Boolean);
    
    // If no project address, fallback to site address fields
    if (addressParts.length === 0) {
      addressParts = [
        proj.site_address_line1,
        proj.site_city,
        proj.site_province,
        proj.site_country,
      ].filter(Boolean);
    }
    
    return addressParts.length > 0 ? addressParts.join(', ') : 'No address available';
  };

  // Get attendance for a shift - NEW MODEL: Each record is a complete event
  const getAttendanceForShift = (shiftId: string, type: 'in' | 'out'): Attendance | null => {
    const att = attendances.find((a: Attendance) => a.shift_id === shiftId);
    if (!att) return null;
    
    // Return the attendance if it has the requested time field
    if (type === 'in' && att.clock_in_time) return att;
    if (type === 'out' && att.clock_out_time) return att;
    
    // For backward compatibility, check type field
    if (att.type === type) return att;
    
    return null;
  };

  // Generate week days (Sunday to Saturday)
  const weekDays = useMemo(() => {
    const days: { date: Date; key: string; dayName: string }[] = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(anchorDate);
      d.setDate(d.getDate() + i);
      days.push({
        date: d,
        key: formatDateLocal(d),
        dayName: dayNames[i]
      });
    }
    return days;
  }, [anchorDate]);

  const weekLabel = useMemo(() => {
    const start = weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const end = weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${start} - ${end}`;
  }, [weekStart, weekEnd]);

  // Group shifts by date
  const shiftsByDate = useMemo(() => {
    const grouped: Record<string, Shift[]> = {};
    shifts.forEach((shift) => {
      const dateKey = shift.date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(shift);
    });
    return grouped;
  }, [shifts]);

  // Navigation functions
  const goToPreviousWeek = () => {
    const newDate = new Date(anchorDate);
    newDate.setDate(newDate.getDate() - 7);
    setAnchorDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(anchorDate);
    newDate.setDate(newDate.getDate() + 7);
    setAnchorDate(newDate);
  };

  const goToToday = () => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    setAnchorDate(d);
  };

  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [clockModalSubmitting, setClockModalSubmitting] = useState(false);

  const handleCloseClockModal = () => {
    setClockType(null);
    void refetchShifts();
    void refetchAttendances();
    void refetchSelectedShiftAttendances();
  };

  // Get worker info
  const worker = useMemo(() => {
    if (!selectedShift) return null;
    return employees?.find((e: any) => e.id === selectedShift.worker_id);
  }, [selectedShift, employees]);

  // Get clock-in/out status
  // NEW MODEL: Get the attendance record (which may have both clock_in and clock_out)
  const attendance = selectedShift ? attendances.find((a: Attendance) => a.shift_id === selectedShift.id) : null;
  const clockIn = attendance?.clock_in_time ? attendance : null;
  const clockOut = attendance?.clock_out_time ? attendance : null;
  const canClockIn = selectedShift ? (!attendance?.clock_in_time || attendance.status === 'rejected') : false;
  const canClockOut = selectedShift
    ? attendance?.clock_in_time && (attendance.status === 'approved' || attendance.status === 'pending') && !attendance.clock_out_time
    : false;
  const isOwnShift = currentUser && selectedShift && String(currentUser.id) === String(selectedShift.worker_id);

  return (
    <div className={uiLayout.pageTwoColumn}>
      {/* LEFT COLUMN - Weekly Schedule */}
      <AppCard title="Weekly Schedule">
        {/* Week Controls */}
        <div className={uiCx('mb-4 flex items-center justify-between border-b border-gray-100 pb-4')}>
          <AppButton variant="secondary" size="sm" leftIcon={<ChevronLeft className="h-4 w-4" />} onClick={goToPreviousWeek}>
            Previous
          </AppButton>
          <span className={uiCx(uiTypography.controlLabel, 'min-w-[200px] text-center font-semibold text-gray-700')}>
            {weekLabel}
          </span>
            <div className="flex items-center gap-2">
              <AppButton variant="secondary" size="sm" onClick={goToToday}>
                Today
              </AppButton>
              <AppButton variant="secondary" size="sm" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={goToNextWeek}>
                Next
              </AppButton>
            </div>
        </div>

        {/* Day Rows */}
        <div className={uiSpacing.sectionStack}>
          {weekDays.map(({ date, key, dayName }) => {
            const dateStr = formatDateLocal(date);
            const isToday = (() => {
              const t = new Date();
              return formatDateLocal(t) === dateStr;
            })();

            const dayShifts = shiftsByDate[dateStr] || [];
            const dateFormatted = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

            return (
              <div
                key={key}
                className={uiCx(
                  uiRadius.control,
                  uiBorders.subtle,
                  'transition-all duration-200',
                  dayShifts.length > 0
                    ? uiCx(uiColors.surface, uiSpacing.cardPadding, isToday && 'ring-2 ring-brand-red/30 border-brand-red/40')
                    : uiCx(uiColors.surfaceSubtle, 'p-2.5', isToday && 'ring-1 ring-brand-red/20 border-brand-red/20'),
                )}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`text-sm font-semibold ${
                      dayShifts.length > 0 ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {dayName}
                    </div>
                    <div className={`text-xs ${
                      dayShifts.length > 0 ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                      {dateFormatted}
                    </div>
                    {isToday && (
                      <AppBadge className="normal-case tracking-normal bg-brand-red/10 text-brand-red">
                        Today
                      </AppBadge>
                    )}
                  </div>
                </div>

                {/* Shifts */}
                {dayShifts.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {dayShifts.map((shift) => {
                      const shiftClockIn = getAttendanceForShift(shift.id, 'in');
                      const shiftClockOut = getAttendanceForShift(shift.id, 'out');
                      const isSelected = selectedShift?.id === shift.id;
                      const projectAddress = getProjectAddress(shift.project_id);

                      return (
                        <div
                          key={shift.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (selectedShift?.id === shift.id) {
                              setSelectedShift(null);
                            } else {
                              setSelectedShift(shift);
                            }
                          }}
                          className={uiCx(
                            'relative cursor-pointer transition-all duration-200 flex-1 min-w-[240px]',
                            uiRadius.control,
                            uiBorders.subtle,
                            uiSpacing.compactCardPadding,
                            isSelected
                              ? 'border-brand-red bg-brand-red/5 shadow-md hover:shadow-lg'
                              : uiCx(uiColors.surface, 'hover:border-gray-300 hover:bg-gray-50/50 hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98]'),
                          )}
                        >
                          {/* Left Accent Bar */}
                          <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg ${
                            isSelected ? 'bg-brand-red' : 'bg-gray-300'
                          }`} />
                          
                          <div className="pl-2">
                            {/* Time - Strongest */}
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Clock className="h-4 w-4 text-gray-400" />
                              <div className="font-bold text-base text-gray-900">
                                {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
                              </div>
                            </div>
                            
                            {/* Project - Secondary */}
                            {shift.project_name && (
                              <div className="text-sm text-gray-700 mb-2 font-semibold">
                                {shift.project_name}
                              </div>
                            )}
                            
                            {/* Address - Muted */}
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="line-clamp-1">{projectAddress}</span>
                            </div>
                            
                            {/* Attendance Status */}
                            {(shiftClockIn || shiftClockOut) && (
                              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-200">
                                {shiftClockIn && (
                                  <AppBadge
                                    variant={attendanceBadgeVariant(shiftClockIn.status)}
                                    className="normal-case tracking-normal text-xs"
                                  >
                                    In: {shiftClockIn.clock_in_time ? new Date(shiftClockIn.clock_in_time).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : (shiftClockIn.time_selected_utc ? new Date(shiftClockIn.time_selected_utc).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : '--')}
                                  </AppBadge>
                                )}
                                {shiftClockOut && (
                                  <AppBadge
                                    variant={attendanceBadgeVariant(shiftClockOut.status)}
                                    className="normal-case tracking-normal text-xs"
                                  >
                                    Out: {shiftClockOut.clock_out_time ? new Date(shiftClockOut.clock_out_time).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : (shiftClockOut.time_selected_utc ? new Date(shiftClockOut.time_selected_utc).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : '--')}
                                  </AppBadge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={uiCx(uiTypography.helper, 'italic')}>No shifts</p>
                )}
              </div>
            );
          })}
        </div>
      </AppCard>

      {/* RIGHT COLUMN - Shift Details Panel */}
      <AppCard title="Shift Details">
        {selectedShift ? (
          <div className={uiSpacing.sectionStack}>
            {/* Core Info Section */}
            <div className={uiSpacing.sectionStack}>
              <AppSectionHeader title="Core Info" />
              
              {/* Project Card */}
              {selectedShift.project_name && (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Project</div>
                  <div className={uiTypography.sectionTitle}>{selectedShift.project_name}</div>
                </div>
              )}

              {/* Date & Time Card */}
              <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Date & Time</div>
                <div className={uiTypography.sectionTitle}>
                  {new Date(selectedShift.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <p className={uiCx(uiTypography.body, 'mt-1')}>
                  {formatTime12h(selectedShift.start_time)} - {formatTime12h(selectedShift.end_time)}
                </p>
              </div>

              {/* Job Type Card */}
              {selectedShift.job_name && (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Job Type</div>
                  <div className={uiTypography.sectionTitle}>{selectedShift.job_name}</div>
                </div>
              )}
            </div>

            {/* People Section */}
            <div className={uiCx(uiSpacing.sectionStack, "border-t border-gray-100 pt-2")}>
              <AppSectionHeader title="People" />
              
              {/* Worker Card */}
              {worker && (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Worker</div>
                  <div className={uiTypography.sectionTitle}>{worker.name || worker.username}</div>
                </div>
              )}

              {/* Supervisor Card */}
              {workerProfile?.manager_user_id && (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Supervisor</div>
                  <div className={uiTypography.sectionTitle}>
                    {(() => {
                      const supervisor = employees?.find((e: any) => e.id === workerProfile.manager_user_id);
                      return supervisor?.name || supervisor?.username || 'N/A';
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Location Section */}
            {project && (
              <div className={uiCx(uiSpacing.sectionStack, "border-t border-gray-100 pt-2")}>
                <AppSectionHeader title="Location" />
                
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Address</div>
                      <div className="text-sm text-gray-900">
                        {(() => {
                          let addressParts = [
                            project.address,
                            project.address_city,
                            project.address_province,
                            project.address_country,
                          ].filter(Boolean);
                          
                          if (addressParts.length === 0) {
                            addressParts = [
                              project.site_address_line1,
                              project.site_city,
                              project.site_province,
                              project.site_country,
                            ].filter(Boolean);
                          }
                          
                          return addressParts.length > 0
                            ? addressParts.join(', ')
                            : 'No address available';
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Status Card */}
            <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding, "border-t border-gray-100 pt-2")}>
              <AppSectionHeader title="Attendance Status" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Clock In:</span>
                  </div>
                  {clockIn ? (
                    <div className="flex items-center gap-2">
                      <AppBadge
                        variant={attendanceBadgeVariant(clockIn.status)}
                        className="normal-case tracking-normal text-xs"
                      >
                        {clockIn.status === 'approved' ? 'Approved' : clockIn.status === 'pending' ? 'Pending' : 'Rejected'}
                      </AppBadge>
                      <span className={uiTypography.sectionTitle}>
                        {clockIn.clock_in_time ? new Date(clockIn.clock_in_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : (clockIn.time_selected_utc ? new Date(clockIn.time_selected_utc).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : '--')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">Not clocked in</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Clock Out:</span>
                  </div>
                  {clockOut ? (
                    <div className="flex items-center gap-2">
                      <AppBadge
                        variant={attendanceBadgeVariant(clockOut.status)}
                        className="normal-case tracking-normal text-xs"
                      >
                        {clockOut.status === 'approved' ? 'Approved' : clockOut.status === 'pending' ? 'Pending' : 'Rejected'}
                      </AppBadge>
                      <span className={uiTypography.sectionTitle}>
                        {clockOut.clock_out_time ? new Date(clockOut.clock_out_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : (clockOut.time_selected_utc ? new Date(clockOut.time_selected_utc).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : '--')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">Not clocked out</span>
                  )}
                </div>
              </div>
            </div>

            {/* Attendance Actions */}
            {isOwnShift && (
              <div className="border-t border-gray-100 pt-4">
                <AppSectionHeader title="Actions" />
                <div className="space-y-3">
                  <ClockActionTile
                    kind="in"
                    enabled={canClockIn}
                    disabled={clockModalSubmitting}
                    onClick={() => setClockType('in')}
                    title={!canClockIn ? 'Cannot clock in for this shift' : undefined}
                  />
                  <ClockActionTile
                    kind="out"
                    enabled={canClockOut}
                    disabled={clockModalSubmitting}
                    onClick={() => setClockType('out')}
                    title={
                      !canClockOut && attendance?.clock_in_time
                        ? 'Clock-in must be approved or pending'
                        : !canClockOut
                          ? 'Clock in first to clock out'
                          : undefined
                    }
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <AppEmptyState title="Select a shift to view details" icon={<ClipboardList className="h-5 w-5" />} />
        )}
      </AppCard>

      {clockType && selectedShift && (
        <ClockInOutModalLayer
          selectedDate={selectedShift.date}
          clockType={clockType}
          onClose={handleCloseClockModal}
          shiftById={selectedShift}
          onBusyChange={setClockModalSubmitting}
        />
      )}
    </div>
  );
}



