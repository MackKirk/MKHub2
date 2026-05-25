import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { FilterRule, FieldConfig } from './types';
import FilterRuleRow from './FilterRuleRow';
import {
  AppButton,
  AppEmptyState,
  AppFormModal,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';
import { filtersModalQuickInfo } from '@/lib/formModalQuickInfo';

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
    const newRule: FilterRule = {
      id: `rule-${Date.now()}`,
      field: '',
      operator: '',
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
    const completeRules = rules.filter((rule) => {
      if (!rule.field || !rule.operator) return false;
      if (!rule.value) return false;
      if (Array.isArray(rule.value) && (!rule.value[0] || !rule.value[1])) return false;
      return true;
    });
    onApply(completeRules);
    onClose();
  };

  return (
    <AppFormModal
      open={isOpen}
      onClose={onClose}
      title="Filters"
      description="Show only the items that match what you need."
      formWidth="wide"
      scrollBody={false}
      dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
      dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
      quickInfo={filtersModalQuickInfo}
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
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
        <div
          className={uiCx(
            'min-h-0 min-w-0 flex-1 overflow-y-auto',
            rules.length > 0 && uiSpacing.sectionStack,
          )}
        >
          {rules.length === 0 ? (
            <AppEmptyState
              title="No filters applied"
              description="Add a filter to get started."
              className="border-0 bg-transparent py-6 shadow-none"
            />
          ) : (
            rules.map((rule) => (
              <FilterRuleRow
                key={rule.id}
                rule={rule}
                onUpdate={handleUpdateRule}
                onDelete={() => handleDeleteRule(rule.id)}
                fields={fields}
                getFieldData={getFieldData}
              />
            ))
          )}
        </div>

        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 w-full"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={handleAddRule}
        >
          Add filter
        </AppButton>
      </div>
    </AppFormModal>
  );
}
