import type { ReactNode } from 'react';
import {
  AppCard,
  AppListCreateItem,
  AppListRowIconButton,
  AppSectionHeader,
  appSectionPresetProps,
  type AppSectionPresetKey,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { WorkOrderCostModal, type CostItem } from '@/components/fleet/WorkOrderCostModal';

const EM_DASH = '—';

function ReadOnlyField({ label, value }: { label: ReactNode; value?: ReactNode }) {
  const display =
    value === null || value === undefined || (typeof value === 'string' && !String(value).trim())
      ? EM_DASH
      : value;
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>{display}</div>
    </div>
  );
}

type CostCategory = 'labor' | 'parts' | 'other';

type WorkOrderCosts = {
  labor?: number | CostItem[];
  parts?: number | CostItem[];
  other?: number | CostItem[];
  total?: number;
};

type EditingCost = { category: CostCategory; index?: number } | null;

const CATEGORY_META: Record<
  CostCategory,
  { title: string; description: string; emptyTitle: string; createLabel: string; preset: AppSectionPresetKey }
> = {
  labor: {
    title: 'Labor',
    description: 'Labor entries and amounts.',
    emptyTitle: 'No labor costs.',
    createLabel: 'Add Labor',
    preset: 'timesheet',
  },
  parts: {
    title: 'Parts',
    description: 'Parts and materials costs.',
    emptyTitle: 'No parts costs.',
    createLabel: 'Add Parts',
    preset: 'pricing',
  },
  other: {
    title: 'Other',
    description: 'Miscellaneous costs.',
    emptyTitle: 'No other costs.',
    createLabel: 'Add Other',
    preset: 'billing',
  },
};

type CategorySectionProps = {
  category: CostCategory;
  items: CostItem[];
  categoryTotal: number;
  canEdit: boolean;
  isFormOpenForCategory: boolean;
  onStartAdd: (category: CostCategory) => void;
  onStartEdit: (category: CostCategory, index: number) => void;
  onRemoveCost: (category: CostCategory, index: number) => void;
};

function WorkOrderCostCategorySection({
  category,
  items,
  categoryTotal,
  canEdit,
  isFormOpenForCategory,
  onStartAdd,
  onStartEdit,
  onRemoveCost,
}: CategorySectionProps) {
  const meta = CATEGORY_META[category];

  return (
    <AppCard className="min-w-0 h-full">
      <AppSectionHeader
        title={meta.title}
        description={meta.description}
        {...appSectionPresetProps(meta.preset)}
        action={
          <span className={uiCx(uiTypography.helper, 'font-semibold text-gray-900')}>
            ${categoryTotal.toFixed(2)}
          </span>
        }
      />
      <div className="mt-4 space-y-3">
        {canEdit && !isFormOpenForCategory ? (
          <AppListCreateItem
            label={meta.createLabel}
            layout="row"
            className="w-full"
            onClick={() => onStartAdd(category)}
          />
        ) : null}
        {items.length === 0 ? (
          <p className={uiCx(uiTypography.helper, 'py-1')}>{meta.emptyTitle}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item, idx) => (
              <li key={`${category}-${idx}-${item.description}`} className={uiCx(uiLayout.actionsRow, 'gap-3 py-3')}>
                <div className="min-w-0 flex-1 space-y-2">
                  <ReadOnlyField label="Name" value={item.description || undefined} />
                  <ReadOnlyField label="Price" value={`$${item.amount.toFixed(2)}`} />
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <AppListRowIconButton
                      preset="edit"
                      label="Edit"
                      onClick={() => onStartEdit(category, idx)}
                    />
                    <AppListRowIconButton
                      preset="delete"
                      label="Delete"
                      onClick={() => onRemoveCost(category, idx)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppCard>
  );
}

type Props = {
  workOrderId: string;
  costs: WorkOrderCosts;
  laborCosts: CostItem[];
  partsCosts: CostItem[];
  otherCosts: CostItem[];
  canEditCosts: boolean;
  showCostForm: boolean;
  editingCost: EditingCost;
  isSaving?: boolean;
  onStartAdd: (category: CostCategory) => void;
  onStartEdit: (category: CostCategory, index: number) => void;
  onCancelForm: () => void;
  onSaveCosts: (costs: WorkOrderCosts) => void;
  onRemoveCost: (category: CostCategory, index: number) => void;
  getCostTotal: (costs: WorkOrderCosts, category: CostCategory) => number;
  getTotalCost: (costs: WorkOrderCosts) => number;
};

export function WorkOrderCostsTab({
  workOrderId,
  costs,
  laborCosts,
  partsCosts,
  otherCosts,
  canEditCosts,
  showCostForm,
  editingCost,
  isSaving = false,
  onStartAdd,
  onStartEdit,
  onCancelForm,
  onSaveCosts,
  onRemoveCost,
  getCostTotal,
  getTotalCost,
}: Props) {
  const sectionProps = {
    canEdit: canEditCosts,
    onStartAdd,
    onStartEdit,
    onRemoveCost,
  };

  const editingExistingCost =
    editingCost?.index !== undefined
      ? ({ labor: laborCosts, parts: partsCosts, other: otherCosts }[editingCost.category]?.[editingCost.index] as
          | CostItem
          | undefined)
      : undefined;

  return (
    <div className={uiSpacing.sectionStack}>
      <div className={uiLayout.sectionGrid3}>
        <WorkOrderCostCategorySection
          category="labor"
          items={laborCosts}
          categoryTotal={getCostTotal(costs, 'labor')}
          isFormOpenForCategory={showCostForm && editingCost?.category === 'labor'}
          {...sectionProps}
        />
        <WorkOrderCostCategorySection
          category="parts"
          items={partsCosts}
          categoryTotal={getCostTotal(costs, 'parts')}
          isFormOpenForCategory={showCostForm && editingCost?.category === 'parts'}
          {...sectionProps}
        />
        <WorkOrderCostCategorySection
          category="other"
          items={otherCosts}
          categoryTotal={getCostTotal(costs, 'other')}
          isFormOpenForCategory={showCostForm && editingCost?.category === 'other'}
          {...sectionProps}
        />
      </div>

      <AppCard>
        <AppSectionHeader
          title="Costs Summary"
          description="Totals by category and overall work order cost."
          {...appSectionPresetProps('pricing')}
        />
        <div className={uiCx('mt-4 grid gap-4 md:grid-cols-3')}>
          <ReadOnlyField label="Labor" value={`$${getCostTotal(costs, 'labor').toFixed(2)}`} />
          <ReadOnlyField label="Parts" value={`$${getCostTotal(costs, 'parts').toFixed(2)}`} />
          <ReadOnlyField label="Other" value={`$${getCostTotal(costs, 'other').toFixed(2)}`} />
        </div>
        <div className={uiCx(uiLayout.actionsRow, 'mt-4 justify-between border-t border-gray-100 pt-4')}>
          <p className={uiTypography.sectionTitle}>Total</p>
          <p className={uiCx(uiTypography.sectionTitle, 'text-brand-red')}>${getTotalCost(costs).toFixed(2)}</p>
        </div>
      </AppCard>

      {showCostForm && editingCost ? (
        <WorkOrderCostModal
          open
          workOrderId={workOrderId}
          category={editingCost.category}
          existingCost={editingExistingCost}
          existingCostIndex={editingCost.index}
          isSaving={isSaving}
          onSuccess={onSaveCosts}
          onClose={onCancelForm}
        />
      ) : null}
    </div>
  );
}
