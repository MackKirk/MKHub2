import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DOCUMENT_AUTO_FILL_TOKENS,
  type DocumentAutoFillTokenValue,
} from '@/lib/documentAutoFillTokens';

type TokenValuesResponse = {
  tokens: DocumentAutoFillTokenValue[];
};

export function useDocumentAutoFillTokens(
  projectId?: string | null,
  enabled = true,
  subjectUserId?: string | null,
) {
  const params = new URLSearchParams();
  if (projectId) params.set('project_id', projectId);
  if (subjectUserId) params.set('subject_user_id', subjectUserId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return useQuery({
    queryKey: ['document-creator-token-values', projectId ?? null, subjectUserId ?? null],
    queryFn: () => api<TokenValuesResponse>('GET', `/document-creator/token-values${qs}`),
    enabled,
    staleTime: 30_000,
    placeholderData: { tokens: DOCUMENT_AUTO_FILL_TOKENS.map((t) => ({ ...t, value: '' })) },
  });
}
