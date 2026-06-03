import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { AppButton, AppInput, uiCx, uiLayout } from '@/components/ui';

export type CostItem = {
  id?: string;
  description: string;
  amount: number;
  invoice_files: string[];
};

type WorkOrderCosts = {
  labor?: number | CostItem[];
  parts?: number | CostItem[];
  other?: number | CostItem[];
  total?: number;
};

function getCostTotal(costs: WorkOrderCosts | undefined, category: 'labor' | 'parts' | 'other'): number {
  const cost = costs?.[category];
  if (!cost) return 0;
  if (typeof cost === 'number') return cost;
  if (Array.isArray(cost)) {
    return cost.reduce((sum, item) => sum + (item.amount || 0), 0);
  }
  return 0;
}

type Props = {
  workOrderId: string;
  category: 'labor' | 'parts' | 'other';
  existingCost?: CostItem;
  existingCostIndex?: number;
  onSuccess: (costs: WorkOrderCosts) => void;
  onCancel: () => void;
};

export function WorkOrderCostFormInline({
  workOrderId,
  category,
  existingCost,
  existingCostIndex,
  onSuccess,
  onCancel,
}: Props) {
  const [form, setForm] = useState({
    description: existingCost?.description || '',
    amount: existingCost?.amount || 0,
  });

  const { data: workOrder } = useQuery({
    queryKey: ['workOrder', workOrderId],
    queryFn: () => api<{ costs?: WorkOrderCosts }>('GET', `/fleet/work-orders/${workOrderId}`),
  });

  const handleSubmit = () => {
    if (!form.description.trim() || form.amount <= 0) {
      toast.error('Description and amount are required');
      return;
    }

    const currentCosts = workOrder?.costs || {};
    let categoryCosts: CostItem[] = [];
    if (Array.isArray(currentCosts[category])) {
      categoryCosts = [...(currentCosts[category] as CostItem[])];
    } else if (typeof currentCosts[category] === 'number' && (currentCosts[category] as number) > 0) {
      categoryCosts = [{ description: 'Legacy cost', amount: currentCosts[category] as number, invoice_files: [] }];
    }

    const newCostItem: CostItem = {
      description: form.description.trim(),
      amount: form.amount,
      invoice_files: [],
    };

    const newCosts: WorkOrderCosts = { ...currentCosts };

    if (existingCost && existingCostIndex !== undefined) {
      newCosts[category] = categoryCosts.map((item, idx) => (idx === existingCostIndex ? newCostItem : item));
    } else {
      newCosts[category] = [...categoryCosts, newCostItem];
    }

    if (!Array.isArray(newCosts.labor)) {
      newCosts.labor =
        typeof newCosts.labor === 'number'
          ? [{ description: 'Legacy', amount: newCosts.labor, invoice_files: [] }]
          : [];
    }
    if (!Array.isArray(newCosts.parts)) {
      newCosts.parts =
        typeof newCosts.parts === 'number'
          ? [{ description: 'Legacy', amount: newCosts.parts, invoice_files: [] }]
          : [];
    }
    if (!Array.isArray(newCosts.other)) {
      newCosts.other =
        typeof newCosts.other === 'number'
          ? [{ description: 'Legacy', amount: newCosts.other, invoice_files: [] }]
          : [];
    }

    newCosts.total =
      getCostTotal(newCosts, 'labor') + getCostTotal(newCosts, 'parts') + getCostTotal(newCosts, 'other');
    onSuccess(newCosts);
  };

  return (
    <div className="space-y-3">
      <div className={uiCx('grid gap-4 md:grid-cols-2')}>
        <AppInput
          label="Name"
          placeholder="Name"
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />
        <AppInput
          label="Price"
          type="number"
          min={0}
          step="0.01"
          placeholder="Price"
          value={form.amount > 0 ? String(form.amount) : ''}
          onChange={(e) => {
            const num = parseFloat(e.target.value.replace(/,/g, '')) || 0;
            setForm((prev) => ({ ...prev, amount: num }));
          }}
        />
      </div>
      <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
        <AppButton type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </AppButton>
        <AppButton
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!form.description.trim() || form.amount <= 0}
        >
          {existingCost ? 'Update' : 'Add'}
        </AppButton>
      </div>
    </div>
  );
}
