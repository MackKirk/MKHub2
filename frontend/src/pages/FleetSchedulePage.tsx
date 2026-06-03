import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import FleetServiceCalendar from './FleetServiceCalendar';
import FleetScheduleInspectionModal from '@/components/fleet/FleetScheduleInspectionModal';
import FleetScheduleWorkOrderModal from '@/components/fleet/FleetScheduleWorkOrderModal';
import { AppPageHeader, uiCx, uiSpacing } from '@/components/ui';
import { Calendar } from 'lucide-react';

export default function FleetSchedulePage() {
  const queryClient = useQueryClient();
  const nav = useNavigate();
  const [showNewInspectionModal, setShowNewInspectionModal] = useState(false);
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false);

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
        onScheduleNew={() => setShowNewInspectionModal(true)}
        onNewWorkOrder={() => setShowNewWorkOrderModal(true)}
      />

      <FleetScheduleInspectionModal
        open={showNewInspectionModal}
        onClose={() => setShowNewInspectionModal(false)}
        onSuccess={invalidateCalendar}
      />

      <FleetScheduleWorkOrderModal
        open={showNewWorkOrderModal}
        onClose={() => setShowNewWorkOrderModal(false)}
        onSuccess={(data) => {
          invalidateCalendar();
          nav(`/fleet/work-orders/${data.id}`);
        }}
      />
    </main>
  );
}
