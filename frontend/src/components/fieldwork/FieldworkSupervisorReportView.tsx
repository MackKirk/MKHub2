import { useMemo, type ReactNode } from 'react';
import { withFileAccessToken } from '@/lib/api';
import {
  AppBadge,
  AppCard,
  uiBorders,
  uiCx,
  uiRadius,
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

/** Match DynamicSafetyForm status tiles so review reads like the filled form. */
const STATUS_TILE =
  'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-xl border-2 px-2 text-sm font-bold tabular-nums';

const PFNA = [
  { v: 'pass' as const, label: 'P', title: 'Pass', cls: 'bg-green-100 text-green-800 border-green-400' },
  { v: 'fail' as const, label: 'F', title: 'Fail', cls: 'bg-red-100 text-red-800 border-red-400' },
  { v: 'na' as const, label: 'NA', title: 'N/A', cls: 'bg-gray-100 text-gray-700 border-gray-300' },
];

const YNA = [
  { v: 'yes' as const, label: 'Y', title: 'Yes', cls: 'bg-green-100 text-green-800 border-green-400' },
  { v: 'no' as const, label: 'N', title: 'No', cls: 'bg-red-100 text-red-800 border-red-400' },
  { v: 'na' as const, label: 'NA', title: 'N/A', cls: 'bg-gray-100 text-gray-700 border-gray-300' },
];

const SCALE_1_5 = (
  [
    { v: '1', cls: 'bg-rose-50 text-rose-900 border-rose-400' },
    { v: '2', cls: 'bg-orange-50 text-orange-900 border-orange-400' },
    { v: '3', cls: 'bg-amber-50 text-amber-900 border-amber-400' },
    { v: '4', cls: 'bg-lime-50 text-lime-900 border-lime-400' },
    { v: '5', cls: 'bg-green-100 text-green-900 border-green-500' },
  ] as const
).map((x) => ({ ...x, label: x.v, title: x.v }));

const IDLE_TILE = 'bg-white text-gray-300 border-gray-200';

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

function formatPlainAnswer(field: SafetyFormField, value: unknown): string {
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

function StatusTiles({
  options,
  selected,
}: {
  options: { v: string; label: string; title: string; cls: string }[];
  selected: string;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5" role="group">
      {options.map((opt) => (
        <span
          key={opt.v}
          title={opt.title}
          className={uiCx(STATUS_TILE, selected === opt.v ? opt.cls : IDLE_TILE)}
        >
          {opt.label}
        </span>
      ))}
    </div>
  );
}

function AnswerDisplay({ field, value }: { field: SafetyFormField; value: unknown }): ReactNode {
  if (field.type === 'pass_fail_na') {
    const st = value === 'pass' || value === 'fail' || value === 'na' ? value : '';
    return <StatusTiles options={PFNA} selected={st} />;
  }
  if (field.type === 'yes_no_na') {
    const o = value && typeof value === 'object' && !Array.isArray(value) ? (value as { status?: string }) : {};
    const st = o.status === 'yes' || o.status === 'no' || o.status === 'na' ? o.status : '';
    return <StatusTiles options={YNA} selected={st} />;
  }
  if (field.type === 'scale_1_5') {
    const st =
      value === '1' || value === '2' || value === '3' || value === '4' || value === '5' ? String(value) : '';
    return <StatusTiles options={SCALE_1_5} selected={st} />;
  }
  if (field.type === 'pass_fail_total') {
    const o =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { pass?: number; fail?: number; na?: number })
        : {};
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5" aria-label="Pass, Fail, and NA counts">
        {PFNA.map((opt) => {
          const n = opt.v === 'pass' ? o.pass ?? 0 : opt.v === 'fail' ? o.fail ?? 0 : o.na ?? 0;
          return (
            <span key={opt.v} title={`${opt.title}: ${n}`} className={uiCx(STATUS_TILE, opt.cls)}>
              {n}
            </span>
          );
        })}
      </div>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <AppBadge variant={value === true ? 'success' : 'neutral'}>
        {value === true ? 'Yes' : 'No'}
      </AppBadge>
    );
  }

  const plain = formatPlainAnswer(field, value);
  if (!plain || plain === '—') {
    return <span className={uiTypography.helper}>—</span>;
  }
  return <AppBadge variant="neutral">{plain}</AppBadge>;
}

function isInlineAnswerType(type: SafetyFormField['type']): boolean {
  return (
    type === 'pass_fail_na' ||
    type === 'yes_no_na' ||
    type === 'scale_1_5' ||
    type === 'pass_fail_total' ||
    type === 'checkbox' ||
    type === 'dropdown_single' ||
    type === 'dropdown_multi' ||
    type === 'number' ||
    type === 'date' ||
    type === 'time' ||
    type === 'user_single' ||
    type === 'user_multi' ||
    type === 'equipment_single' ||
    type === 'equipment_multi' ||
    type === 'image_view' ||
    type === 'pdf_insert' ||
    type === 'pdf_view' ||
    type === 'gps'
  );
}

function Thumb({ fileId, alt }: { fileId: string; alt: string }) {
  return (
    <a
      href={withFileAccessToken(`/files/${encodeURIComponent(fileId)}`)}
      target="_blank"
      rel="noreferrer"
      className={uiCx('block shrink-0 overflow-hidden border bg-gray-50', uiBorders.subtle, uiRadius.control)}
    >
      <img
        src={withFileAccessToken(`/files/${encodeURIComponent(fileId)}/thumbnail?w=480`)}
        alt={alt}
        className="h-24 w-32 object-cover"
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
  /**
   * Per-item supervisor notes are reviewer-only.
   * Technicians never see them — denial feedback uses `review_note` at the top of the report.
   */
  showSupervisorNotes?: boolean;
};

export function FieldworkSupervisorReportView({
  record,
  supervisorComments,
  onSupervisorCommentChange,
  canEditSupervisorComments = false,
  showSupervisorNotes = false,
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
        className={uiCx('overflow-hidden border bg-white', uiBorders.subtle, uiRadius.card)}
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
          <p className={uiCx(uiTypography.body, 'font-medium text-gray-900 whitespace-pre-wrap')}>
            {caption || 'No description'}
          </p>
          {notes ? <p className={uiCx(uiTypography.helper, 'whitespace-pre-wrap')}>{notes}</p> : null}
        </figcaption>
      </figure>
    );
  };

  return (
    <div className={uiCx(uiSpacing.pageStack)}>
      {sections.map((sec) => (
        <AppCard key={sec.id} title={sec.title || 'Section'} bodyClassName="!p-0">
          <ul>
            {sec.fields.map((field, fieldIndex) => {
              const tech = getTechNote(field, payload);
              const supervisorValue =
                supervisorComments[field.key] ?? getSupervisorText(field.key, payload);
              const hasTech = !!tech.text.trim() || tech.imageIds.length > 0;
              const plain = formatPlainAnswer(field, payload[field.key]);
              const inline = isInlineAnswerType(field.type);

              return (
                <li
                  key={field.id}
                  className={uiCx(
                    uiSpacing.cardPadding,
                    'space-y-2',
                    fieldIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/80',
                  )}
                >
                  <p className="text-sm font-semibold text-gray-600">{field.label || field.key}</p>
                  {inline ? (
                    <AnswerDisplay field={field} value={payload[field.key]} />
                  ) : (
                    <p className={uiCx(uiTypography.body, 'whitespace-pre-wrap text-gray-900')}>
                      {plain === '—' ? <span className={uiTypography.helper}>—</span> : plain}
                    </p>
                  )}

                  {hasTech ? (
                    <div
                      className={uiCx(
                        'rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5',
                        uiRadius.control
                      )}
                    >
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

                  {showSupervisorNotes ? (
                    <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5">
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
                  ) : null}
                </li>
              );
            })}
          </ul>
        </AppCard>
      ))}

      {photos.length > 0 ? (
        <AppCard title="Photos with descriptions" bodyClassName="space-y-4">
          {photosByEntry.obs.length ? (
            <div className="space-y-2">
              <p className={uiCx(uiTypography.helper, 'font-semibold text-gray-700')}>
                Observed conditions
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photosByEntry.obs.map(renderPhotoCard)}
              </div>
            </div>
          ) : null}
          {photosByEntry.work.length ? (
            <div className="space-y-2">
              <p className={uiCx(uiTypography.helper, 'font-semibold text-gray-700')}>Work performed</p>
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
        </AppCard>
      ) : null}

      {(record.final_comments || '').trim() ? (
        <AppCard title="Additional comments">
          <p className={uiCx(uiTypography.body, 'whitespace-pre-wrap text-gray-900')}>
            {record.final_comments}
          </p>
        </AppCard>
      ) : null}
    </div>
  );
}

export { SUPERVISOR_COMMENTS_KEY };
