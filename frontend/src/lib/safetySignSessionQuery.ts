/** Append sign session query params so APIs accept pending signers without `business:projects:safety:read`. */
export type SafetySignSession = { projectId: string; inspectionId: string };

export function withSignSessionQuery(
  path: string,
  signSession: SafetySignSession | null | undefined
): string {
  if (!signSession) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}sign_project_id=${encodeURIComponent(signSession.projectId)}&sign_inspection_id=${encodeURIComponent(signSession.inspectionId)}`;
}
