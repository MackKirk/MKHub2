import { api } from '@/lib/api';

export const SHIFT_NOTE_MAX = 2000;

export type ShiftNoteTemplate = {
  id: string;
  scope: 'project' | 'global' | string;
  project_id?: string | null;
  project_name?: string | null;
  body: string;
  updated_at?: string | null;
};

export type ShiftNoteLibrary = {
  project: ShiftNoteTemplate[];
  global: ShiftNoteTemplate[];
};

export function appendShiftNote(current: string, addition: string): { value: string; overflow: boolean } {
  const chunk = addition.trim();
  if (!chunk) return { value: current, overflow: false };
  const base = current.replace(/\s+$/, '');
  const next = base ? `${base}\n${chunk}` : chunk;
  if (next.length > SHIFT_NOTE_MAX) return { value: current, overflow: true };
  return { value: next, overflow: false };
}

export async function persistShiftNoteLibrary(opts: {
  projectId?: string | null;
  body: string;
  saveOnProject?: boolean;
  saveGlobal?: boolean;
}) {
  const body = opts.body.trim();
  if (!body || (!opts.saveOnProject && !opts.saveGlobal)) return;
  await api('POST', '/dispatch/shift-note-templates', {
    project_id: opts.projectId || null,
    body,
    save_on_project: !!opts.saveOnProject,
    save_global: !!opts.saveGlobal,
  });
}
