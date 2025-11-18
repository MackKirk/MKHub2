import { useState } from 'react';

type ChecklistItem = {
  key: string;
  label: string;
};

type Props = {
  items: ChecklistItem[];
  results?: Record<string, string>;
  onChange?: (results: Record<string, string>) => void;
  readOnly?: boolean;
};

export default function InspectionChecklist({ items, results = {}, onChange, readOnly = false }: Props) {
  const [localResults, setLocalResults] = useState<Record<string, string>>(results);

  const handleChange = (key: string, value: string) => {
    const newResults = { ...localResults, [key]: value };
    setLocalResults(newResults);
    if (onChange) {
      onChange(newResults);
    }
  };

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.key} className="flex items-center justify-between p-3 border rounded-lg">
          <span className="text-sm font-medium">{item.label}</span>
          {readOnly ? (
            <span className={`px-3 py-1 rounded text-xs font-medium ${
              localResults[item.key] === 'pass' ? 'bg-green-100 text-green-800' :
              localResults[item.key] === 'fail' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {localResults[item.key] || 'N/A'}
            </span>
          ) : (
            <select
              value={localResults[item.key] || ''}
              onChange={e => handleChange(item.key, e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="">Select...</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
            </select>
          )}
        </div>
      ))}
    </div>
  );
}

