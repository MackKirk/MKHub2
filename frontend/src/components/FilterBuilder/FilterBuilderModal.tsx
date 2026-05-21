import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { FilterRule, FieldConfig } from './types';
import FilterRuleRow from './FilterRuleRow';
import {
  AppButton,
  AppEmptyState,
  AppModal,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

interface FilterBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (rules: FilterRule[]) => void;
  initialRules: FilterRule[];
  fields: FieldConfig[];
  getFieldData: (fieldId: string) => any;
}

export default function FilterBuilderModal({
  isOpen,
  onClose,
  onApply,
  initialRules,
  fields,
  getFieldData,
}: FilterBuilderModalProps) {
  const [rules, setRules] = useState<FilterRule[]>(initialRules);

  useEffect(() => {
    if (isOpen) {
      setRules(initialRules);
    }
  }, [isOpen, initialRules]);

  const handleAddRule = () => {
    const firstField = fields[0];
    const newRule: FilterRule = {
      id: `rule-${Date.now()}`,
      field: firstField?.id || '',
      operator: firstField?.operators[0] || 'is',
      value: '',
    };
    setRules([...rules, newRule]);
  };

  const handleUpdateRule = (updatedRule: FilterRule) => {
    setRules(rules.map((r) => (r.id === updatedRule.id ? updatedRule : r)));
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter((r) => r.id !== ruleId));
  };

  const handleClearAll = () => {
    setRules([]);
  };

  const handleApply = () => {
    onApply(rules);
    onClose();
  };

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      title="Filters"
      description="Build rules to narrow the list."
      size="md"
      dialogClassName="!max-w-[720px]"
      bodyClassName={uiCx('!max-h-[min(60vh,32rem)] overflow-y-auto', uiSpacing.cardPadding)}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
          <div>
            {rules.length > 0 && (
              <AppButton type="button" variant="ghost" size="sm" onClick={handleClearAll}>
                Clear All
              </AppButton>
            )}
          </div>
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleApply}>
              Apply Filters
            </AppButton>
          </div>
        </div>
      }
    >
      {rules.length === 0 ? (
        <AppEmptyState
          title="No filters applied"
          description="Add a filter to get started."
          className="border-0 bg-transparent py-6 shadow-none"
        />
      ) : (
        <div className={uiSpacing.sectionStack}>
          {rules.map((rule) => (
            <FilterRuleRow
              key={rule.id}
              rule={rule}
              onUpdate={handleUpdateRule}
              onDelete={() => handleDeleteRule(rule.id)}
              fields={fields}
              getFieldData={getFieldData}
            />
          ))}
        </div>
      )}

      <AppButton
        type="button"
        variant="secondary"
        size="sm"
        className="mt-4 w-full"
        leftIcon={<Plus className="h-4 w-4" />}
        onClick={handleAddRule}
      >
        Add filter
      </AppButton>
    </AppModal>
  );
}
