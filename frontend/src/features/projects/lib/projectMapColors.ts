/** Pin colors aligned with project status semantics. */
export function getProjectMapPinColor(status?: string | null): string {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return '#6b7280';
  if (s.includes('conflict')) return '#7c3aed';
  if (s.includes('hold') || s.includes('pending')) return '#d97706';
  if (s.includes('cancel') || s.includes('refused') || s.includes('lost')) return '#dc2626';
  if (s.includes('finish') || s.includes('complete') || s.includes('won') || s.includes('awarded')) {
    return '#16a34a';
  }
  if (s.includes('progress') || s.includes('active') || s.includes('ongoing')) return '#2563eb';
  return '#6b7280';
}

export const PROJECT_MAP_CLUSTER_COLOR = '#dc2626';
