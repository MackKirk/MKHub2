// Filter Builder Types - Shared across all pages

export type FilterOperator = 
  | 'is' 
  | 'is_not' 
  | 'is_before' 
  | 'is_after' 
  | 'is_between' 
  | 'is_equal_to' 
  | 'greater_than' 
  | 'less_than' 
  | 'between';

export type FilterRule = {
  id: string;
  field: string; // Field identifier (e.g., 'status', 'client_id', 'city')
  operator: FilterOperator;
  value: string | [string, string];
};

export type FieldConfig = {
  id: string;
  label: string;
  type: 'select' | 'date' | 'number' | 'text';
  operators: FilterOperator[];
  getOptions?: () => Array<{ value: string; label: string }>;
  getGroupedOptions?: () => Array<{ label: string; options: Array<{ value: string; label: string }> }>; // For optgroup support
  getValueLabel?: (value: string) => string;
};

export type FilterBuilderConfig = {
  fields: FieldConfig[];
  convertRuleToParam: (rule: FilterRule) => { key: string; value: string } | { key: string; value: string }[] | null;
  convertParamToRule: (key: string, value: string, params: URLSearchParams) => FilterRule | null;
  getFieldLabel: (fieldId: string) => string;
  formatRuleValue: (rule: FilterRule, config: FilterBuilderConfig) => string;
};

