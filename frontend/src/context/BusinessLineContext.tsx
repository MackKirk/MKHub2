import { createContext, useContext } from 'react';
import { BUSINESS_LINE_CONSTRUCTION } from '@/lib/businessLine';

const BusinessLineContext = createContext<string>(BUSINESS_LINE_CONSTRUCTION);

export function BusinessLineProvider({ line, children }: { line: string; children: React.ReactNode }) {
  return <BusinessLineContext.Provider value={line}>{children}</BusinessLineContext.Provider>;
}

export function useBusinessLine() {
  return useContext(BusinessLineContext);
}
