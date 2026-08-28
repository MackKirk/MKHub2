import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppFormModal,
  AppInput,
  AppPageHeader,
  AppSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const STAGES = [
  { id: 'identified', label: 'Identified' },
  { id: 'applying', label: 'Applying' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'conditions', label: 'Conditions / Action Required' },
  { id: 'issued', label: 'Issued' },
  { id: 'closed', label: 'Closed' },
];

type Permit = {
  id: string;
  property_id: string;
  property_name?: string;
  title?: string;
  permit_type?: string;
  stage: string;
  expiry_date?: string;
  compliance_label?: string;
  compliance_status?: string;
  checklist?: Array<{ id: string; label: string; done: boolean }>;
};

type PropertyOption = { id: string; name: string };

function PermitCard({ permit, isDragging }: { permit: Permit; isDragging?: boolean }) {
  const title = permit.title || permit.permit_type || 'Permit';
  const badgeVariant =
    permit.compliance_status === 'expired'
      ? 'danger'
      : permit.compliance_status === 'warning'
        ? 'warning'
        : 'neutral';

  return (
    <AppCard className={uiCx('cursor-grab active:cursor-grabbing', isDragging && 'opacity-80 shadow-lg')} bodyClassName="!p-3">
      <div className="text-sm font-medium text-gray-900">{title}</div>
      <div className={uiCx(uiTypography.helper, 'mt-0.5')}>{permit.property_name}</div>
      {permit.compliance_label && (
        <AppBadge variant={badgeVariant} className="mt-2 text-xs">
          {permit.compliance_label}
        </AppBadge>
      )}
    </AppCard>
  );
}

function DraggablePermit({ permit }: { permit: Permit }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: permit.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="mb-2">
      <PermitCard permit={permit} isDragging={isDragging} />
    </div>
  );
}

function StageColumn({ stage, permits }: { stage: typeof STAGES[number]; permits: Permit[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={uiCx(
        'min-w-[220px] flex-1 p-3',
        uiBorders.subtle,
        uiColors.surfaceSubtle,
        uiRadius.card,
        isOver && 'ring-2 ring-brand-red/40',
      )}
    >
      <div className={uiCx(uiTypography.overline, 'mb-3')}>{stage.label}</div>
      <div className="min-h-[80px] space-y-2">
        {permits.map((p) => (
          <DraggablePermit key={p.id} permit={p} />
        ))}
      </div>
    </div>
  );
}

export default function PropertyApprovalsBoard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ property_id: '', title: '', permit_type: 'electrical', stage: 'identified' });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { data: permits, isLoading } = useQuery({
    queryKey: ['property-permits-board'],
    queryFn: () => api<Permit[]>('GET', '/properties/board/permits'),
  });

  const { data: properties } = useQuery({
    queryKey: ['properties-list-board'],
    queryFn: () => api<{ items: PropertyOption[] }>('GET', '/properties?limit=100'),
  });

  const byStage = useMemo(() => {
    const map: Record<string, Permit[]> = {};
    for (const s of STAGES) map[s.id] = [];
    for (const p of permits || []) {
      const stage = p.stage || 'identified';
      if (!map[stage]) map[stage] = [];
      map[stage].push(p);
    }
    return map;
  }, [permits]);

  const activePermit = permits?.find((p) => p.id === activeId);

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const permitId = String(active.id);
    const newStage = String(over.id);
    if (!STAGES.some((s) => s.id === newStage)) return;
    const permit = permits?.find((p) => p.id === permitId);
    if (!permit || permit.stage === newStage) return;
    try {
      await api('PATCH', `/properties/board/permits/${permitId}/stage`, { stage: newStage });
      qc.invalidateQueries({ queryKey: ['property-permits-board'] });
      toast.success('Stage updated');
    } catch (e: any) {
      toast.error(e?.message || 'Could not move — complete checklist first');
    }
  };

  const createPermit = async () => {
    if (!form.property_id || !form.title.trim()) {
      toast.error('Property and title required');
      return;
    }
    try {
      await api('POST', '/properties/board/permits', {
        property_id: form.property_id,
        title: form.title,
        permit_type: form.permit_type,
        stage: form.stage,
        checklist: [],
      });
      toast.success('Permit created');
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ['property-permits-board'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Approvals board"
        subtitle="Permit process pipeline — compliance shown on each card"
        onBack={() => nav('/properties')}
        backLabel="Back to Properties"
        icon={<ClipboardList className="h-4 w-4" />}
        actions={
          <AppButton leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New permit
          </AppButton>
        }
      />

      {isLoading ? (
        <AppCard>
          <div className={uiTypography.helper}>Loading board…</div>
        </AppCard>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.filter((s) => s.id !== 'closed').map((stage) => (
              <StageColumn key={stage.id} stage={stage} permits={byStage[stage.id] || []} />
            ))}
          </div>
          <DragOverlay>{activePermit ? <PermitCard permit={activePermit} isDragging /> : null}</DragOverlay>
        </DndContext>
      )}

      <AppFormModal open={createOpen} onClose={() => setCreateOpen(false)} title="New permit" footer={<><AppButton variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</AppButton><AppButton onClick={createPermit}>Create</AppButton></>}>
        <div className="space-y-3">
          <AppSelect
            label="Property"
            value={form.property_id}
            onChange={(e) => setForm({ ...form, property_id: e.target.value })}
            options={[
              { value: '', label: 'Select…' },
              ...(properties?.items || []).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <AppInput label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <AppSelect
            label="Type"
            value={form.permit_type}
            onChange={(e) => setForm({ ...form, permit_type: e.target.value })}
            options={[
              { value: 'electrical', label: 'Electrical' },
              { value: 'building', label: 'Building' },
              { value: 'plumbing', label: 'Plumbing' },
              { value: 'fire', label: 'Fire' },
              { value: 'occupancy', label: 'Occupancy' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </div>
      </AppFormModal>
    </div>
  );
}
