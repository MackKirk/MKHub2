import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';

// Helper function to get user initials
function getUserInitials(user: any): string {
  const firstName = user?.first_name || user?.name || user?.username || '';
  const lastName = user?.last_name || '';
  const firstInitial = firstName ? firstName[0].toUpperCase() : '';
  const lastInitial = lastName ? lastName[0].toUpperCase() : '';
  if (firstInitial && lastInitial) {
    return firstInitial + lastInitial;
  }
  return firstInitial || (user?.username ? user.username[0].toUpperCase() : '?');
}

// Helper function to get user display name
function getUserDisplayName(user: any): string {
  if (user?.first_name && user?.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  return user?.name || user?.username || 'Unknown';
}

// Component for user avatar with tooltip
function UserAvatar({ user, size = 'w-6 h-6', showTooltip = true, tooltipText }: { 
  user: any; 
  size?: string; 
  showTooltip?: boolean;
  tooltipText?: string;
}) {
  const photoFileId = user?.profile_photo_file_id;
  const initials = getUserInitials(user);
  const displayName = tooltipText || getUserDisplayName(user);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative inline-flex group/avatar">
      {photoFileId && !imageError ? (
        <img
          src={`/files/${photoFileId}/thumbnail?w=80`}
          alt={displayName}
          className={`${size} rounded-full object-cover border border-gray-300`}
          onError={() => setImageError(true)}
        />
      ) : (
        <div className={`${size} rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs`}>
          {initials}
        </div>
      )}

      {showTooltip && (
        <div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
          {displayName}
          <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
        </div>
      )}
    </div>
  );
}

type Opportunity = { id:string, code?:string, name?:string, slug?:string, client_id?:string, created_at?:string, date_start?:string, date_eta?:string, date_end?:string, is_bidding?:boolean, project_division_ids?:string[], cover_image_url?:string, estimator_id?:string, estimator_name?:string, cost_estimated?:number };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };

// Filter Builder Types
type FilterField = 
  | 'status' 
  | 'division' 
  | 'client' 
  | 'estimator' 
  | 'start_date' 
  | 'eta' 
  | 'value';

type FilterOperator = 
  | 'is' 
  | 'is_not' 
  | 'is_before' 
  | 'is_after' 
  | 'is_between' 
  | 'is_equal_to' 
  | 'greater_than' 
  | 'less_than' 
  | 'between';

type FilterRule = {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string | [string, string];
};

// Helper: Get operators for a field type
function getOperatorsForField(field: FilterField): Array<{ value: FilterOperator; label: string }> {
  const textSelectFields: FilterField[] = ['status', 'division', 'client', 'estimator'];
  const dateFields: FilterField[] = ['start_date', 'eta'];
  
  if (textSelectFields.includes(field)) {
    return [
      { value: 'is', label: 'Is' },
      { value: 'is_not', label: 'Is not' },
    ];
  }
  
  if (dateFields.includes(field)) {
    return [
      { value: 'is', label: 'Is' },
      { value: 'is_before', label: 'Is before' },
      { value: 'is_after', label: 'Is after' },
      { value: 'is_between', label: 'Is between' },
    ];
  }
  
  if (field === 'value') {
    return [
      { value: 'is_equal_to', label: 'Is equal to' },
      { value: 'greater_than', label: 'Greater than' },
      { value: 'less_than', label: 'Less than' },
      { value: 'between', label: 'Between' },
    ];
  }
  
  return [];
}

// Helper: Check if operator requires two values
function isRangeOperator(operator: FilterOperator): boolean {
  return operator === 'is_between' || operator === 'between';
}

// Helper: Convert filter rules to URL parameters
function convertRulesToParams(rules: FilterRule[]): URLSearchParams {
  const params = new URLSearchParams();
  
  // First, clear all potential conflicting parameters to avoid conflicts
  // when switching between "is" and "is_not" operators
  const fieldsToClear: Record<string, string[]> = {
    'status': ['status', 'status_not'],
    'division': ['division_id', 'division_id_not'],
    'client': ['client_id', 'client_id_not'],
    'estimator': ['estimator_id', 'estimator_id_not'],
  };
  
  // Clear all conflicting parameters first
  Object.values(fieldsToClear).flat().forEach(param => {
    params.delete(param);
  });
  
  // Now process rules - only the last rule for each field will be applied
  // (though there should only be one rule per field)
  for (const rule of rules) {
    if (!rule.value || (Array.isArray(rule.value) && (!rule.value[0] || !rule.value[1]))) {
      continue; // Skip empty rules
    }
    
    switch (rule.field) {
      case 'status':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('status', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('status_not', rule.value);
          }
        }
        break;
      
      case 'division':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('division_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('division_id_not', rule.value);
          }
        }
        break;
      
      case 'client':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('client_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('client_id_not', rule.value);
          }
        }
        break;
      
      case 'estimator':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('estimator_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('estimator_id_not', rule.value);
          }
        }
        break;
      
      case 'start_date':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('date_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('date_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('date_start', rule.value);
            params.set('date_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('date_start', rule.value[0]);
          params.set('date_end', rule.value[1]);
        }
        break;
      
      case 'eta':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('eta_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('eta_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('eta_start', rule.value);
            params.set('eta_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('eta_start', rule.value[0]);
          params.set('eta_end', rule.value[1]);
        }
        break;
      
      case 'value':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'greater_than') {
            params.set('value_min', rule.value);
          } else if (rule.operator === 'less_than') {
            params.set('value_max', rule.value);
          } else if (rule.operator === 'is_equal_to') {
            params.set('value_min', rule.value);
            params.set('value_max', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'between') {
          params.set('value_min', rule.value[0]);
          params.set('value_max', rule.value[1]);
        }
        break;
    }
  }
  
  return params;
}

// Helper: Convert URL parameters to filter rules
function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;
  
  // Status
  const status = params.get('status');
  const statusNot = params.get('status_not');
  if (status) {
    rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is', value: status });
  } else if (statusNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is_not', value: statusNot });
  }
  
  // Division
  const division = params.get('division_id');
  const divisionNot = params.get('division_id_not');
  if (division) {
    rules.push({ id: `rule-${idCounter++}`, field: 'division', operator: 'is', value: division });
  } else if (divisionNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'division', operator: 'is_not', value: divisionNot });
  }
  
  // Client
  const client = params.get('client_id');
  const clientNot = params.get('client_id_not');
  if (client) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is', value: client });
  } else if (clientNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is_not', value: clientNot });
  }
  
  // Estimator
  const estimator = params.get('estimator_id');
  const estimatorNot = params.get('estimator_id_not');
  if (estimator) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is', value: estimator });
  } else if (estimatorNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is_not', value: estimatorNot });
  }
  
  // Date range
  const dateStart = params.get('date_start');
  const dateEnd = params.get('date_end');
  if (dateStart && dateEnd) {
    if (dateStart === dateEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is', value: dateStart });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_between', value: [dateStart, dateEnd] });
    }
  } else if (dateStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_after', value: dateStart });
  } else if (dateEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_before', value: dateEnd });
  }
  
  // ETA range
  const etaStart = params.get('eta_start');
  const etaEnd = params.get('eta_end');
  if (etaStart && etaEnd) {
    if (etaStart === etaEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is', value: etaStart });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_between', value: [etaStart, etaEnd] });
    }
  } else if (etaStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_after', value: etaStart });
  } else if (etaEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_before', value: etaEnd });
  }
  
  // Value range
  const valueMin = params.get('value_min');
  const valueMax = params.get('value_max');
  if (valueMin && valueMax) {
    if (valueMin === valueMax) {
      rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'is_equal_to', value: valueMin });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'between', value: [valueMin, valueMax] });
    }
  } else if (valueMin) {
    rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'greater_than', value: valueMin });
  } else if (valueMax) {
    rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'less_than', value: valueMax });
  }
  
  return rules;
}

// Filter Chip Component
function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200 text-sm text-gray-700 transition-all duration-200 ease-out">
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 w-4 h-4 rounded-full hover:bg-gray-200 flex items-center justify-center transition-colors duration-150"
        aria-label={`Remove ${label} filter`}
      >
        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Filter Rule Row Component
function FilterRuleRow({ 
  rule, 
  onUpdate, 
  onDelete,
  projectStatuses,
  projectDivisions,
  clients,
  employees
}: { 
  rule: FilterRule;
  onUpdate: (rule: FilterRule) => void;
  onDelete: () => void;
  projectStatuses: any[];
  projectDivisions: any[];
  clients: any[];
  employees: any[];
}) {
  const operators = getOperatorsForField(rule.field);
  const isRange = isRangeOperator(rule.operator);
  const currentValue = rule.value;
  const value1 = Array.isArray(currentValue) ? currentValue[0] : currentValue;
  const value2 = Array.isArray(currentValue) ? currentValue[1] : '';

  const fieldOptions: Array<{ value: FilterField; label: string }> = [
    { value: 'status', label: 'Status' },
    { value: 'division', label: 'Division' },
    { value: 'client', label: 'Client' },
    { value: 'estimator', label: 'Estimator' },
    { value: 'start_date', label: 'Start Date' },
    { value: 'eta', label: 'ETA' },
    { value: 'value', label: 'Value' },
  ];

  const handleFieldChange = (newField: FilterField) => {
    const newOperators = getOperatorsForField(newField);
    const newOperator = newOperators[0]?.value || 'is';
    onUpdate({
      ...rule,
      field: newField,
      operator: newOperator,
      value: '',
    });
  };

  const handleOperatorChange = (newOperator: FilterOperator) => {
    const isNewRange = isRangeOperator(newOperator);
    const isCurrentRange = isRangeOperator(rule.operator);
    
    // Preserve value if switching between compatible operators (both range or both non-range)
    let newValue: string | string[];
    if (isNewRange && isCurrentRange) {
      // Both are range operators - preserve the array
      newValue = Array.isArray(rule.value) ? rule.value : ['', ''];
    } else if (!isNewRange && !isCurrentRange) {
      // Both are non-range operators - preserve the string value
      newValue = typeof rule.value === 'string' ? rule.value : '';
    } else {
      // Switching between range and non-range - reset to appropriate type
      newValue = isNewRange ? ['', ''] : '';
    }
    
    onUpdate({
      ...rule,
      operator: newOperator,
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
    const textSelectFields: FilterField[] = ['status', 'division', 'client', 'estimator'];
    const dateFields: FilterField[] = ['start_date', 'eta'];

    if (textSelectFields.includes(rule.field)) {
      if (rule.field === 'status') {
        return (
          <select
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
            value={value1}
            onChange={(e) => handleValueChange(e.target.value)}
          >
            <option value="">Select status...</option>
            {projectStatuses
              .filter((status: any) => ['Prospecting', 'Sent to Customer', 'Refused'].includes(status.label))
              .map((status: any) => (
                <option key={status.id} value={status.id}>{status.label}</option>
              ))}
          </select>
        );
      }
      if (rule.field === 'division') {
        return (
          <select
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
            value={value1}
            onChange={(e) => handleValueChange(e.target.value)}
          >
            <option value="">Select division...</option>
            {projectDivisions?.map((div: any) => (
              <optgroup key={div.id} label={div.label}>
                <option value={div.id}>{div.label}</option>
                {div.subdivisions?.map((sub: any) => (
                  <option key={sub.id} value={sub.id}>{sub.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        );
      }
      if (rule.field === 'client') {
        return (
          <select
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
            value={value1}
            onChange={(e) => handleValueChange(e.target.value)}
          >
            <option value="">Select client...</option>
            {clients.map((client: any) => (
              <option key={client.id} value={client.id}>
                {client.display_name || client.name || client.code || client.id}
              </option>
            ))}
          </select>
        );
      }
      if (rule.field === 'estimator') {
        return (
          <select
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
            value={value1}
            onChange={(e) => handleValueChange(e.target.value)}
          >
            <option value="">Select estimator...</option>
            {employees.map((emp: any) => (
              <option key={emp.id} value={emp.id}>
                {emp.name || emp.username}
              </option>
            ))}
          </select>
        );
      }
    }

    if (dateFields.includes(rule.field)) {
      if (isRange) {
        return (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
              value={value1}
              onChange={(e) => handleValueChange(e.target.value, 0)}
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="date"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
              value={value2}
              onChange={(e) => handleValueChange(e.target.value, 1)}
            />
          </div>
        );
      }
      return (
        <input
          type="date"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={value1}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      );
    }

    if (rule.field === 'value') {
      if (isRange) {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
              placeholder="Min"
              value={value1}
              onChange={(e) => handleValueChange(e.target.value, 0)}
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="number"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
              placeholder="Max"
              value={value2}
              onChange={(e) => handleValueChange(e.target.value, 1)}
            />
          </div>
        );
      }
      return (
        <input
          type="number"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          placeholder="Enter value..."
          value={value1}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      );
    }

    return null;
  };

  return (
    <div className="flex items-center gap-3 transition-all duration-200 ease-out">
      <select
        className="w-40 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
        value={rule.field}
        onChange={(e) => handleFieldChange(e.target.value as FilterField)}
      >
        {fieldOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        className="w-36 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
        value={rule.operator}
        onChange={(e) => handleOperatorChange(e.target.value as FilterOperator)}
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      <div className="flex-1">
        {renderValueInput()}
      </div>

      <button
        onClick={onDelete}
        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors duration-150"
        aria-label="Delete rule"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

// Filter Builder Modal Component
function FilterBuilderModal({
  isOpen,
  onClose,
  onApply,
  initialRules,
  projectStatuses,
  projectDivisions,
  clients,
  employees
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (rules: FilterRule[]) => void;
  initialRules: FilterRule[];
  projectStatuses: any[];
  projectDivisions: any[];
  clients: any[];
  employees: any[];
}) {
  const [rules, setRules] = useState<FilterRule[]>(initialRules);

  // Update rules when modal opens with new initial rules
  useEffect(() => {
    if (isOpen) {
      setRules(initialRules);
    }
  }, [isOpen, initialRules]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleAddRule = () => {
    const newRule: FilterRule = {
      id: `rule-${Date.now()}`,
      field: 'status',
      operator: 'is',
      value: '',
    };
    setRules([...rules, newRule]);
  };

  const handleUpdateRule = (updatedRule: FilterRule) => {
    setRules(rules.map(r => r.id === updatedRule.id ? updatedRule : r));
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const handleClearAll = () => {
    setRules([]);
  };

  const handleApply = () => {
    onApply(rules);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200 ease-out"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-lg w-full max-w-[720px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ 
          animation: 'fadeInSlideUp 200ms ease-out forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors duration-150"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No filters applied. Add a filter to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="transition-all duration-200 ease-out">
                  <FilterRuleRow
                    rule={rule}
                    onUpdate={handleUpdateRule}
                    onDelete={() => handleDeleteRule(rule.id)}
                    projectStatuses={projectStatuses}
                    projectDivisions={projectDivisions}
                    clients={clients}
                    employees={employees}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Add Filter Button */}
          <button
            onClick={handleAddRule}
            className="mt-4 w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md hover:bg-gray-50 transition-all duration-150"
          >
            + Add filter
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <div>
            {rules.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-red hover:bg-brand-red700 rounded-md transition-colors duration-150"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Opportunities(){
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  
  const [q, setQ] = useState(queryParam);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  
  // View mode state with persistence
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    // Check URL param first
    const urlView = searchParams.get('view');
    if (urlView === 'list' || urlView === 'cards') {
      return urlView;
    }
    // Then check localStorage
    const saved = localStorage.getItem('opportunities-view-mode');
    return (saved === 'list' || saved === 'cards') ? saved : 'list';
  });
  
  // Sync viewMode with URL and localStorage
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (viewMode === 'list') {
      params.set('view', 'list');
    } else {
      params.delete('view');
    }
    setSearchParams(params, { replace: true });
    localStorage.setItem('opportunities-view-mode', viewMode);
  }, [viewMode, searchParams, setSearchParams]);
  
  // Get current date formatted (same as Dashboard)
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);
  
  // Convert current URL params to rules for modal
  const currentRules = useMemo(() => {
    return convertParamsToRules(searchParams);
  }, [searchParams]);
  
  // Sync search query with URL when it changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (q) {
      params.set('q', q);
    } else {
      params.delete('q');
    }
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  
  // Sync q state when URL changes
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) setQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  
  // Build query string from URL params (filters are managed through modal)
  const qs = useMemo(()=> {
    const params = new URLSearchParams(searchParams);
    return params.toString() ? '?' + params.toString() : '';
  }, [searchParams]);
  
  const { data, isLoading, refetch } = useQuery({ 
    queryKey:['opportunities', qs], 
    queryFn: ()=> api<Opportunity[]>('GET', `/projects/business/opportunities${qs}`)
  });
  
  // Load project divisions in parallel
  const { data: projectDivisions, isLoading: divisionsLoading } = useQuery({ 
    queryKey:['project-divisions'], 
    queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), 
    staleTime: 300_000
  });
  
  // Show loading until both opportunities and divisions are loaded
  const isInitialLoading = (isLoading && !data) || (divisionsLoading && !projectDivisions);
  
  // Track when animation completes to remove inline styles for hover to work
  useEffect(() => {
    if (hasAnimated) {
      const timer = setTimeout(() => setAnimationComplete(true), 400);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated]);
  
  // Track when initial data is loaded to trigger entry animations
  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, hasAnimated]);
  
  const { data: settings } = useQuery({ 
    queryKey:['settings'], 
    queryFn: ()=> api<any>('GET','/settings'), 
    staleTime: 300_000
  });
  
  const reportCategories = (settings?.report_categories || []) as any[];
  
  // Get clients for filter
  const { data: clientsData } = useQuery({ 
    queryKey:['clients-for-filter'], 
    queryFn: ()=> api<any>('GET','/clients?limit=500'), 
    staleTime: 300_000
  });
  
  const projectStatuses = settings?.project_statuses || [];
  const clients = clientsData?.items || clientsData || [];
  const arr = data||[];
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);
  const [reportModalOpen, setReportModalOpen] = useState<{ open:boolean, projectId?:string }|null>(null);

  // Get employees for estimator filter
  const { data: employeesData } = useQuery({ 
    queryKey:['employees-for-filter'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  const employees = employeesData || [];

  // Check permissions
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const hasEditPermission = (me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('business:projects:write');

  // Check if any structured filters are active (for Clear Filters button and chips)
  const hasActiveFilters = useMemo(() => {
    return currentRules.length > 0;
  }, [currentRules]);
  
  // Handle applying filters from modal
  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    // Preserve search query
    if (q) params.set('q', q);
    setSearchParams(params);
    refetch();
  };
  
  // Helper to format rule value for chip display
  const formatRuleValue = (rule: FilterRule): string => {
    if (Array.isArray(rule.value)) {
      return `${rule.value[0]} → ${rule.value[1]}`;
    }
    if (rule.field === 'status') {
      const status = projectStatuses.find((s: any) => String(s.id) === rule.value);
      return status?.label || String(rule.value);
    }
    if (rule.field === 'division') {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === rule.value) return div.label;
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === rule.value) return `${div.label} - ${sub.label}`;
        }
      }
      return String(rule.value);
    }
    if (rule.field === 'client') {
      const client = clients.find((c: any) => String(c.id) === rule.value);
      return client?.display_name || client?.name || String(rule.value);
    }
    if (rule.field === 'estimator') {
      const employee = employees.find((e: any) => String(e.id) === rule.value);
      return employee?.name || employee?.username || String(rule.value);
    }
    if (rule.field === 'value') {
      return `$${rule.value}`;
    }
    return String(rule.value);
  };
  
  // Helper to get field label
  const getFieldLabel = (field: FilterField): string => {
    const labels: Record<FilterField, string> = {
      status: 'Status',
      division: 'Division',
      client: 'Client',
      estimator: 'Estimator',
      start_date: 'Start Date',
      eta: 'ETA',
      value: 'Value',
    };
    return labels[field] || field;
  };

  // Helper to get filter label for chips
  const getFilterLabel = (type: string, value: string): string => {
    if (type === 'status') {
      const status = projectStatuses.find((s: any) => String(s.id) === value);
      return status?.label || value;
    }
    if (type === 'division') {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === value) return div.label;
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === value) return `${div.label} - ${sub.label}`;
        }
      }
      return value;
    }
    if (type === 'client') {
      const client = clients.find((c: any) => String(c.id) === value);
      return client?.display_name || client?.name || value;
    }
    if (type === 'estimator') {
      const employee = employees.find((e: any) => String(e.id) === value);
      return employee?.name || employee?.username || value;
    }
    return value;
  };

  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Opportunities</div>
          <div className="text-sm text-gray-500 font-medium">Create, edit and track bids and quotes</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      {/* Filter Bar */}
      <div className="mb-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Primary Row: Global Search + Status + Actions */}
        <div className="px-6 py-4 bg-white">
          <div className="flex items-center gap-4">
            {/* View Toggle Button */}
            <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                  viewMode === 'list'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                title="List view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2.5 text-sm font-medium transition-colors duration-150 border-l border-gray-200 ${
                  viewMode === 'cards'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                title="Card view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>

            {/* Global Search - Dominant, large */}
            <div className="flex-1">
              <div className="relative">
                <input 
                  className="w-full border border-gray-200 rounded-md px-4 py-2.5 pl-10 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150" 
                  placeholder="Search by opportunity name, code, or client name..." 
                  value={q} 
                  onChange={e=>setQ(e.target.value)} 
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* + Filters Button - Opens Modal */}
            <button 
              onClick={()=>setIsFilterModalOpen(true)}
              className="px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 whitespace-nowrap"
            >
              + Filters
            </button>

            {/* Clear Filters - Only when active */}
            {hasActiveFilters && (
              <button 
                onClick={()=>{
                  const params = new URLSearchParams();
                  if (q) params.set('q', q);
                  setSearchParams(params);
                  refetch();
                }} 
                className="px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors duration-150 whitespace-nowrap"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      {hasActiveFilters && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {currentRules.map((rule) => {
            const fieldLabel = getFieldLabel(rule.field);
            const operatorLabel = rule.operator === 'is_not' ? 'Is not' : '';
            const displayLabel = operatorLabel ? `${fieldLabel} ${operatorLabel}` : fieldLabel;
            return (
              <FilterChip
                key={rule.id}
                label={displayLabel}
                value={formatRuleValue(rule)}
                onRemove={() => {
                  const updatedRules = currentRules.filter(r => r.id !== rule.id);
                  const params = convertRulesToParams(updatedRules);
                  if (q) params.set('q', q);
                  setSearchParams(params);
                  refetch();
                }}
              />
            );
          })}
        </div>
      )}
      
      <LoadingOverlay isLoading={isInitialLoading} text="Loading opportunities...">
        {viewMode === 'cards' ? (
          <div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3 gap-4"
            style={animationComplete ? {} : {
              opacity: hasAnimated ? 1 : 0,
              transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
              transition: 'opacity 400ms ease-out, transform 400ms ease-out'
            }}
          >
            {hasEditPermission && (
              <Link
                to="/projects/new?is_bidding=true"
                state={{ backgroundLocation: location }}
                className="border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[200px]"
              >
                <div className="text-4xl text-gray-400 mb-2">+</div>
                <div className="font-medium text-sm text-gray-700">New Opportunity</div>
                <div className="text-xs text-gray-500 mt-1">Add new opportunity</div>
              </Link>
            )}
            {arr.map(p => (
              <OpportunityListCard 
                key={p.id} 
                opportunity={p} 
                onOpenReportModal={(projectId) => setReportModalOpen({ open: true, projectId })}
                projectStatuses={projectStatuses}
              />
            ))}
          </div>
        ) : (
          <div 
            className="flex flex-col gap-2"
            style={animationComplete ? {} : {
              opacity: hasAnimated ? 1 : 0,
              transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
              transition: 'opacity 400ms ease-out, transform 400ms ease-out'
            }}
          >
            {hasEditPermission && (
              <Link
                to="/projects/new?is_bidding=true"
                state={{ backgroundLocation: location }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px]"
              >
                <div className="text-2xl text-gray-400 mr-2">+</div>
                <div className="font-medium text-sm text-gray-700">New Opportunity</div>
              </Link>
            )}
            {arr.map(p => (
              <OpportunityListItem 
                key={p.id} 
                opportunity={p} 
                onOpenReportModal={(projectId) => setReportModalOpen({ open: true, projectId })}
                projectStatuses={projectStatuses}
              />
            ))}
          </div>
        )}
        {!isInitialLoading && arr.length === 0 && (
          <div className="p-8 text-center text-gray-500 rounded-xl border bg-white">
            No opportunities found matching your criteria.
          </div>
        )}
      </LoadingOverlay>
      {pickerOpen?.open && (
        <ImagePicker isOpen={true} onClose={()=>setPickerOpen(null)} clientId={String(pickerOpen?.clientId||'')} targetWidth={800} targetHeight={300} allowEdit={true} onConfirm={async(blob)=>{
          try{
            // Upload derived cover and associate to client (category project-cover-derived)
            const up:any = await api('POST','/files/upload',{ project_id: pickerOpen?.projectId||null, client_id: pickerOpen?.clientId||null, employee_id:null, category_id:'project-cover-derived', original_name: 'project-cover.jpg', content_type: 'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            if (pickerOpen?.clientId){ await api('POST', `/clients/${pickerOpen.clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`); }
            toast.success('Cover updated');
            setPickerOpen(null);
          }catch(e){ toast.error('Failed to update cover'); setPickerOpen(null); }
        }} />
      )}
      {reportModalOpen?.open && reportModalOpen?.projectId && (
        <CreateReportModal
          projectId={reportModalOpen.projectId}
          reportCategories={reportCategories}
          onClose={() => setReportModalOpen(null)}
          onSuccess={async () => {
            setReportModalOpen(null);
            toast.success('Report created successfully');
          }}
        />
      )}
      
      {/* Filter Builder Modal */}
      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        projectStatuses={projectStatuses}
        projectDivisions={projectDivisions || []}
        clients={clients}
        employees={employees}
      />
    </div>
  );
}

// Icon mapping for divisions
const getDivisionIcon = (label: string): string => {
  const iconMap: Record<string, string> = {
    'Roofing': '🏠',
    'Concrete Restoration & Waterproofing': '🏗️',
    'Cladding & Exterior Finishes': '🧱',
    'Repairs & Maintenance': '🔧',
    'Mechanical': '🔩',
    'Electrical': '⚡',
    'Carpentry': '🪵',
    'Welding & Custom Fabrication': '🔥',
    'Structural Upgrading': '📐',
    'Solar PV': '☀️',
    'Green Roofing': '🌱',
  };
  return iconMap[label] || '📦';
};

function CreateReportModal({ projectId, reportCategories, onClose, onSuccess }: {
  projectId: string,
  reportCategories: any[],
  onClose: () => void,
  onSuccess: () => Promise<void>
}){
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const { data:project } = useQuery({ queryKey:['project', projectId], queryFn: ()=>api<any>('GET', `/projects/${projectId}`) });
  
  // Separate categories into commercial and production based on meta.group
  const commercialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'commercial';
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);
  
  const productionCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'production';
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);
  
  // If it's an opportunity (is_bidding), show only commercial categories
  const isBidding = project?.is_bidding === true;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selectedFiles]);
    // Reset input to allow selecting the same file again
    if (e.target) {
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!desc.trim()) {
      toast.error('Please enter a description');
      return;
    }
    
    setUploading(true);
    try {
      const attachments: any[] = [];
      
      // Upload all files
      for (const file of files) {
        const up: any = await api('POST', '/files/upload', {
          project_id: projectId,
          client_id: project?.client_id || null,
          employee_id: null,
          category_id: 'project-report',
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        });
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-ms-blob-type': 'BlockBlob'
          },
          body: file
        });
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: file.size,
          checksum_sha256: 'na',
          content_type: file.type || 'application/octet-stream'
        });
        attachments.push({
          file_object_id: conf.id,
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        });
      }
      
      await api('POST', `/projects/${projectId}/reports`, {
        title: title.trim(),
        category_id: category || null,
        description: desc,
        images: attachments.length > 0 ? { attachments } : undefined
      });
      
      setTitle('');
      setCategory('');
      setDesc('');
      setFiles([]);
      await onSuccess();
    } catch (_e) {
      toast.error('Failed to create report');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Create Project Report</h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-white hover:text-gray-200 w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Title *</label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Enter report title..."
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Category</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="">Select category...</option>
                {!isBidding && commercialCategories.length > 0 && (
                  <optgroup label="Commercial">
                    {commercialCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
                {!isBidding && productionCategories.length > 0 && (
                  <optgroup label="Production / Execution">
                    {productionCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
                {isBidding && commercialCategories.length > 0 && (
                  <>
                    {commercialCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Description *</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                rows={6}
                placeholder="Describe what happened, how the day went, or any events on site..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Images (optional - multiple allowed)</label>
              <input
                type="file"
                onChange={handleFileSelect}
                className="w-full border rounded px-3 py-2 text-sm"
                accept="image/*"
                multiple
              />
              {files.length > 0 && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {files.map((file, index) => {
                    const isImage = file.type.startsWith('image/');
                    const previewUrl = isImage ? URL.createObjectURL(file) : null;
                    return (
                      <div key={index} className="relative border rounded-lg overflow-hidden bg-gray-50">
                        {previewUrl ? (
                          <img src={previewUrl} alt={file.name} className="w-full h-32 object-cover" />
                        ) : (
                          <div className="w-full h-32 flex items-center justify-center text-gray-400">
                            📎 {file.name}
                          </div>
                        )}
                        <div className="p-2 bg-white border-t">
                          <div className="text-xs text-gray-600 truncate" title={file.name}>{file.name}</div>
                          <button
                            onClick={() => {
                              if (previewUrl) URL.revokeObjectURL(previewUrl);
                              removeFile(index);
                            }}
                            className="mt-1 text-xs text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={uploading}
            className="px-4 py-2 rounded bg-brand-red hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {uploading ? 'Creating...' : 'Create Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OpportunityListItem({ opportunity, onOpenReportModal, projectStatuses }: { 
  opportunity: Opportunity;
  onOpenReportModal: (projectId: string) => void;
  projectStatuses: any[];
}){
  const navigate = useNavigate();
  const { data:client } = useQuery({ 
    queryKey:['opportunity-client', opportunity.client_id], 
    queryFn: ()=> opportunity.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id||''))}`): Promise.resolve(null), 
    enabled: !!opportunity.client_id, 
    staleTime: 300_000 
  });
  const { data:details } = useQuery({ 
    queryKey:['opportunity-detail-card', opportunity.id], 
    queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(opportunity.id))}`), 
    staleTime: 60_000 
  });
  
  const status = (opportunity as any).status_label || details?.status_label || '';
  const statusLabel = String(status || '').trim();
  const statusColor = (projectStatuses || []).find((s: any) => String(s?.label || '').trim() === statusLabel)?.value || '#e5e7eb';
  const estimatedValue = (opportunity as any).cost_estimated || details?.cost_estimated || 0;
  const estimatorIds = (opportunity as any).estimator_ids || details?.estimator_ids || ((opportunity as any).estimator_id || details?.estimator_id ? [(opportunity as any).estimator_id || details?.estimator_id] : []);
  const clientName = client?.display_name || client?.name || '';
  
  // Get employees data for avatars
  const { data: employeesData } = useQuery({ 
    queryKey:['employees-for-opportunities-list'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  const employees = employeesData || [];
  
  // Get estimator employees for avatars
  const estimators = useMemo(() => {
    return estimatorIds
      .map((id: string) => employees.find((e: any) => String(e.id) === String(id)))
      .filter(Boolean);
  }, [estimatorIds, employees]);

  return (
    <Link 
      to={`/opportunities/${encodeURIComponent(String(opportunity.id))}`} 
      className="group border rounded-lg bg-white p-4 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: Name, Code, Client */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base text-gray-900 group-hover:text-[#7f1010] transition-colors truncate">
            {opportunity.name || 'Opportunity'}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
            <span className="truncate">{opportunity.code || '—'}</span>
            {clientName && (
              <>
                <span className="text-gray-400">•</span>
                <span className="truncate">{clientName}</span>
              </>
            )}
          </div>
        </div>

        {/* Center: Estimator and Value */}
        <div className="flex items-center gap-6 text-sm">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 mb-1">Estimator</div>
            {estimators.length === 0 ? (
              <div className="text-gray-400 text-xs">—</div>
            ) : estimators.length === 1 ? (
              <div className="flex items-center gap-2">
                <UserAvatar user={estimators[0]} size="w-5 h-5" showTooltip={true} />
                <div className="font-medium text-gray-900 text-xs truncate max-w-[120px]">{getUserDisplayName(estimators[0])}</div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {estimators.slice(0, 2).map((est: any) => (
                  <UserAvatar key={est.id} user={est} size="w-5 h-5" showTooltip={true} />
                ))}
                {estimators.length > 2 && (
                  <span className="text-xs text-gray-500 ml-1">+{estimators.length - 2}</span>
                )}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Value</div>
            <div className="font-semibold text-[#7f1010] whitespace-nowrap">
              {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
          </div>
        </div>

        {/* Right: Status */}
        <div className="flex-shrink-0">
          <span
            className={[
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm',
              'backdrop-blur-sm border-gray-200 text-gray-800',
            ].join(' ')}
            title={status}
            style={{ backgroundColor: statusColor, color: '#000' }}
          >
            <span className="truncate max-w-[10rem]">{status || '—'}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function OpportunityListCard({ opportunity, onOpenReportModal, projectStatuses }: { 
  opportunity: Opportunity;
  onOpenReportModal: (projectId: string) => void;
  projectStatuses: any[];
}){
  const navigate = useNavigate();
  // Card cover should match General Information: backend now provides cover_image_url with correct priority
  const src = opportunity.cover_image_url || '/ui/assets/placeholders/project.png';
  const { data:details } = useQuery({ queryKey:['opportunity-detail-card', opportunity.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(opportunity.id))}`), staleTime: 60_000 });
  const { data:client } = useQuery({ queryKey:['opportunity-client', opportunity.client_id], queryFn: ()=> opportunity.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id||''))}`): Promise.resolve(null), enabled: !!opportunity.client_id, staleTime: 300_000 });
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const status = (opportunity as any).status_label || details?.status_label || '';
  const statusLabel = String(status || '').trim();
  const statusColor = (projectStatuses || []).find((s: any) => String(s?.label || '').trim() === statusLabel)?.value || '#e5e7eb';
  const start = (opportunity.date_start || details?.date_start || opportunity.created_at || '').slice(0,10);
  const eta = (opportunity.date_eta || details?.date_eta || '').slice(0, 10);
  const estimatedValue = (opportunity as any).cost_estimated || details?.cost_estimated || 0;
  const estimatorIds = (opportunity as any).estimator_ids || details?.estimator_ids || ((opportunity as any).estimator_id || details?.estimator_id ? [(opportunity as any).estimator_id || details?.estimator_id] : []);
  const clientName = client?.display_name || client?.name || '';
  const projectDivIds = (opportunity as any).project_division_ids || details?.project_division_ids || [];
  const percentages = (opportunity as any).project_division_percentages || details?.project_division_percentages || {};
  
  // Get employees data for avatars
  const { data: employeesData } = useQuery({ 
    queryKey:['employees-for-opportunities-cards'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  const employees = employeesData || [];
  
  // Get estimator employees for avatars
  const estimators = useMemo(() => {
    return estimatorIds
      .map((id: string) => employees.find((e: any) => String(e.id) === String(id)))
      .filter(Boolean);
  }, [estimatorIds, employees]);
  
  // Check for pending data (mobile-created opportunities may be missing key fields)
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    // Use details if available, otherwise fallback to opportunity data
    const siteId = details?.site_id;
    const hasDivisions = Array.isArray(projectDivIds) && projectDivIds.length > 0;
    const hasEstimators = estimatorIds.length > 0;
    
    if (!hasEstimators) missing.push('Estimator');
    if (!siteId) missing.push('Site');
    if (!hasDivisions) missing.push('Division');
    
    return missing;
  }, [details, projectDivIds, estimatorIds]);
  
  const hasPendingData = missingFields.length > 0;
  
  // Calculate percentages if not set (auto-initialize)
  const calculatedPercentages = useMemo(() => {
    if (projectDivIds.length === 0) return {};
    // If percentages exist and cover all divisions, use them
    const hasPercentages = projectDivIds.every(id => percentages[String(id)] !== undefined);
    if (hasPercentages && Object.keys(percentages).length > 0) {
      return percentages;
    }
    // Otherwise, calculate equal distribution
    const equalPercent = projectDivIds.length === 1 ? 100 : 100 / projectDivIds.length;
    const result: { [key: string]: number } = {};
    projectDivIds.forEach(id => {
      result[String(id)] = equalPercent;
    });
    return result;
  }, [projectDivIds, percentages]);
  
  // Get division icons and labels with percentages
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: string; label: string; percentage: number }> = [];
    for (const divId of projectDivIds.slice(0, 5)) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ 
            icon: getDivisionIcon(div.label), 
            label: div.label,
            percentage: calculatedPercentages[String(divId)] || 0
          });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ 
              icon: getDivisionIcon(div.label), 
              label: `${div.label} - ${sub.label}`,
              percentage: calculatedPercentages[String(divId)] || 0
            });
            break;
          }
        }
        if (icons.length > 0 && icons[icons.length - 1].label.includes(String(divId))) break;
      }
    }
    return icons;
  }, [projectDivIds, projectDivisions, calculatedPercentages]);

  // Tab icons and navigation (for opportunities: files, proposal, reports)
  const tabButtons = [
    { key: 'files', icon: '📁', label: 'Files', tab: 'files' },
    { key: 'proposal', icon: '📄', label: 'Proposal', tab: 'proposal' },
    { key: 'reports', icon: '📋', label: 'Report', tab: 'reports' },
  ];

  return (
    <Link 
      to={`/opportunities/${encodeURIComponent(String(opportunity.id))}`} 
      className="group rounded-xl border bg-white hover:border-gray-200 hover:shadow-md hover:-translate-y-0.5 block h-full transition-all duration-200 relative"
    >
      {/* Pending data alert icon (separate, top-left) */}
      {hasPendingData && (
        <div className="absolute top-3 right-3 z-20 group/alert">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-orange-600 drop-shadow-sm"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>

          {/* Tooltip showing missing fields */}
          <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
            <div className="font-semibold mb-1">Pending Data:</div>
            <div className="space-y-0.5">
              {missingFields.map((field, idx) => (
                <div key={idx}>• {field}</div>
              ))}
            </div>
            <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
          </div>
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* Status row (own line, top-right) */}
        {/* Top row: thumb + title */}
        <div className="flex gap-4">
          {/* Image (smaller, does NOT dictate card size) */}
          <div className="w-24 h-20 flex-shrink-0">
            <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden relative">
              <img className="w-full h-full object-cover" src={src} alt={opportunity.name || 'Opportunity'} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Customer + name + code (as before) */}
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-gray-500 truncate min-w-0">{clientName || 'No client'}</div>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-base text-gray-900 group-hover:text-[#7f1010] transition-colors whitespace-normal break-words">
                {opportunity.name || 'Opportunity'}
              </div>
              <div className="text-xs text-gray-600 break-words">{opportunity.code || '—'}</div>
            </div>

            {/* Icons row (right below code) */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {tabButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (btn.key === 'reports') {
                      onOpenReportModal(String(opportunity.id));
                    } else {
                      navigate(`/opportunities/${encodeURIComponent(String(opportunity.id))}?tab=${btn.tab}`);
                    }
                  }}
                  className="relative group/btn w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 border border-gray-200 hover:border-gray-300 flex items-center justify-center text-xs transition-all hover:scale-[1.05]"
                  title={btn.label}
                >
                  {btn.icon}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-20">
                    {btn.label}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-black/5" />

        {/* Fields (simple text, no boxed grid) */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 mb-1.5">Estimator</div>
            {estimators.length === 0 ? (
              <div className="text-gray-400 text-xs">—</div>
            ) : estimators.length === 1 ? (
              <div className="flex items-center gap-2">
                <UserAvatar user={estimators[0]} size="w-6 h-6" showTooltip={true} />
                <div className="font-medium text-gray-900 text-xs truncate">{getUserDisplayName(estimators[0])}</div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {estimators.map((est: any) => (
                  <UserAvatar key={est.id} user={est} size="w-6 h-6" showTooltip={true} />
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500 mb-1.5">Estimated Value</div>
            <div className="h-6 flex items-center">
              <div className="font-semibold text-[#7f1010] truncate w-full">
                {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-black/5" />

        {/* Bottom row: divisions (left) + status (right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {divisionIcons.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {divisionIcons.map((div, idx) => (
                  <div key={idx} className="relative group/icon flex flex-col items-center" title={div.label}>
                    <div className="text-xl cursor-pointer hover:scale-110 transition-transform">
                      {div.icon}
                    </div>
                    <div className="text-xs text-gray-600 font-bold mt-0.5">
                      {Math.round(div.percentage || 0)}%
                    </div>
                    <div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10">
                      {div.label}
                      <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                    </div>
                  </div>
                ))}
                {projectDivIds.length > 5 && (
                  <div className="relative group/icon">
                    <div className="text-sm text-gray-400 cursor-pointer" title={`${projectDivIds.length - 5} more divisions`}>
                      +{projectDivIds.length - 5}
                    </div>
                    <div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10">
                      {projectDivIds.length - 5} more divisions
                      <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400">No division</div>
            )}
          </div>

          <div className="relative flex-shrink-0">
            <span
              className={[
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] leading-4 font-medium border shadow-sm',
                'backdrop-blur-sm border-gray-200 text-gray-800',
              ].join(' ')}
              title={status}
              style={{ backgroundColor: statusColor, color: '#000' }}
            >
              <span className="truncate max-w-[10rem]">{status || '—'}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

