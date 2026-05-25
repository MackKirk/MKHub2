import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { FilterRule, FieldConfig } from './types';
import { isRangeOperator, getOperatorLabel } from './utils';
import { sortByLabel } from '@/lib/sortOptions';
import {
  AppButton,
  AppDatePicker,
  AppInput,
  AppSelect,
  AppUserSelect,
  type AppSelectOption,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';

function sortOptionsByLabel<T extends { label: string }>(options: T[]): T[] {
  return sortByLabel(options, (o) => o.label);
}

interface FilterRuleRowProps {
  rule: FilterRule;
  onUpdate: (rule: FilterRule) => void;
  onDelete: () => void;
  fields: FieldConfig[];
  getFieldData: (fieldId: string) => any;
}

function buildValueSelectOptions(fieldConfig: FieldConfig): AppSelectOption[] {
  const groupedOptions = fieldConfig.getGroupedOptions ? fieldConfig.getGroupedOptions() : null;

  if (groupedOptions && groupedOptions.length > 0) {
    const sortedGroups = sortOptionsByLabel(groupedOptions.map((g) => ({ ...g, label: g.label }))).map((g) => ({
      label: g.label,
      options: sortOptionsByLabel(g.options),
    }));
    return sortedGroups.flatMap((group) =>
      group.options.map((opt) => ({
        value: opt.value,
        label: `${group.label} — ${opt.label}`,
      })),
    );
  }

  return sortOptionsByLabel(fieldConfig.getOptions ? fieldConfig.getOptions() : []);
}

export default function FilterRuleRow({
  rule,
  onUpdate,
  onDelete,
  fields,
}: FilterRuleRowProps) {
  const fieldConfig = rule.field ? fields.find((f) => f.id === rule.field) : undefined;
  const hasField = !!fieldConfig;
  const hasOperator = !!rule.operator;
  const operators = useMemo(
    () =>
      fieldConfig?.operators.map((op) => ({
        value: op,
        label: getOperatorLabel(op),
      })) ?? [],
    [fieldConfig],
  );
  const isRange = isRangeOperator(rule.operator);
  const currentValue = rule.value;
  const value1 = Array.isArray(currentValue) ? currentValue[0] : currentValue;
  const value2 = Array.isArray(currentValue) ? currentValue[1] : '';

  const fieldOptions = useMemo(
    () => sortOptionsByLabel(fields.map((f) => ({ value: f.id, label: f.label }))),
    [fields],
  );

  const valueSelectOptions = useMemo(
    () => (fieldConfig?.type === 'select' ? buildValueSelectOptions(fieldConfig) : []),
    [fieldConfig],
  );

  const valueUsers = useMemo(
    () => (fieldConfig?.type === 'user' ? (fieldConfig.getUsers?.() ?? []) : []),
    [fieldConfig],
  );

  const handleFieldChange = (newFieldId: string) => {
    onUpdate({
      ...rule,
      field: newFieldId,
      operator: '',
      value: '',
    });
  };

  const handleOperatorChange = (newOperator: string) => {
    const isNewRange = isRangeOperator(newOperator as FilterRule['operator']);
    const isCurrentRange = isRangeOperator(rule.operator);

    let newValue: string | string[];
    if (isNewRange && isCurrentRange) {
      newValue = Array.isArray(rule.value) ? rule.value : ['', ''];
    } else if (!isNewRange && !isCurrentRange) {
      newValue = typeof rule.value === 'string' ? rule.value : '';
    } else {
      newValue = isNewRange ? ['', ''] : '';
    }

    onUpdate({
      ...rule,
      operator: newOperator as FilterRule['operator'],
      value: newValue,
    });
  };

  const handleValueChange = (newValue: string, index?: number) => {
    if (isRange) {
      const current = Array.isArray(rule.value) ? rule.value : ['', ''];
      const updated = [...current];
      updated[index || 0] = newValue;
      onUpdate({ ...rule, value: updated });
    } else {
      onUpdate({ ...rule, value: newValue });
    }
  };

  const renderValueInput = () => {
    if (!hasField || !hasOperator) {
      return (
        <AppInput
          className="min-w-0 flex-1"
          disabled
          placeholder="Select field and operator first…"
          value=""
          onChange={() => {}}
        />
      );
    }

    if (fieldConfig!.type === 'user') {
      return (
        <div className="min-w-0 flex-1">
          <AppUserSelect
            value={String(value1 || '')}
            onChange={(id) => handleValueChange(id)}
            users={valueUsers}
            placeholder="Search or select user…"
            showSelectedChip={false}
            emptyMessage="No users found."
            triggerClassName="w-full"
          />
        </div>
      );
    }

    if (fieldConfig!.type === 'select') {
      return (
        <div className="min-w-0 flex-1">
          <AppSelect
            options={valueSelectOptions}
            value={String(value1 || '')}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={`Select ${fieldConfig!.label.toLowerCase()}…`}
            triggerClassName="w-full"
          />
        </div>
      );
    }

    if (fieldConfig!.type === 'date') {
      if (isRange) {
        return (
          <div className={uiCx(uiLayout.actionsRow, 'min-w-0 flex-1 items-center')}>
            <AppDatePicker
              className="min-w-0 flex-1"
              value={String(value1 || '')}
              onChange={(e) => handleValueChange(e.target.value, 0)}
            />
            <span className={uiTypography.helper}>→</span>
            <AppDatePicker
              className="min-w-0 flex-1"
              value={String(value2 || '')}
              onChange={(e) => handleValueChange(e.target.value, 1)}
            />
          </div>
        );
      }
      return (
        <AppDatePicker
          className="min-w-0 flex-1"
          value={String(value1 || '')}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      );
    }

    if (fieldConfig!.type === 'number') {
      if (isRange) {
        return (
          <div className={uiCx(uiLayout.actionsRow, 'min-w-0 flex-1 items-center')}>
            <AppInput
              className="min-w-0 flex-1"
              type="number"
              placeholder="Min"
              value={String(value1 || '')}
              onChange={(e) => handleValueChange(e.target.value, 0)}
            />
            <span className={uiTypography.helper}>→</span>
            <AppInput
              className="min-w-0 flex-1"
              type="number"
              placeholder="Max"
              value={String(value2 || '')}
              onChange={(e) => handleValueChange(e.target.value, 1)}
            />
          </div>
        );
      }
      return (
        <AppInput
          className="min-w-0 flex-1"
          type="number"
          placeholder="Enter value..."
          value={String(value1 || '')}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      );
    }

    if (fieldConfig!.type === 'text') {
      return (
        <AppInput
          className="min-w-0 flex-1"
          type="text"
          placeholder="Enter text..."
          value={String(value1 || '')}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      );
    }

    return null;
  };

  return (
    <div className={uiCx(uiLayout.actionsRow, 'items-start gap-2 sm:items-center sm:gap-3')}>
      <div className="w-full shrink-0 sm:w-40">
        <AppSelect
          options={fieldOptions}
          value={rule.field}
          onChange={(e) => handleFieldChange(e.target.value)}
          placeholder="Select field…"
          triggerClassName="w-full"
        />
      </div>
      <div className="w-full shrink-0 sm:w-36">
        <AppSelect
          options={operators}
          value={rule.operator}
          onChange={(e) => handleOperatorChange(e.target.value)}
          disabled={!hasField}
          placeholder="Select operator…"
          triggerClassName="w-full"
        />
      </div>
      <div className="min-w-0 flex-1">{renderValueInput()}</div>
      <AppButton
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 px-2"
        onClick={onDelete}
        aria-label="Delete rule"
        title="Delete rule"
      >
        <Trash2 className="h-4 w-4 text-gray-500" />
      </AppButton>
    </div>
  );
}
