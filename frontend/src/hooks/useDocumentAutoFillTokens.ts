import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DOCUMENT_AUTO_FILL_TOKENS,
  type DocumentAutoFillTokenValue,
} from '@/lib/documentAutoFillTokens';

type TokenValuesResponse = {
  tokens: DocumentAutoFillTokenValue[];
};

export function useDocumentAutoFillTokens(projectId?: string | null, enabled = true) {
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  return useQuery({
    queryKey: ['document-creator-token-values', projectId ?? null],
    queryFn: () => api<TokenValuesResponse>('GET', `/document-creator/token-values${qs}`),
    enabled,
    staleTime: 30_000,
    placeholderData: { tokens: DOCUMENT_AUTO_FILL_TOKENS.map((t) => ({ ...t, value: '' })) },
  });
}
