import { useMemo, useEffect, useCallback, useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import SafetySignaturePad from '@/components/SafetySignaturePad';
import SafetyDynamicFileField from '@/components/SafetyDynamicFileField';
import SafetyPdfViewReferenceField from '@/components/SafetyPdfViewReferenceField';
import { SafetyFieldQuestionLabel as FieldQuestionLabel } from '@/components/SafetyFieldQuestionLabel';
import { SafetyFieldCommentPanel } from '@/components/SafetyFieldCommentPanel';
import SafetyDropdownMulti from '@/components/SafetyDropdownMulti';
import SafetySearchableSingle from '@/components/SafetySearchableSingle';
import {
  SafetyHierarchicalCustomListMulti,
  SafetyHierarchicalCustomListSingle,
} from '@/components/SafetyHierarchicalCustomListSelect';
import {
  collectPassFailNaKeysOrdered,
  computePftAggregate,
  isFieldVisible,
  type SafetyFormDefinition,
  type SafetyFormField,
  type SafetyFormSection,
} from '@/types/safetyFormTemplate';
import { type FormCustomListTreeNode, treeIsHierarchical } from '@/utils/customListTree';

type EmployeeRow = { id: string; name: string; username?: string };
type FleetPick = { id: string; label: string };

type FormCustomListRuntimeDetail = {
  items: FormCustomListTreeNode[];
  leaf_options: { value: string; label: string }[];
};

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

/** Same outer box as `CommentIconOnly` (2.75rem) so P/F/NA and Y/N/NA tiles match the comment button. */
const STATUS_CHOICE_BTN =
  'w-[2.75rem] h-[2.75rem] min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50';

const FILE_CAT = 'safety-form';

/** Field question title — gray, natural case (matches template text). */
const FIELD_QUESTION_CLASS = 'block text-sm font-medium text-gray-600 mb-2';

/** Inline question text (e.g. checkbox row). */
const FIELD_QUESTION_INLINE = 'text-sm font-medium text-gray-600';

/** Shared control chrome (tile-adjacent: rounded-xl, border-2). */
const CONTROL_BASE =
  'min-h-[2.75rem] px-3 py-2 border-2 border-gray-200 rounded-xl text-sm text-gray-900 bg-white disabled:bg-gray-50 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red';

const CONTROL_INPUT_FULL = `w-full ${CONTROL_BASE}`;
const CONTROL_INPUT_FLEX = `flex-1 min-w-0 ${CONTROL_BASE}`;
const CONTROL_TEXTAREA = `flex-1 min-w-0 min-h-[6rem] w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm text-gray-900 bg-white disabled:bg-gray-50 placeholder:text-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red`;
const CONTROL_SELECT_FLEX = `flex-1 min-w-0 min-h-[2.75rem] px-3 py-2 border-2 border-gray-200 rounded-xl text-sm text-gray-900 bg-white cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red`;

/** Sidecar for optional per-field notes (`_fieldComments`). yes_no_na uses { comments, commentImageIds } on the field value. */
const SIDE_COMMENT_PAYLOAD_KEY = '_fieldComments';

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

type SideCommentEntry = { text: string; imageIds: string[] };

function parseSideCommentRaw(raw: unknown): SideCommentEntry {
  if (typeof raw === 'string') return { text: raw, imageIds: [] };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const t = typeof o.text === 'string' ? o.text : '';
    const arr = o.imageIds ?? o.images;
    const imageIds = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    return { text: t, imageIds };
  }
  return { text: '', imageIds: [] };
}

function serializeSideCommentEntry(entry: SideCommentEntry): unknown | undefined {
  const text = entry.text.trim();
  const ids = [...new Set(entry.imageIds.filter(Boolean))];
  if (!text && ids.length === 0) return undefined;
  if (ids.length === 0) return text;
  return { text, imageIds: ids };
}

function getRawSideCommentsBucket(p: Record<string, unknown>): Record<string, unknown> {
  const v = p[SIDE_COMMENT_PAYLOAD_KEY];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return { ...(v as Record<string, unknown>) };
}

function getSideCommentForField(p: Record<string, unknown>, fieldKey: string): SideCommentEntry {
  const bucket = getRawSideCommentsBucket(p);
  return parseSideCommentRaw(bucket[fieldKey]);
}

function mergeSideComment(
  prev: Record<string, unknown>,
  fieldKey: string,
  entry: SideCommentEntry
): Record<string, unknown> {
  const bucket = getRawSideCommentsBucket(prev);
  const serialized = serializeSideCommentEntry(entry);
  if (serialized === undefined) delete bucket[fieldKey];
  else bucket[fieldKey] = serialized;
  const out = { ...prev };
  if (Object.keys(bucket).length === 0) delete out[SIDE_COMMENT_PAYLOAD_KEY];
  else out[SIDE_COMMENT_PAYLOAD_KEY] = bucket;
  return out;
}

function CommentIconOnly({
  expanded,
  hasComment,
  onToggle,
  className,
}: {
  expanded: boolean;
  hasComment: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={expanded ? 'Close comment' : hasComment ? 'Edit comment' : 'Add comment'}
      aria-expanded={expanded}
      aria-label={expanded ? 'Close comment' : hasComment ? 'Edit comment' : 'Add comment'}
      onClick={onToggle}
      className={`min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center rounded-xl border-2 transition-all shrink-0 ${
        expanded || hasComment
          ? 'border-blue-400 bg-blue-50 text-blue-700'
          : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'
      } ${className ?? ''}`}
    >
      <ChatBubbleIcon className="w-5 h-5" />
    </button>
  );
}

function sortedSections(def: SafetyFormDefinition): SafetyFormSection[] {
  return [...(def.sections || [])].sort((a, b) => a.order - b.order).map((s) => ({
    ...s,
    fields: [...(s.fields || [])].sort((a, b) => a.order - b.order),
  }));
}

function getStr(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  return typeof v === 'string' ? v : '';
}

function getStrArr(p: Record<string, unknown>, k: string): string[] {
  const v = p[k];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function getYn(p: Record<string, unknown>, k: string): {
  status: 'yes' | 'no' | 'na' | '';
  comments: string;
  commentImageIds: string[];
} {
  const v = p[k];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { status: '', comments: '', commentImageIds: [] };
  const o = v as { status?: string; comments?: string; commentImageIds?: unknown };
  const s = o.status;
  const status = s === 'yes' || s === 'no' || s === 'na' ? s : '';
  const imgs = o.commentImageIds;
  const commentImageIds = Array.isArray(imgs) ? imgs.filter((x): x is string => typeof x === 'string') : [];
  return { status, comments: typeof o.comments === 'string' ? o.comments : '', commentImageIds };
}

function getPft(p: Record<string, unknown>, k: string): { pass: number; fail: number; na: number } {
  const v = p[k];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { pass: 0, fail: 0, na: 0 };
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && !Number.isNaN(x) ? x : parseInt(String(x), 10) || 0);
  return { pass: n(o.pass), fail: n(o.fail), na: n(o.na) };
}

function getGps(p: Record<string, unknown>, k: string): { lat: string; lng: string } {
  const v = p[k];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { lat: '', lng: '' };
  const o = v as { lat?: unknown; lng?: unknown };
  return {
    lat: typeof o.lat === 'number' ? String(o.lat) : typeof o.lat === 'string' ? o.lat : '',
    lng: typeof o.lng === 'number' ? String(o.lng) : typeof o.lng === 'string' ? o.lng : '',
  };
}

type Props = {
  definition: SafetyFormDefinition;
  formPayload: Record<string, unknown>;
  setFormPayload: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  canWrite: boolean;
  readOnly?: boolean;
  /** Required for file uploads / signature */
  projectId?: string;
};

function PassFailTotalAggregateSync({
  fieldKey,
  sourceKeys,
  formPayload,
  setFormPayload,
}: {
  fieldKey: string;
  sourceKeys: string[];
  formPayload: Record<string, unknown>;
  setFormPayload: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const agg = useMemo(() => computePftAggregate(formPayload, sourceKeys), [formPayload, sourceKeys]);
  useEffect(() => {
    setFormPayload((prev) => {
      const cur = prev[fieldKey];
      const same =
        cur &&
        typeof cur === 'object' &&
        !Array.isArray(cur) &&
        (cur as { pass?: number }).pass === agg.pass &&
        (cur as { fail?: number }).fail === agg.fail &&
        (cur as { na?: number }).na === agg.na;
      if (same) return prev;
      return { ...prev, [fieldKey]: { pass: agg.pass, fail: agg.fail, na: agg.na } };
    });
  }, [agg.pass, agg.fail, agg.na, fieldKey, setFormPayload]);
  return null;
}

export default function DynamicSafetyForm({
  definition,
  formPayload,
  setFormPayload,
  canWrite,
  readOnly,
  projectId = '',
}: Props) {
  const disabled = !canWrite || readOnly;
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const sections = useMemo(() => sortedSections(definition), [definition]);

  const allPassFailNaKeys = useMemo(() => collectPassFailNaKeysOrdered(definition), [definition]);

  const toggleCommentOpen = useCallback((fieldId: string) => {
    setCommentOpen((p) => ({ ...p, [fieldId]: !p[fieldId] }));
  }, []);

  const updateSideComment = useCallback(
    (fieldKey: string, patch: Partial<SideCommentEntry>) => {
      setFormPayload((prev) => {
        const cur = getSideCommentForField(prev, fieldKey);
        return mergeSideComment(prev, fieldKey, { ...cur, ...patch });
      });
    },
    [setFormPayload]
  );

  const setYnCommentOnly = useCallback(
    (fieldKey: string, text: string) => {
      setFormPayload((prev) => {
        const yn = getYn(prev, fieldKey);
        return { ...prev, [fieldKey]: { ...yn, comments: text } };
      });
    },
    [setFormPayload]
  );

  const setYnCommentImageIds = useCallback(
    (fieldKey: string, commentImageIds: string[]) => {
      setFormPayload((prev) => {
        const yn = getYn(prev, fieldKey);
        return { ...prev, [fieldKey]: { ...yn, commentImageIds } };
      });
    },
    [setFormPayload]
  );

  const needEmployees = useMemo(
    () => sections.some((s) => s.fields.some((f) => isFieldVisible(f, formPayload) && (f.type === 'user_single' || f.type === 'user_multi'))),
    [sections, formPayload]
  );

  const needFleet = useMemo(
    () =>
      sections.some(
        (s) => s.fields.some((f) => isFieldVisible(f, formPayload) && (f.type === 'equipment_single' || f.type === 'equipment_multi'))
      ),
    [sections, formPayload]
  );

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-dynamic-safety-form'],
    queryFn: () => api<EmployeeRow[]>('GET', '/employees'),
    enabled: needEmployees,
  });

  const { data: fleetAssets = [] } = useQuery({
    queryKey: ['fleet-assets-safety-form'],
    queryFn: () => api<FleetPick[]>('GET', '/form-templates/support/fleet-assets?limit=200'),
    enabled: needFleet,
  });

  const customListIds = useMemo(() => {
    const s = new Set<string>();
    for (const sec of definition.sections) {
      for (const f of sec.fields) {
        if (
          (f.type === 'dropdown_single' || f.type === 'dropdown_multi') &&
          f.optionsSource?.type === 'custom_list' &&
          f.optionsSource.customListId
        ) {
          s.add(f.optionsSource.customListId);
        }
      }
    }
    return [...s];
  }, [definition]);

  const customListQueries = useQueries({
    queries: customListIds.map((id) => ({
      queryKey: ['formCustomList', id, 'runtime'] as const,
      queryFn: () =>
        api<FormCustomListRuntimeDetail>('GET', `/form-custom-lists/${encodeURIComponent(id)}?for_runtime=true`),
      staleTime: 60_000,
    })),
  });

  const customListRuntimeByListId = useMemo(() => {
    const m = new Map<string, FormCustomListRuntimeDetail>();
    customListIds.forEach((id, i) => {
      const d = customListQueries[i]?.data;
      if (d && Array.isArray(d.items) && Array.isArray(d.leaf_options)) m.set(id, d);
    });
    return m;
  }, [customListIds, customListQueries]);

  const customListLoadingByListId = useMemo(() => {
    const m = new Map<string, boolean>();
    customListIds.forEach((id, i) => {
      const q = customListQueries[i];
      m.set(id, Boolean(q?.isLoading || q?.isFetching));
    });
    return m;
  }, [customListIds, customListQueries]);

  const setKey = (key: string, val: unknown) => {
    setFormPayload((prev) => ({ ...prev, [key]: val }));
  };

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!projectId) return null;
      const ct = file.type || 'application/octet-stream';
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('original_name', file.name);
        form.append('content_type', ct);
        form.append('project_id', projectId);
        form.append('client_id', '');
        form.append('employee_id', '');
        form.append('category_id', FILE_CAT);
        const res = await api<{ id: string }>('POST', '/files/upload-proxy', form);
        await api(
          'POST',
          `/projects/${encodeURIComponent(projectId)}/files?file_object_id=${encodeURIComponent(res.id)}&category=${encodeURIComponent(FILE_CAT)}&original_name=${encodeURIComponent(file.name)}`
        );
        return res.id;
      } catch {
        return null;
      }
    },
    [projectId]
  );

  const renderField = (field: SafetyFormField, _zebra: boolean, _idx: number) => {
    if (!isFieldVisible(field, formPayload)) return null;
    const rowBg = '';
    const k = field.key;
    const commentExpanded = commentOpen[field.id] === true;
    const sideComment = getSideCommentForField(formPayload, k);
    const sideCommentFilled =
      sideComment.text.trim().length > 0 || sideComment.imageIds.length > 0;
    const toggleFieldComment = () => toggleCommentOpen(field.id);

    if (field.type === 'pass_fail_total') {
      const pft = getPft(formPayload, k);
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <PassFailTotalAggregateSync
            fieldKey={k}
            sourceKeys={allPassFailNaKeys}
            formPayload={formPayload}
            setFormPayload={setFormPayload}
          />
          <div className="flex flex-wrap items-center gap-4">
            <FieldQuestionLabel field={field} className={`flex-1 min-w-0 ${FIELD_QUESTION_INLINE}`} />
            <div className="flex gap-2 shrink-0 items-center flex-wrap" aria-label="Pass, Fail, and NA counts">
              {PFNA.map((opt) => {
                const n = opt.v === 'pass' ? pft.pass : opt.v === 'fail' ? pft.fail : pft.na;
                return (
                  <span
                    key={opt.v}
                    title={`${opt.title}: ${n}`}
                    className={`${STATUS_CHOICE_BTN} ${opt.cls} cursor-default tabular-nums min-w-[2.75rem] px-1`}
                  >
                    {n}
                  </span>
                );
              })}
            </div>
            {!disabled && (
              <div className="shrink-0 ml-auto">
                <CommentIconOnly
                  expanded={commentExpanded}
                  hasComment={sideCommentFilled}
                  onToggle={toggleFieldComment}
                />
              </div>
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'text_info') {
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{field.label}</p>
        </div>
      );
    }

    if (field.type === 'short_text') {
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={getStr(formPayload, k)}
              onChange={(e) => setKey(k, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder}
              className={CONTROL_INPUT_FLEX}
            />
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'long_text') {
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-start gap-2">
            <textarea
              value={getStr(formPayload, k)}
              onChange={(e) => setKey(k, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder}
              rows={4}
              className={CONTROL_TEXTAREA}
            />
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
                className="self-start"
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'number') {
      const raw = formPayload[k];
      const num = typeof raw === 'number' ? raw : raw === '' || raw == null ? '' : String(raw);
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={num === '' ? '' : String(num)}
              onChange={(e) => {
                const t = e.target.value;
                setKey(k, t === '' ? '' : Number(t));
              }}
              disabled={disabled}
              placeholder={field.placeholder}
              className={CONTROL_INPUT_FLEX}
            />
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'date') {
      const v = getStr(formPayload, k);
      const iso = v.includes('T') ? v.slice(0, 10) : v;
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 rounded-xl border-2 border-gray-200 bg-white px-2 py-0.5 focus-within:ring-2 focus-within:ring-brand-red/20 focus-within:border-brand-red">
              <input
                type="date"
                value={iso}
                onChange={(e) => setKey(k, e.target.value)}
                disabled={disabled}
                className="w-full min-h-[2.5rem] bg-transparent text-sm text-gray-900 disabled:opacity-60 focus:outline-none"
              />
            </div>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'time') {
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 rounded-xl border-2 border-gray-200 bg-white px-2 py-0.5 focus-within:ring-2 focus-within:ring-brand-red/20 focus-within:border-brand-red">
              <input
                type="time"
                value={getStr(formPayload, k)}
                onChange={(e) => setKey(k, e.target.value)}
                disabled={disabled}
                className="w-full min-h-[2.5rem] bg-transparent text-sm text-gray-900 disabled:opacity-60 focus:outline-none"
              />
            </div>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'checkbox') {
      const v = formPayload[k] === true;
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              className={`inline-flex items-center gap-3 min-w-0 flex-1 cursor-pointer rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 hover:border-gray-300 transition-colors ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={v}
                disabled={disabled}
                onChange={(e) => setKey(k, e.target.checked)}
                className="h-5 w-5 shrink-0 rounded-md border-2 border-gray-300 text-red-600 focus:ring-2 focus:ring-brand-red/30 focus:ring-offset-0"
              />
              <FieldQuestionLabel
                as="span"
                field={field}
                className={`${FIELD_QUESTION_INLINE} text-left`}
              />
            </label>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'dropdown_single') {
      const listId = field.optionsSource?.type === 'custom_list' ? field.optionsSource.customListId : null;
      const runtime = listId ? customListRuntimeByListId.get(listId) : undefined;
      const leafRows = runtime?.leaf_options?.length ? runtime.leaf_options : null;
      const treeItems = runtime?.items ?? [];
      const listLoading = Boolean(listId && customListLoadingByListId.get(listId));
      const hierarchical = Boolean(listId && runtime && treeIsHierarchical(treeItems));
      const opts: { value: string; label: string }[] =
        leafRows && leafRows.length > 0
          ? leafRows
          : field.options?.length
            ? [...field.options]
                .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                .map((o) => ({ value: o, label: o }))
            : [];
      const val = getStr(formPayload, k);
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            {listId && listLoading ? (
              <div className={`${CONTROL_SELECT_FLEX} flex items-center text-sm text-gray-500 bg-gray-50`}>
                Loading options…
              </div>
            ) : hierarchical && runtime ? (
              <div className="flex-1 min-w-0">
                <SafetyHierarchicalCustomListSingle
                  hideLabel
                  label={field.label}
                  items={treeItems}
                  leafOptions={runtime.leaf_options}
                  value={val}
                  disabled={disabled}
                  onChange={(v) => setKey(k, v)}
                />
              </div>
            ) : (
              <select
                value={val}
                onChange={(e) => setKey(k, e.target.value)}
                disabled={disabled}
                className={CONTROL_SELECT_FLEX}
              >
                <option value="">Select One</option>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'dropdown_multi') {
      const listId = field.optionsSource?.type === 'custom_list' ? field.optionsSource.customListId : null;
      const runtime = listId ? customListRuntimeByListId.get(listId) : undefined;
      const leafRows = runtime?.leaf_options?.length ? runtime.leaf_options : null;
      const treeItems = runtime?.items ?? [];
      const listLoading = Boolean(listId && customListLoadingByListId.get(listId));
      const hierarchical = Boolean(listId && runtime && treeIsHierarchical(treeItems));
      const useCustom = Boolean(leafRows && leafRows.length > 0);
      const legacyOpts = field.options?.length
        ? [...field.options].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        : [];
      const sel = getStrArr(formPayload, k);
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              {listId && listLoading ? (
                <div className="min-h-[2.75rem] px-3 py-2 border-2 border-gray-200 rounded-xl text-sm text-gray-500 bg-gray-50 flex items-center">
                  Loading options…
                </div>
              ) : hierarchical && runtime ? (
                <SafetyHierarchicalCustomListMulti
                  hideLabel
                  label={field.label}
                  items={treeItems}
                  leafOptions={runtime.leaf_options}
                  value={sel}
                  disabled={disabled}
                  onChange={(next) => setKey(k, next)}
                />
              ) : (
                <SafetyDropdownMulti
                  hideLabel
                  rows={useCustom ? leafRows! : undefined}
                  options={useCustom ? undefined : legacyOpts}
                  preserveOrder={useCustom}
                  value={sel}
                  disabled={disabled}
                  onChange={(next) => setKey(k, next)}
                  label={field.label}
                />
              )}
            </div>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'pass_fail_na') {
      const cur = formPayload[k];
      const st = cur === 'pass' || cur === 'fail' || cur === 'na' ? cur : '';
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <div className="flex flex-wrap items-center gap-4">
            <FieldQuestionLabel field={field} className={`flex-1 min-w-0 ${FIELD_QUESTION_INLINE}`} />
            <div className="flex gap-2 shrink-0 items-center flex-wrap">
              {PFNA.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  title={opt.title}
                  disabled={disabled}
                  onClick={() => setKey(k, opt.v)}
                  className={`${STATUS_CHOICE_BTN} ${
                    st === opt.v ? opt.cls + ' scale-105 shadow-md' : 'bg-white text-gray-300 border-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {!disabled && (
                <CommentIconOnly
                  expanded={commentExpanded}
                  hasComment={sideCommentFilled}
                  onToggle={toggleFieldComment}
                />
              )}
            </div>
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'yes_no_na') {
      const yn = getYn(formPayload, k);
      const ynCommentFilled =
        yn.comments.trim().length > 0 || yn.commentImageIds.length > 0;
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <div className="flex flex-wrap items-center gap-4">
            <FieldQuestionLabel field={field} className={`flex-1 min-w-0 ${FIELD_QUESTION_INLINE}`} />
            <div className="flex gap-2 shrink-0 items-center flex-wrap">
              {YNA.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  title={opt.title}
                  disabled={disabled}
                  onClick={() => setKey(k, { ...yn, status: opt.v })}
                  className={`${STATUS_CHOICE_BTN} ${
                    yn.status === opt.v ? opt.cls + ' scale-105 shadow-md' : 'bg-white text-gray-300 border-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {!disabled && (
                <CommentIconOnly
                  expanded={commentExpanded}
                  hasComment={ynCommentFilled}
                  onToggle={toggleFieldComment}
                />
              )}
            </div>
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={yn.comments}
            imageIds={yn.commentImageIds}
            onTextChange={(s) => setYnCommentOnly(k, s)}
            onImageIdsChange={(ids) => setYnCommentImageIds(k, ids)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'user_single') {
      const val = getStr(formPayload, k);
      const workerRows = employees.map((e) => ({ value: e.id, label: e.name || e.username || e.id }));
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SafetySearchableSingle
                hideLabel
                label={field.label}
                rows={workerRows}
                value={val}
                disabled={disabled}
                onChange={(v) => setKey(k, v)}
                searchPlaceholder="Search workers…"
              />
            </div>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'user_multi') {
      const sel = getStrArr(formPayload, k);
      const workerRows = employees.map((e) => ({ value: e.id, label: e.name || e.username || e.id }));
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SafetyDropdownMulti
                hideLabel
                label={field.label}
                rows={workerRows}
                value={sel}
                disabled={disabled}
                onChange={(next) => setKey(k, next)}
                searchable
                searchPlaceholder="Search workers…"
              />
            </div>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'gps') {
      const g = getGps(formPayload, k);
      const setGps = (lat: string, lng: string) => {
        const la = parseFloat(lat);
        const ln = parseFloat(lng);
        if (lat === '' || lng === '') setKey(k, { lat: null, lng: null });
        else if (!Number.isNaN(la) && !Number.isNaN(ln)) setKey(k, { lat: la, lng: ln });
      };
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-wrap gap-2 items-end flex-1 min-w-0">
              <input
                type="text"
                placeholder="Latitude"
                value={g.lat}
                disabled={disabled}
                onChange={(e) => setGps(e.target.value, g.lng)}
                className={`w-32 shrink-0 ${CONTROL_BASE}`}
              />
              <input
                type="text"
                placeholder="Longitude"
                value={g.lng}
                disabled={disabled}
                onChange={(e) => setGps(g.lat, e.target.value)}
                className={`w-32 shrink-0 ${CONTROL_BASE}`}
              />
              <button
                type="button"
                disabled={disabled || !navigator.geolocation}
                onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => setKey(k, { lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => {}
                  );
                }}
                className="min-h-[2.75rem] px-3 py-2 text-xs font-medium border-2 border-gray-200 rounded-xl bg-gray-50 hover:border-gray-300 disabled:opacity-50"
              >
                Use location
              </button>
            </div>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'equipment_single') {
      const val = getStr(formPayload, k);
      const fleetRows = fleetAssets.map((a) => ({ value: a.id, label: a.label }));
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SafetySearchableSingle
                hideLabel
                label={field.label}
                rows={fleetRows}
                value={val}
                disabled={disabled}
                onChange={(v) => setKey(k, v)}
                searchPlaceholder="Search equipment…"
              />
            </div>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'equipment_multi') {
      const sel = getStrArr(formPayload, k);
      const fleetRows = fleetAssets.map((a) => ({ value: a.id, label: a.label }));
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SafetyDropdownMulti
                hideLabel
                label={field.label}
                rows={fleetRows}
                value={sel}
                disabled={disabled}
                onChange={(next) => setKey(k, next)}
                searchable
                searchPlaceholder="Search equipment…"
              />
            </div>
            {!disabled && (
              <CommentIconOnly
                expanded={commentExpanded}
                hasComment={sideCommentFilled}
                onToggle={toggleFieldComment}
              />
            )}
          </div>
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'pdf_view') {
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <SafetyPdfViewReferenceField
            field={field}
            rowBg=""
            trailingSlot={
              !disabled ? (
                <CommentIconOnly
                  expanded={commentExpanded}
                  hasComment={sideCommentFilled}
                  onToggle={toggleFieldComment}
                />
              ) : undefined
            }
          />
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'image_view' || field.type === 'pdf_insert') {
      return (
        <div key={field.id} className={`p-4 ${rowBg}`}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <SafetyDynamicFileField
            field={field}
            rowBg=""
            outerClassName="p-0"
            hideTitle
            formPayload={formPayload}
            setKey={setKey}
            disabled={disabled}
            projectId={projectId}
            uploadFile={uploadFile}
            trailingSlot={
              !disabled ? (
                <CommentIconOnly
                  expanded={commentExpanded}
                  hasComment={sideCommentFilled}
                  onToggle={toggleFieldComment}
                />
              ) : undefined
            }
          />
          <SafetyFieldCommentPanel
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={(ids) => updateSideComment(k, { imageIds: ids })}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    return null;
  };

  const workerSig = definition.signature_policy?.worker;
  const sigMode = workerSig?.mode || 'drawn';

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const visibleFields = section.fields.filter((f) => isFieldVisible(f, formPayload));
        return (
          <div key={section.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">{section.title}</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {visibleFields.map((field, idx) => renderField(field, true, idx))}
            </div>
          </div>
        );
      })}
      {workerSig != null && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className={FIELD_QUESTION_CLASS}>
            Worker signature{workerSig.required ? ' (required)' : ' (optional)'}
          </div>
          {(sigMode === 'typed' || sigMode === 'any') && (
            <input
              type="text"
              value={getStr(formPayload, '_worker_signature')}
              onChange={(e) => setKey('_worker_signature', e.target.value)}
              disabled={disabled}
              placeholder="Type full name to sign"
              className={CONTROL_INPUT_FULL}
            />
          )}
          {(sigMode === 'drawn' || sigMode === 'any') && projectId && (
            <SafetySignaturePad
              projectId={projectId}
              disabled={disabled}
              fileObjectId={getStr(formPayload, '_worker_signature_file_id') || null}
              onFileObjectId={(id) => setKey('_worker_signature_file_id', id || '')}
            />
          )}
        </div>
      )}
    </div>
  );
}
