import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { FLEET_WORK_ORDER_FIELD_HINTS as H } from '@/lib/fleetWorkOrderFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  AppInput,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'work-order-cost-form';

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

type CostCategory = 'labor' | 'parts' | 'other';

const CATEGORY_LABEL: Record<CostCategory, string> = {
  labor: 'Labor',
  parts: 'Parts',
  other: 'Other',
};

function getCostTotal(costs: WorkOrderCosts | undefined, category: CostCategory): number {
  const cost = costs?.[category];
  if (!cost) return 0;
  if (typeof cost === 'number') return cost;
  if (Array.isArray(cost)) {
    return cost.reduce((sum, item) => sum + (item.amount || 0), 0);
  }
  return 0;
}

const WORK_ORDER_COST_QUICK_INFO = formModalQuickInfo({
  purpose: <>Add or update a cost line on this work order — labor, parts, or other charges.</>,
  howToUse: (
    <>
      Enter a {uiLabel('Name')} and {uiLabel('Price ($)')} for the line item. Attach invoices from the Files tab when
      needed.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Add')} or {uiLabel('Update')} saves the line and refreshes
      cost totals.
    </>
  ),
});

type Props = {
  open: boolean;
  workOrderId: string;
  category: CostCategory;
  existingCost?: CostItem;
  existingCostIndex?: number;
  isSaving?: boolean;
  onSuccess: (costs: WorkOrderCosts) => void;
  onClose: () => void;
};

export function WorkOrderCostModal({
  open,
  workOrderId,
  category,
  existingCost,
  existingCostIndex,
  isSaving = false,
  onSuccess,
  onClose,
}: Props) {
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');

  useEffect(() => {
    if (!open) return;
    setDescription(existingCost?.description || '');
    setAmountInput(existingCost?.amount && existingCost.amount > 0 ? String(existingCost.amount) : '');
  }, [open, existingCost?.description, existingCost?.amount]);

  const { data: workOrder } = useQuery({
    queryKey: ['workOrder', workOrderId],
    queryFn: () => api<{ costs?: WorkOrderCosts }>('GET', `/fleet/work-orders/${workOrderId}`),
    enabled: open && !!workOrderId,
  });

  const amount = parseFloat(amountInput.replace(/,/g, '')) || 0;
  const isEditing = existingCost != null && existingCostIndex !== undefined;
  const submitDisabled = !description.trim() || amount <= 0 || isSaving;

  const handleSubmit = () => {
    if (!description.trim() || amount <= 0) {
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
      description: description.trim(),
      amount,
      invoice_files: existingCost?.invoice_files ?? [],
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

  const categoryLabel = CATEGORY_LABEL[category];
  const title = isEditing ? `Edit ${categoryLabel.toLowerCase()} cost` : `Add ${categoryLabel.toLowerCase()} cost`;

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description={`Record a ${categoryLabel.toLowerCase()} line item on this work order.`}
      formWidth="comfortable"
      quickInfo={WORK_ORDER_COST_QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={submitDisabled}
            loading={isSaving}
          >
            {isSaving ? 'Saving…' : isEditing ? 'Update' : 'Add'}
          </AppButton>
        </div>
      }
    >
      <form
        id={FORM_ID}
        className={uiSpacing.sectionStack}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className={uiLayout.sectionGrid2}>
          <AppInput
            label="Name"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSaving}
            required
            fieldHint={H.cost_name}
          />
          <AppInput
            label="Price ($)"
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={isSaving}
            required
            fieldHint={H.cost_amount}
          />
        </div>
      </form>
    </AppFormModal>
  );
}
