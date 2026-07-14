import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import FleetServiceCalendar from './FleetServiceCalendar';
import FleetScheduleInspectionModal from '@/components/fleet/FleetScheduleInspectionModal';
import FleetScheduleWorkOrderModal from '@/components/fleet/FleetScheduleWorkOrderModal';
import { api } from '@/lib/api';
import {
  canAssignFleetWorkOrder,
  canEditFleetInspectionTab,
  canEditFleetWorkOrderRecord,
  canViewFleetInspectionTab,
} from '@/lib/fleetPermissions';
import { AppPageHeader, uiCx, uiSpacing } from '@/components/ui';
import { Calendar } from 'lucide-react';

export default function FleetSchedulePage() {
  const queryClient = useQueryClient();
  const nav = useNavigate();
  const [showNewInspectionModal, setShowNewInspectionModal] = useState(false);
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const canCreateWorkOrder = canEditFleetWorkOrderRecord(isAdmin, permissions);
  const canAssign = canAssignFleetWorkOrder(isAdmin, permissions);
  const canViewInspectionSchedules = canViewFleetInspectionTab(isAdmin, permissions, 'schedules');
  const canScheduleInspection = canEditFleetInspectionTab(isAdmin, permissions, 'schedules');

  const invalidateCalendar = () => {
    queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
    queryClient.invalidateQueries({ queryKey: ['fleet-work-orders-calendar'] });
  };

  return (
    <main className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Fleet schedule"
        subtitle="Work orders and scheduled inspections on the calendar. Open a work order or inspection schedule to manage details."
        icon={<Calendar className="h-4 w-4" />}
      />

      <FleetServiceCalendar
        embedView
        canLoadInspectionSchedules={canViewInspectionSchedules}
        canSchedule={canScheduleInspection}
        onScheduleNew={canScheduleInspection ? () => setShowNewInspectionModal(true) : undefined}
        onNewWorkOrder={canCreateWorkOrder ? () => setShowNewWorkOrderModal(true) : undefined}
      />

      <FleetScheduleInspectionModal
        open={canScheduleInspection && showNewInspectionModal}
        onClose={() => setShowNewInspectionModal(false)}
        onSuccess={invalidateCalendar}
      />

      <FleetScheduleWorkOrderModal
        open={canCreateWorkOrder && showNewWorkOrderModal}
        canAssign={canAssign}
        onClose={() => setShowNewWorkOrderModal(false)}
        onSuccess={(data) => {
          invalidateCalendar();
          nav(`/fleet/work-orders/${data.id}`);
        }}
      />
    </main>
  );
}
