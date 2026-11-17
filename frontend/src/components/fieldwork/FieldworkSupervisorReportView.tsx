import { useMemo } from 'react';
import { withFileAccessToken } from '@/lib/api';
import {
  AppCard,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  isFieldVisible,
  normalizeDefinition,
  type SafetyFormDefinition,
  type SafetyFormField,
} from '@/types/safetyFormTemplate';
import type { FieldworkPhotoObservation, FieldworkRecord } from '@/types/fieldwork';

const SIDE_COMMENTS_KEY = '_fieldComments';
const SUPERVISOR_COMMENTS_KEY = '_supervisorComments';

type SideNote = { text: string; imageIds: string[] };

function parseSideNote(raw: unknown): SideNote {
  if (typeof raw === 'string') return { text: raw, imageIds: [] };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text : typeof o.comments === 'string' ? o.comments : '';
    const arr = o.imageIds ?? o.images ?? o.commentImageIds;
    const imageIds = Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === 'string' && !!x.trim())
      : [];
    return { text, imageIds };
  }
  return { text: '', imageIds: [] };
}

function getTechNote(field: SafetyFormField, payload: Record<string, unknown>): SideNote {
  if (field.type === 'yes_no_na') {
    const v = payload[field.key];
    return parseSideNote(v);
  }
  const bag = payload[SIDE_COMMENTS_KEY];
  const raw =
    bag && typeof bag === 'object' && !Array.isArray(bag)
      ? (bag as Record<string, unknown>)[field.key]
      : undefined;
  return parseSideNote(raw);
}

function getSupervisorText(fieldKey: string, payload: Record<string, unknown>): string {
  const bag = payload[SUPERVISOR_COMMENTS_KEY];
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return '';
  const raw = (bag as Record<string, unknown>)[fieldKey];
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const t = (raw as { text?: unknown }).text;
    return typeof t === 'string' ? t : '';
  }
  return '';
}

function formatAnswer(field: SafetyFormField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  switch (field.type) {
    case 'text_info':
      return '';
    case 'checkbox':
      return value === true ? 'Yes' : 'No';
    case 'pass_fail_na':
      if (value === 'pass') return 'Pass';
      if (value === 'fail') return 'Fail';
      if (value === 'na') return 'N/A';
      return String(value);
    case 'yes_no_na': {
      const o = value && typeof value === 'object' && !Array.isArray(value) ? (value as { status?: string }) : {};
      if (o.status === 'yes') return 'Yes';
      if (o.status === 'no') return 'No';
      if (o.status === 'na') return 'N/A';
      return '—';
    }
    case 'scale_1_5':
      return String(value);
    case 'dropdown_multi':
    case 'user_multi':
    case 'equipment_multi':
      return Array.isArray(value) ? value.map(String).filter(Boolean).join(', ') || '—' : String(value);
    case 'pass_fail_total': {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const o = value as { pass?: number; fail?: number; na?: number };
        return `Pass ${o.pass ?? 0} · Fail ${o.fail ?? 0} · N/A ${o.na ?? 0}`;
      }
      return String(value);
    }
    case 'image_view':
    case 'pdf_insert': {
      if (typeof value === 'string') return value.trim() ? 'Attachment on file' : '—';
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const ids = (value as { file_object_ids?: string[] }).file_object_ids;
        const n = Array.isArray(ids) ? ids.length : 0;
        return n ? `${n} file${n === 1 ? '' : 's'}` : '—';
      }
      return '—';
    }
    case 'gps': {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const o = value as { lat?: number; lng?: number };
        if (typeof o.lat === 'number' && typeof o.lng === 'number') {
          return `${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}`;
        }
      }
      return '—';
    }
    default:
      if (typeof value === 'string') return value.trim() || '—';
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return '—';
  }
}

function Thumb({ fileId, alt }: { fileId: string; alt: string }) {
  return (
    <a
      href={withFileAccessToken(`/files/${encodeURIComponent(fileId)}`)}
      target="_blank"
      rel="noreferrer"
      className="block shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
    >
      <img
        src={withFileAccessToken(`/files/${encodeURIComponent(fileId)}/thumbnail?w=480`)}
        alt={alt}
        className="h-28 w-36 object-cover"
        loading="lazy"
      />
    </a>
  );
}

type Props = {
  record: FieldworkRecord;
  supervisorComments: Record<string, string>;
  onSupervisorCommentChange?: (fieldKey: string, text: string) => void;
  canEditSupervisorComments?: boolean;
};

export function FieldworkSupervisorReportView({
  record,
  supervisorComments,
  onSupervisorCommentChange,
  canEditSupervisorComments = false,
}: Props) {
  const definition = useMemo(
    () => normalizeDefinition((record.form_definition_snapshot || { sections: [] }) as SafetyFormDefinition),
    [record.form_definition_snapshot]
  );
  const payload = (record.form_payload || {}) as Record<string, unknown>;
  const photos = Array.isArray(record.photos) ? record.photos : [];

  const sections = useMemo(() => {
    return [...(definition.sections || [])]
      .sort((a, b) => a.order - b.order)
      .map((sec) => ({
        ...sec,
        fields: [...(sec.fields || [])]
          .sort((a, b) => a.order - b.order)
          .filter((f) => f.type !== 'text_info' && isFieldVisible(f, payload)),
      }))
      .filter((sec) => sec.fields.length > 0);
  }, [definition.sections, payload]);

  const photosByEntry = useMemo(() => {
    const obs: FieldworkPhotoObservation[] = [];
    const work: FieldworkPhotoObservation[] = [];
    const other: FieldworkPhotoObservation[] = [];
    for (const p of [...photos].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))) {
      const t = (p.entry_type || '').toLowerCase();
      if (t === 'observation') obs.push(p);
      else if (t === 'work_performed') work.push(p);
      else other.push(p);
    }
    return { obs, work, other };
  }, [photos]);

  const renderPhotoCard = (p: FieldworkPhotoObservation) => {
    const caption = (p.phrase_text_snapshot || '').trim();
    const notes = (p.extra_notes || '').trim();
    return (
      <figure
        key={p.id}
        className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
      >
        <a
          href={withFileAccessToken(`/files/${encodeURIComponent(p.file_object_id)}`)}
          target="_blank"
          rel="noreferrer"
          className="block bg-gray-100"
        >
          <img
            src={withFileAccessToken(`/files/${encodeURIComponent(p.file_object_id)}/thumbnail?w=900`)}
            alt={caption || 'Field photo'}
            className="aspect-[4/3] w-full object-cover"
            loading="lazy"
          />
        </a>
        <figcaption className="space-y-1 p-3">
          <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">
            {caption || 'No description'}
          </p>
          {notes ? <p className="text-xs text-gray-600 whitespace-pre-wrap">{notes}</p> : null}
        </figcaption>
      </figure>
    );
  };

  return (
    <div className={uiCx(uiSpacing.pageStack)}>
      {sections.map((sec) => (
        <section key={sec.id} className="space-y-3">
          <h3 className={uiTypography.sectionTitle}>{sec.title || 'Section'}</h3>
          <div className="space-y-3">
            {sec.fields.map((field) => {
              const answer = formatAnswer(field, payload[field.key]);
              const tech = getTechNote(field, payload);
              const supervisorValue =
                supervisorComments[field.key] ?? getSupervisorText(field.key, payload);
              const hasTech = !!tech.text.trim() || tech.imageIds.length > 0;
              return (
                <AppCard key={field.id} bodyClassName="!p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Item
                      </p>
                      <h4 className="text-base font-semibold text-gray-900">{field.label || field.key}</h4>
                    </div>
                    {answer && field.type !== 'pass_fail_total' ? (
                      <span className="inline-flex max-w-full rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
                        {answer}
                      </span>
                    ) : answer ? (
                      <span className="text-sm font-medium text-gray-700">{answer}</span>
                    ) : null}
                  </div>

                  {hasTech ? (
                    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                        Technician note
                      </p>
                      {tech.text.trim() ? (
                        <p className="mt-1 text-sm text-blue-950 whitespace-pre-wrap">{tech.text}</p>
                      ) : null}
                      {tech.imageIds.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {tech.imageIds.map((id) => (
                            <Thumb key={id} fileId={id} alt="Technician photo" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Supervisor note
                    </p>
                    {canEditSupervisorComments && onSupervisorCommentChange ? (
                      <textarea
                        className="mt-2 w-full min-h-[72px] rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        placeholder="Add a note about this item…"
                        value={supervisorValue}
                        onChange={(e) => onSupervisorCommentChange(field.key, e.target.value)}
                      />
                    ) : supervisorValue.trim() ? (
                      <p className="mt-1 text-sm text-amber-950 whitespace-pre-wrap">{supervisorValue}</p>
                    ) : (
                      <p className="mt-1 text-sm text-amber-800/70">No supervisor note.</p>
                    )}
                  </div>
                </AppCard>
              );
            })}
          </div>
        </section>
      ))}

      {photos.length > 0 ? (
        <section className="space-y-4">
          <h3 className={uiTypography.sectionTitle}>Photos with descriptions</h3>
          {photosByEntry.obs.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Observed conditions</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photosByEntry.obs.map(renderPhotoCard)}
              </div>
            </div>
          ) : null}
          {photosByEntry.work.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Work performed</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photosByEntry.work.map(renderPhotoCard)}
              </div>
            </div>
          ) : null}
          {photosByEntry.other.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photosByEntry.other.map(renderPhotoCard)}
            </div>
          ) : null}
        </section>
      ) : null}

      {(record.final_comments || '').trim() ? (
        <AppCard bodyClassName="!p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Additional comments</p>
          <p className="mt-2 text-sm text-gray-900 whitespace-pre-wrap">{record.final_comments}</p>
        </AppCard>
      ) : null}
    </div>
  );
}

export { SUPERVISOR_COMMENTS_KEY };
