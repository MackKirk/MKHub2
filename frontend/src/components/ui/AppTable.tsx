import type { ReactNode } from 'react';
import { uiBorders, uiColors, uiCx, uiRadius, uiTypography } from './tokens';

type AppTableProps = {
  columns: string[];
  rows: ReactNode[][];
  emptyState?: ReactNode;
  className?: string;
};

export function AppTable({ columns, rows, emptyState = 'No data available.', className }: AppTableProps) {
  return (
    <div className={uiCx('overflow-hidden', uiRadius.card, uiBorders.subtle, className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className={uiColors.surfaceSubtle}>
            <tr>
              {columns.map((column) => (
                <th key={column} className={uiCx('whitespace-nowrap p-2.5 text-left', uiTypography.controlLabel)}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={uiColors.surface}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-6 text-center text-xs text-gray-500">
                  {emptyState}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-gray-200 hover:bg-gray-50">
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="whitespace-nowrap p-2.5 text-xs text-gray-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
