import {
  useMemo,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
  useRef,
  type ComponentProps,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Check, ChevronDown, ImageIcon, MessageSquareText, PenLine } from 'lucide-react';
import { api } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { withSignSessionQuery, type SafetySignSession } from '@/lib/safetySignSessionQuery';
import SafetySignaturePad, { type SavedSignatureMeta } from '@/components/SafetySignaturePad';
import SafetyDynamicFileField from '@/components/SafetyDynamicFileField';
import SafetyPdfViewReferenceField from '@/components/SafetyPdfViewReferenceField';
import { SafetyFieldQuestionLabel as FieldQuestionLabel } from '@/components/SafetyFieldQuestionLabel';
import { SafetyFieldCommentPanel } from '@/components/SafetyFieldCommentPanel';
import FieldworkFieldNoteModal, {
  type FieldworkNoteModalTab,
} from '@/components/fieldwork/FieldworkFieldNoteModal';
import {
  isPhotoClassifyMeta,
  type FieldworkPhotoClassifyMeta,
} from '@/lib/fieldworkPhotoLink';
import {
  AppCheckbox,
  AppCombobox,
  AppDatePicker,
  AppHierarchicalSelectMulti,
  AppHierarchicalSelectSingle,
  AppInput,
  AppMultiSelect,
  AppSelect,
  AppTextarea,
  AppTimePicker,
  AppUserSelect,
  uiBorders,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  collectPassFailNaKeysOrdered,
  computePftAggregate,
  DYNAMIC_FORM_WORKER_SIGNATURE_HIGHLIGHT_KEY,
  isFieldVisible,
  type SafetyFormDefinition,
  type SafetyFormField,
  type SafetyFormSection,
} from '@/types/safetyFormTemplate';
import { type FormCustomListTreeNode, treeIsHierarchical } from '@/utils/customListTree';

type EmployeeRow = {
  id: string;
  name: string;
  username?: string;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  department?: string | null;
  profile_photo_file_id?: string | null;
  profile?: { profile_photo_file_id?: string | null; first_name?: string | null; last_name?: string | null; preferred_name?: string | null; department?: string | null } | null;
};
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

/** Likert-style 1–5; values stored as string keys in the payload. */
const SCALE_1_5 = (
  [
    { v: '1', title: '1', cls: 'bg-rose-50 text-rose-900 border-rose-400' },
    { v: '2', title: '2', cls: 'bg-orange-50 text-orange-900 border-orange-400' },
    { v: '3', title: '3', cls: 'bg-amber-50 text-amber-900 border-amber-400' },
    { v: '4', title: '4', cls: 'bg-lime-50 text-lime-900 border-lime-400' },
    { v: '5', title: '5', cls: 'bg-green-100 text-green-900 border-green-500' },
  ] as const
).map((x) => ({ ...x, label: x.v }));

/** Same outer box as `CommentIconOnly` (2.75rem) so P/F/NA and Y/N/NA tiles match the comment button. */
const STATUS_CHOICE_BTN =
  'w-[2.75rem] h-[2.75rem] min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50';

const FILE_CAT = 'safety-form';

/** Field question title — gray, natural case (matches template text). */
const FIELD_QUESTION_CLASS = 'block text-sm font-semibold text-gray-600 mb-2';

/** Inline question text (e.g. checkbox row). */
const FIELD_QUESTION_INLINE = 'text-sm font-semibold text-gray-600';

const CONTROL_FIELD_WRAP = 'flex-1 min-w-0 block';

function ControlLoadingPlaceholder({ message }: { message: string }) {
  return (
    <div
      className={uiCx(
        'flex min-h-[2.25rem] items-center bg-gray-50 text-sm text-gray-600',
        uiSpacing.controlX,
        uiSpacing.controlY,
        uiRadius.control,
        uiBorders.input,
      )}
    >
      {message}
    </div>
  );
}

/** Short static enums — AppSelect; longer lists — AppCombobox (search in field). */
const APP_SELECT_MAX_OPTIONS = 12;

/** Sidecar for optional per-field notes (`_fieldComments`). yes_no_na uses { comments, commentImageIds } on the field value. */
const SIDE_COMMENT_PAYLOAD_KEY = '_fieldComments';

/** Global block before worker signature: same shape as a side comment entry (string or `{ text, imageIds }`). */
const ADDITIONAL_COMMENTS_PAYLOAD_KEY = '_additionalComments';

function getAdditionalComments(p: Record<string, unknown>): SideCommentEntry {
  return parseSideCommentRaw(p[ADDITIONAL_COMMENTS_PAYLOAD_KEY]);
}

function mergeAdditionalComments(prev: Record<string, unknown>, entry: SideCommentEntry): Record<string, unknown> {
  const serialized = serializeSideCommentEntry(entry);
  const out = { ...prev };
  if (serialized === undefined) delete out[ADDITIONAL_COMMENTS_PAYLOAD_KEY];
  else out[ADDITIONAL_COMMENTS_PAYLOAD_KEY] = serialized;
  return out;
}

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

function ImageAttachmentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

type SideCommentEntry = {
  text: string;
  imageIds: string[];
  photoClassify?: FieldworkPhotoClassifyMeta | null;
};

function parseSideCommentRaw(raw: unknown): SideCommentEntry {
  if (typeof raw === 'string') return { text: raw, imageIds: [] };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const t = typeof o.text === 'string' ? o.text : '';
    const arr = o.imageIds ?? o.images;
    const imageIds = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    const photoClassify = isPhotoClassifyMeta(o.photoClassify) ? o.photoClassify : null;
    return { text: t, imageIds, photoClassify };
  }
  return { text: '', imageIds: [] };
}

function serializeSideCommentEntry(entry: SideCommentEntry): unknown | undefined {
  const text = entry.text;
  const ids = [...new Set(entry.imageIds.filter(Boolean))];
  const classify = entry.photoClassify || null;
  if (!text.trim() && ids.length === 0 && !classify) return undefined;
  if (ids.length === 0 && !classify) return text;
  const out: Record<string, unknown> = { text, imageIds: ids };
  if (classify) out.photoClassify = classify;
  return out;
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

function FlagIconSvg({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 3a1 1 0 011-1h10a1 1 0 01.8 1.6L14.25 8l2.55 4.4A1 1 0 0116 14H7v6a1 1 0 11-2 0V3z" />
    </svg>
  );
}

/** SiteDocs-style: flag + check badge (white glyphs on green circle). */
function FlagWithCheckIcon({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ''}`}>
      <FlagIconSvg className="w-[1.05rem] h-[1.05rem] text-white" />
      <svg
        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 text-white"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path
          d="M2.5 6.2L4.8 8.5L9.5 3.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export type SafetyFieldFlagState = 'none' | 'pending' | 'completed';

function CommentIconOnly({
  expanded,
  hasComment,
  onToggle,
  className,
  flagState,
  onFlag,
  showComment = true,
  hasImages = false,
  showImages = false,
  onToggleImages,
}: {
  expanded: boolean;
  hasComment: boolean;
  onToggle: () => void;
  className?: string;
  flagState?: SafetyFieldFlagState;
  onFlag?: () => void;
  showComment?: boolean;
  hasImages?: boolean;
  showImages?: boolean;
  onToggleImages?: () => void;
}) {
  const iconBtn = (
    active: boolean,
    title: string,
    onClick: () => void,
    icon: ReactNode,
    activeCls: string
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      tabIndex={-1}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center rounded-xl border-2 transition-all shrink-0 ${
        active
          ? activeCls
          : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'
      }`}
    >
      {icon}
    </button>
  );

  const commentBtn = showComment
    ? iconBtn(
        expanded || hasComment,
        expanded ? 'Close comment' : hasComment ? 'Edit comment' : 'Add comment',
        onToggle,
        <ChatBubbleIcon className="w-5 h-5" />,
        'border-blue-400 bg-blue-50 text-blue-700'
      )
    : null;

  const imageBtn =
    showImages && onToggleImages
      ? iconBtn(
          hasImages,
          hasImages ? 'Edit images' : 'Add images',
          onToggleImages,
          <ImageAttachmentIcon className="w-5 h-5" />,
          'border-violet-400 bg-violet-50 text-violet-700'
        )
      : null;

  const attachmentGroup =
    commentBtn || imageBtn ? (
      <div className="flex items-center gap-1.5 shrink-0">
        {commentBtn}
        {imageBtn}
      </div>
    ) : null;

  if (!onFlag) {
    if (!attachmentGroup) return null;
    return className ? <div className={className}>{attachmentGroup}</div> : attachmentGroup;
  }
  const st = flagState || 'none';
  const hasFlag = st === 'pending' || st === 'completed';
  const flagCls = hasFlag
    ? 'border-transparent bg-[#74c476] text-white hover:bg-[#63b365] shadow-sm'
    : 'border-gray-200 bg-white text-gray-400 hover:border-[#74c476]/80 hover:text-[#74c476]';
  return (
    <div className={`flex items-center gap-1.5 shrink-0 ${className ?? ''}`}>
      <button
        type="button"
        title={
          st === 'pending'
            ? 'Follow-up pending — click to view'
            : st === 'completed'
              ? 'Follow-up completed — click to view'
              : 'Flag & Follow-up'
        }
        aria-label="Flag and follow-up"
        tabIndex={-1}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onFlag}
        className={`min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center rounded-xl border-2 transition-all shrink-0 ${flagCls}`}
      >
        {hasFlag ? <FlagWithCheckIcon /> : <FlagIconSvg className="w-5 h-5" />}
      </button>
      {commentBtn}
      {imageBtn}
    </div>
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
  photoClassify: FieldworkPhotoClassifyMeta | null;
} {
  const v = p[k];
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return { status: '', comments: '', commentImageIds: [], photoClassify: null };
  }
  const o = v as {
    status?: string;
    comments?: string;
    commentImageIds?: unknown;
    photoClassify?: unknown;
  };
  const s = o.status;
  const status = s === 'yes' || s === 'no' || s === 'na' ? s : '';
  const imgs = o.commentImageIds;
  const commentImageIds = Array.isArray(imgs) ? imgs.filter((x): x is string => typeof x === 'string') : [];
  return {
    status,
    comments: typeof o.comments === 'string' ? o.comments : '',
    commentImageIds,
    photoClassify: isPhotoClassifyMeta(o.photoClassify) ? o.photoClassify : null,
  };
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
  /** Shown on saved signature + embedded in PDF metadata */
  signerDisplayName?: string;
  signerUserId?: string;
  /** Pending signers without safety:read — pass through to template / list / upload APIs */
  signSession?: SafetySignSession | null;
  /** Keys of required fields that failed validation (e.g. finalize); shown with a red outline */
  highlightRequiredFieldKeys?: readonly string[];
  /** Hide inspection-style global "Additional Comments / Photos" (e.g. employee reviews). */
  hideAdditionalCommentsBlock?: boolean;
  /** Hide worker signature UI even when the template defines signature_policy.worker (e.g. employee reviews). */
  hideWorkerSignatureBlock?: boolean;
  /** Hide per-field comment bubble + panel (safety inspections); employee self-review can turn this off. */
  hidePerFieldSideComments?: boolean;
  /** Per-field comment panels: text only, no images (e.g. employee review supervisor flow). */
  fieldCommentTextOnly?: boolean;
  /** Fieldwork reports: allow inserting R&M phrase-library text into comment panels. */
  enableFieldworkPhraseInsert?: boolean;
  /** Fieldwork record id — required so image attach creates classified PhotoObservations. */
  fieldworkRecordId?: string | null;
  fieldworkRowVersion?: number | null;
  /** After images are linked on Done; parent should refresh record / Files. */
  onFieldworkPhotosSynced?: (info: { recordRowVersion?: number | null }) => Promise<void> | void;
  onFieldworkPhotoRemoved?: (fileObjectId: string) => Promise<void> | void;
  /** Show SiteDocs-style flag icon per field (safety inspections). */
  enableFieldFlags?: boolean;
  /** Flag state by field key (pending = yellow). */
  fieldFlagStates?: Record<string, SafetyFieldFlagState>;
  /** Open Flag & Follow-up for a field key. */
  onFlagField?: (fieldKey: string) => void;
};

function MaybeSafetyFieldCommentPanel({
  show,
  ...rest
}: { show: boolean } & ComponentProps<typeof SafetyFieldCommentPanel>) {
  if (!show) return null;
  return <SafetyFieldCommentPanel {...rest} />;
}

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
  signerDisplayName = 'Preview user',
  signerUserId,
  signSession = null,
  highlightRequiredFieldKeys,
  hideAdditionalCommentsBlock = false,
  hideWorkerSignatureBlock = false,
  hidePerFieldSideComments = false,
  fieldCommentTextOnly = false,
  enableFieldworkPhraseInsert = false,
  fieldworkRecordId = null,
  fieldworkRowVersion = null,
  onFieldworkPhotosSynced,
  onFieldworkPhotoRemoved,
  enableFieldFlags = false,
  fieldFlagStates,
  onFlagField,
}: Props) {
  const disabled = !canWrite || readOnly;
  const showPerFieldSideComments = !hidePerFieldSideComments;
  const flagPropsFor = useCallback(
    (fieldKey: string) =>
      enableFieldFlags && onFlagField
        ? {
            flagState: (fieldFlagStates?.[fieldKey] || 'none') as SafetyFieldFlagState,
            onFlag: () => onFlagField(fieldKey),
          }
        : {},
    [enableFieldFlags, fieldFlagStates, onFlagField]
  );
  const highlightKeySet = useMemo(
    () => (highlightRequiredFieldKeys?.length ? new Set(highlightRequiredFieldKeys) : null),
    [highlightRequiredFieldKeys]
  );

  const highlightScrollPrevEmpty = useRef(true);
  useLayoutEffect(() => {
    const keys = highlightRequiredFieldKeys ?? [];
    if (keys.length === 0) {
      highlightScrollPrevEmpty.current = true;
      return;
    }
    const shouldScroll = highlightScrollPrevEmpty.current;
    highlightScrollPrevEmpty.current = false;
    if (!shouldScroll) return;
    const first = keys[0];
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(first)
        : first.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const el = document.querySelector(`[data-safety-field-key="${escaped}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightRequiredFieldKeys]);
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const [extraNotesOpen, setExtraNotesOpen] = useState(false);
  const [extraPhotosOpen, setExtraPhotosOpen] = useState(false);
  const [fieldNoteModal, setFieldNoteModal] = useState<null | {
    fieldKey: string;
    fieldLabel: string;
    kind: FieldworkNoteModalTab;
    storage: 'side' | 'yn';
  }>(null);
  const sections = useMemo(() => sortedSections(definition), [definition]);

  const allPassFailNaKeys = useMemo(() => collectPassFailNaKeysOrdered(definition), [definition]);

  const toggleCommentOpen = useCallback((fieldId: string) => {
    setCommentOpen((p) => ({ ...p, [fieldId]: !p[fieldId] }));
  }, []);

  const updateSideComment = useCallback(
    (
      fieldKey: string,
      patch: Partial<SideCommentEntry> | ((cur: SideCommentEntry) => Partial<SideCommentEntry>)
    ) => {
      setFormPayload((prev) => {
        const cur = getSideCommentForField(prev, fieldKey);
        const resolved = typeof patch === 'function' ? patch(cur) : patch;
        return mergeSideComment(prev, fieldKey, { ...cur, ...resolved });
      });
    },
    [setFormPayload]
  );

  /** Routes image id updates through functional `SetStateAction` so async paste/upload never applies stale arrays. */
  const setSideCommentImageIds = useCallback(
    (fieldKey: string) => (updater: SetStateAction<string[]>) => {
      updateSideComment(fieldKey, (cur) => ({
        imageIds: typeof updater === 'function' ? updater(cur.imageIds) : updater,
      }));
    },
    [updateSideComment]
  );

  const updateAdditionalComments = useCallback(
    (
      patch: Partial<SideCommentEntry> | ((cur: SideCommentEntry) => Partial<SideCommentEntry>)
    ) => {
      setFormPayload((prev) => {
        const cur = getAdditionalComments(prev);
        const resolved = typeof patch === 'function' ? patch(cur) : patch;
        return mergeAdditionalComments(prev, { ...cur, ...resolved });
      });
    },
    [setFormPayload]
  );

  const setAdditionalCommentImageIds = useCallback(
    (updater: SetStateAction<string[]>) => {
      updateAdditionalComments((cur) => ({
        imageIds: typeof updater === 'function' ? updater(cur.imageIds) : updater,
      }));
    },
    [updateAdditionalComments]
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
    (fieldKey: string, updater: SetStateAction<string[]>) => {
      setFormPayload((prev) => {
        const yn = getYn(prev, fieldKey);
        const nextIds = typeof updater === 'function' ? updater(yn.commentImageIds) : updater;
        return { ...prev, [fieldKey]: { ...yn, commentImageIds: nextIds } };
      });
    },
    [setFormPayload]
  );

  const setYnPhotoClassify = useCallback(
    (fieldKey: string, meta: FieldworkPhotoClassifyMeta | null) => {
      setFormPayload((prev) => {
        const yn = getYn(prev, fieldKey);
        return { ...prev, [fieldKey]: { ...yn, photoClassify: meta } };
      });
    },
    [setFormPayload]
  );

  const setSidePhotoClassify = useCallback(
    (fieldKey: string, meta: FieldworkPhotoClassifyMeta | null) => {
      updateSideComment(fieldKey, { photoClassify: meta });
    },
    [updateSideComment]
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
    queryKey: ['fleet-assets-safety-form', signSession?.projectId, signSession?.inspectionId],
    queryFn: () =>
      api<FleetPick[]>(
        'GET',
        withSignSessionQuery('/form-templates/support/fleet-assets?limit=200', signSession)
      ),
    enabled: needFleet,
  });

  const appUserOptions = useMemo(
    () => employees.map((e) => mapEmployeeToAppUserSelect(e)),
    [employees],
  );

  const fleetComboboxOptions = useMemo(
    () => fleetAssets.map((a) => ({ value: a.id, label: a.label })),
    [fleetAssets],
  );

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
      queryKey: ['formCustomList', id, 'runtime', signSession?.projectId, signSession?.inspectionId] as const,
      queryFn: () =>
        api<FormCustomListRuntimeDetail>(
          'GET',
          withSignSessionQuery(
            `/form-custom-lists/${encodeURIComponent(id)}?for_runtime=true`,
            signSession
          )
        ),
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

  const applyWorkerSignatureSaved = useCallback(
    (fileId: string, meta: SavedSignatureMeta) => {
      setFormPayload((prev) => ({
        ...prev,
        _worker_signature_file_id: fileId,
        _worker_signature_signed_at: meta.signedAt,
        _worker_signature_signer_name: meta.signerName,
        ...(meta.signerUserId ? { _worker_signature_signer_user_id: meta.signerUserId } : {}),
        ...(meta.lat != null && meta.lng != null
          ? {
              _worker_signature_lat: meta.lat,
              _worker_signature_lng: meta.lng,
              ...(meta.locationLabel ? { _worker_signature_location_label: meta.locationLabel } : {}),
            }
          : {}),
      }));
    },
    [setFormPayload]
  );

  const clearWorkerSignaturePersisted = useCallback(() => {
    setFormPayload((prev) => {
      const next = { ...prev };
      const keys = [
        '_worker_signature_file_id',
        '_worker_signature_signed_at',
        '_worker_signature_signer_name',
        '_worker_signature_signer_user_id',
        '_worker_signature_lat',
        '_worker_signature_lng',
        '_worker_signature_location_label',
      ];
      for (const k of keys) delete next[k];
      return next;
    });
  }, [setFormPayload]);

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
        if (signSession?.inspectionId?.trim()) {
          form.append('pending_safety_sign_inspection_id', signSession.inspectionId.trim());
        }
        const res = await api<{ id: string }>('POST', '/files/upload-proxy', form);
        // Keep file_object on storage for form/PDF only — not listed under Project > Files.
        return res.id;
      } catch {
        return null;
      }
    },
    [projectId, signSession?.inspectionId]
  );

  const renderField = (field: SafetyFormField, _zebra: boolean, _idx: number) => {
    if (!isFieldVisible(field, formPayload)) return null;
    const k = field.key;
    const commentExpanded = !enableFieldworkPhraseInsert && commentOpen[field.id] === true;
    const sideComment = getSideCommentForField(formPayload, k);
    const ynPreview = field.type === 'yes_no_na' ? getYn(formPayload, k) : null;
    const hasTextComment = ynPreview
      ? ynPreview.comments.trim().length > 0
      : sideComment.text.trim().length > 0;
    const hasImageAttachments = ynPreview
      ? ynPreview.commentImageIds.length > 0
      : sideComment.imageIds.length > 0;
    const sideCommentFilled = hasTextComment || hasImageAttachments;
    const rowWrapClass = `p-4 ${highlightKeySet?.has(k) ? 'ring-2 ring-red-500/90 rounded-lg' : ''}`;
    const openFieldNoteModal = (kind: FieldworkNoteModalTab, storage: 'side' | 'yn' = 'side') => {
      setFieldNoteModal({
        fieldKey: k,
        fieldLabel: field.label || 'Field note',
        kind,
        storage,
      });
    };
    const toggleFieldComment = () => {
      if (enableFieldworkPhraseInsert) {
        openFieldNoteModal('comment', field.type === 'yes_no_na' ? 'yn' : 'side');
        return;
      }
      toggleCommentOpen(field.id);
    };
    const commentIconExtras = enableFieldworkPhraseInsert
      ? {
          hasComment: hasTextComment,
          hasImages: hasImageAttachments,
          showImages: !disabled && showPerFieldSideComments && !fieldCommentTextOnly,
          onToggleImages: () =>
            openFieldNoteModal('images', field.type === 'yes_no_na' ? 'yn' : 'side'),
        }
      : {
          hasComment: sideCommentFilled,
          showImages: false as const,
        };

    if (field.type === 'pass_fail_total') {
      const pft = getPft(formPayload, k);
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
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
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <div className="shrink-0 ml-auto">
                <CommentIconOnly
                  expanded={commentExpanded}
                  onToggle={toggleFieldComment}
                  {...flagPropsFor(k)}
                  showComment={!disabled && showPerFieldSideComments}
                  {...commentIconExtras}
                />
              </div>
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'text_info') {
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{field.label}</p>
        </div>
      );
    }

    if (field.type === 'short_text') {
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <AppInput
              value={getStr(formPayload, k)}
              onChange={(e) => setKey(k, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder}
              className={CONTROL_FIELD_WRAP}
            />
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'long_text') {
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-start gap-2">
            <AppTextarea
              value={getStr(formPayload, k)}
              onChange={(e) => setKey(k, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder}
              rows={4}
              className={CONTROL_FIELD_WRAP}
            />
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                className="self-start"
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
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
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <AppInput
              type="number"
              value={num === '' ? '' : String(num)}
              onChange={(e) => {
                const t = e.target.value;
                setKey(k, t === '' ? '' : Number(t));
              }}
              disabled={disabled}
              placeholder={field.placeholder}
              className={CONTROL_FIELD_WRAP}
            />
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
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
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <AppDatePicker
              value={iso}
              onChange={(e) => setKey(k, e.target.value)}
              disabled={disabled}
              className={CONTROL_FIELD_WRAP}
            />
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'time') {
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <AppTimePicker
              value={getStr(formPayload, k)}
              onChange={(e) => setKey(k, e.target.value)}
              disabled={disabled}
              className={CONTROL_FIELD_WRAP}
            />
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'checkbox') {
      const v = formPayload[k] === true;
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AppCheckbox
              className="min-w-0 flex-1"
              checked={v}
              disabled={disabled}
              onChange={(checked) => setKey(k, checked)}
              label={
                <FieldQuestionLabel as="span" field={field} className={`${FIELD_QUESTION_INLINE} text-left`} />
              }
            />
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
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
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            {listId && listLoading ? (
              <ControlLoadingPlaceholder message="Loading options…" />
            ) : hierarchical && runtime ? (
              <div className="flex-1 min-w-0">
                <AppHierarchicalSelectSingle
                  hideLabel
                  label={field.label}
                  items={treeItems}
                  leafOptions={runtime.leaf_options}
                  value={val}
                  disabled={disabled}
                  onChange={(v) => setKey(k, v)}
                  placeholder="Select…"
                  className="w-full"
                />
              </div>
            ) : opts.length === 0 ? (
              <ControlLoadingPlaceholder message="No options" />
            ) : (
              <div className="flex-1 min-w-0">
                {opts.length <= APP_SELECT_MAX_OPTIONS ? (
                  <AppSelect
                    value={val}
                    onChange={(e) => setKey(k, e.target.value)}
                    disabled={disabled}
                    placeholder="Select…"
                    options={opts}
                    className="w-full"
                  />
                ) : (
                  <AppCombobox
                    value={val}
                    onChange={(v) => setKey(k, v)}
                    options={opts}
                    disabled={disabled}
                    placeholder="Search…"
                    triggerClassName="w-full"
                  />
                )}
              </div>
            )}
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
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
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              {listId && listLoading ? (
                <ControlLoadingPlaceholder message="Loading options…" />
              ) : hierarchical && runtime ? (
                <AppHierarchicalSelectMulti
                  hideLabel
                  label={field.label}
                  items={treeItems}
                  leafOptions={runtime.leaf_options}
                  value={sel}
                  disabled={disabled}
                  onChange={(next) => setKey(k, next)}
                  placeholder="Select…"
                  className="w-full"
                />
              ) : (
                <AppMultiSelect
                  searchable
                  value={sel}
                  onChange={(next) => setKey(k, next)}
                  disabled={disabled}
                  options={
                    useCustom
                      ? leafRows!.map((row) => ({ value: row.value, label: row.label }))
                      : legacyOpts.map((o) => ({ value: o, label: o }))
                  }
                  placeholder="Search…"
                  className="w-full"
                />
              )}
            </div>
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
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
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
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
              {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
                <CommentIconOnly
                  expanded={commentExpanded}
                  onToggle={toggleFieldComment}
                  {...flagPropsFor(k)}
                  showComment={!disabled && showPerFieldSideComments}
                  {...commentIconExtras}
                />
              )}
            </div>
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'scale_1_5') {
      const cur = formPayload[k];
      const st = cur === '1' || cur === '2' || cur === '3' || cur === '4' || cur === '5' ? cur : '';
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <div className="flex flex-wrap items-center gap-4">
            <FieldQuestionLabel field={field} className={`flex-1 min-w-0 ${FIELD_QUESTION_INLINE}`} />
            <div className="flex gap-2 shrink-0 items-center flex-wrap" aria-label="Scale 1 to 5">
              {SCALE_1_5.map((opt) => (
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
              {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
                <CommentIconOnly
                  expanded={commentExpanded}
                  onToggle={toggleFieldComment}
                  {...flagPropsFor(k)}
                  showComment={!disabled && showPerFieldSideComments}
                  {...commentIconExtras}
                />
              )}
            </div>
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'yes_no_na') {
      const yn = getYn(formPayload, k);
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
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
              {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
                <CommentIconOnly
                  expanded={commentExpanded}
                  onToggle={toggleFieldComment}
                  {...flagPropsFor(k)}
                  showComment={!disabled && showPerFieldSideComments}
                  {...commentIconExtras}
                />
              )}
            </div>
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={yn.comments}
            imageIds={yn.commentImageIds}
            onTextChange={(s) => setYnCommentOnly(k, s)}
            onImageIdsChange={(updater) => setYnCommentImageIds(k, updater)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'user_single') {
      const val = getStr(formPayload, k);
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <AppUserSelect
                mode="single"
                users={appUserOptions}
                value={val}
                disabled={disabled}
                onChange={(v) => setKey(k, v)}
                placeholder="Search workers…"
                triggerClassName="w-full"
              />
            </div>
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'user_multi') {
      const sel = getStrArr(formPayload, k);
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <AppUserSelect
                mode="multiple"
                users={appUserOptions}
                value={sel}
                disabled={disabled}
                onChange={(next) => setKey(k, next)}
                placeholder="Search workers…"
                triggerClassName="w-full"
              />
            </div>
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
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
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-wrap gap-2 items-end flex-1 min-w-0">
              <AppInput
                placeholder="Latitude"
                value={g.lat}
                disabled={disabled}
                onChange={(e) => setGps(e.target.value, g.lng)}
                className="w-32 shrink-0"
              />
              <AppInput
                placeholder="Longitude"
                value={g.lng}
                disabled={disabled}
                onChange={(e) => setGps(g.lat, e.target.value)}
                className="w-32 shrink-0"
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
                className="min-h-[2.75rem] px-3 py-2 text-sm font-semibold border-2 border-gray-200 rounded-xl bg-gray-50 hover:border-gray-300 disabled:opacity-50"
              >
                Use location
              </button>
            </div>
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'equipment_single') {
      const val = getStr(formPayload, k);
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <AppCombobox
                value={val}
                onChange={(v) => setKey(k, v)}
                options={fleetComboboxOptions}
                disabled={disabled}
                placeholder="Search equipment…"
                triggerClassName="w-full"
              />
            </div>
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'equipment_multi') {
      const sel = getStrArr(formPayload, k);
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <FieldQuestionLabel field={field} className={FIELD_QUESTION_CLASS} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <AppMultiSelect
                searchable
                value={sel}
                onChange={(next) => setKey(k, next)}
                options={fleetComboboxOptions}
                disabled={disabled}
                placeholder="Search equipment…"
                className="w-full"
              />
            </div>
            {((!disabled && showPerFieldSideComments) || enableFieldFlags) && (
              <CommentIconOnly
                expanded={commentExpanded}
                onToggle={toggleFieldComment}
                {...flagPropsFor(k)}
                showComment={!disabled && showPerFieldSideComments}
                {...commentIconExtras}
              />
            )}
          </div>
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'pdf_view') {
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
          <SafetyPdfViewReferenceField
            field={field}
            rowBg=""
            trailingSlot={
              (!disabled && showPerFieldSideComments) || enableFieldFlags ? (
                <CommentIconOnly
                  expanded={commentExpanded}
                  onToggle={toggleFieldComment}
                  {...flagPropsFor(k)}
                  showComment={!disabled && showPerFieldSideComments}
                  {...commentIconExtras}
                />
              ) : undefined
            }
          />
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
            projectId={projectId}
            uploadFile={uploadFile}
          />
        </div>
      );
    }

    if (field.type === 'image_view' || field.type === 'pdf_insert') {
      return (
        <div key={field.id} data-safety-field-key={k} className={rowWrapClass}>
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
              (!disabled && showPerFieldSideComments) || enableFieldFlags ? (
                <CommentIconOnly
                  expanded={commentExpanded}
                  onToggle={toggleFieldComment}
                  {...flagPropsFor(k)}
                  showComment={!disabled && showPerFieldSideComments}
                  {...commentIconExtras}
                />
              ) : undefined
            }
          />
          <MaybeSafetyFieldCommentPanel show={showPerFieldSideComments && !enableFieldworkPhraseInsert} textCommentsOnly={fieldCommentTextOnly}
            enableFieldworkPhrases={false}
            expanded={commentExpanded}
            disabled={disabled}
            text={sideComment.text}
            imageIds={sideComment.imageIds}
            onTextChange={(s) => updateSideComment(k, { text: s })}
            onImageIdsChange={setSideCommentImageIds(k)}
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
  const workerSigFileId = getStr(formPayload, '_worker_signature_file_id') || null;

  const formScrollClampRef = useRef<HTMLDivElement>(null);
  const prevWorkerSigFileIdRef = useRef<string | null>(null);

  /** After the signature pad unmounts, main scroll height shrinks; clamp scrollTop so the page does not stay "stuck" past the content. */
  useLayoutEffect(() => {
    const prev = prevWorkerSigFileIdRef.current;
    prevWorkerSigFileIdRef.current = workerSigFileId;
    const justSaved = !prev && !!workerSigFileId;
    if (!justSaved) return;
    const root = formScrollClampRef.current;
    if (!root) return;
    let el: HTMLElement | null = root;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if (
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
        el.scrollHeight > el.clientHeight
      ) {
        const max = el.scrollHeight - el.clientHeight;
        if (el.scrollTop > max) el.scrollTop = Math.max(0, max);
      }
      el = el.parentElement;
    }
  }, [workerSigFileId]);

  const additionalComments = getAdditionalComments(formPayload);
  const hasExtraNotes = additionalComments.text.trim().length > 0;
  const hasExtraPhotos = additionalComments.imageIds.length > 0;

  useEffect(() => {
    if (hasExtraNotes) setExtraNotesOpen(true);
  }, [hasExtraNotes]);

  useEffect(() => {
    if (hasExtraPhotos) setExtraPhotosOpen(true);
  }, [hasExtraPhotos]);

  const modalNote =
    fieldNoteModal == null
      ? null
      : fieldNoteModal.storage === 'yn'
        ? {
            text: getYn(formPayload, fieldNoteModal.fieldKey).comments,
            imageIds: getYn(formPayload, fieldNoteModal.fieldKey).commentImageIds,
            photoClassify: getYn(formPayload, fieldNoteModal.fieldKey).photoClassify,
          }
        : getSideCommentForField(formPayload, fieldNoteModal.fieldKey);

  return (
    <div ref={formScrollClampRef} className="space-y-4">
      {enableFieldworkPhraseInsert && fieldNoteModal && modalNote ? (
        <FieldworkFieldNoteModal
          open
          onClose={() => setFieldNoteModal(null)}
          fieldLabel={fieldNoteModal.fieldLabel}
          mode={fieldNoteModal.kind}
          disabled={disabled}
          text={modalNote.text}
          imageIds={modalNote.imageIds}
          onTextChange={(s) => {
            if (fieldNoteModal.storage === 'yn') setYnCommentOnly(fieldNoteModal.fieldKey, s);
            else updateSideComment(fieldNoteModal.fieldKey, { text: s });
          }}
          onImageIdsChange={
            fieldNoteModal.storage === 'yn'
              ? (updater) => setYnCommentImageIds(fieldNoteModal.fieldKey, updater)
              : setSideCommentImageIds(fieldNoteModal.fieldKey)
          }
          photoClassify={modalNote.photoClassify || null}
          onPhotoClassifyChange={
            fieldNoteModal.storage === 'yn'
              ? (meta) => setYnPhotoClassify(fieldNoteModal.fieldKey, meta)
              : (meta) => setSidePhotoClassify(fieldNoteModal.fieldKey, meta)
          }
          projectId={projectId}
          uploadFile={uploadFile}
          fieldworkRecordId={enableFieldworkPhraseInsert ? fieldworkRecordId : null}
          fieldworkRowVersion={enableFieldworkPhraseInsert ? fieldworkRowVersion : null}
          onClassifiedPhotosSynced={enableFieldworkPhraseInsert ? onFieldworkPhotosSynced : undefined}
          onClassifiedPhotoRemoved={enableFieldworkPhraseInsert ? onFieldworkPhotoRemoved : undefined}
        />
      ) : null}
      {sections.map((section) => {
        const visibleFields = section.fields.filter((f) => isFieldVisible(f, formPayload));
        return (
          <div key={section.id} className="rounded-xl border border-gray-200 bg-white overflow-visible">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-200 rounded-t-xl">
              <h3 className="text-sm font-semibold text-gray-700">{section.title}</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {visibleFields.map((field, idx) => renderField(field, true, idx))}
            </div>
          </div>
        );
      })}
      {(!hideAdditionalCommentsBlock || (workerSig != null && !hideWorkerSignatureBlock)) && (
        <div className="space-y-2 pt-2">
          <p className={uiCx(uiTypography.overline, 'px-0.5 text-gray-500')}>Extras</p>

          {!hideAdditionalCommentsBlock && (
            <div data-safety-field-key="_additionalComments" className="space-y-2">
              <div
                className={uiCx(
                  'overflow-hidden rounded-xl border border-dashed transition-colors',
                  extraNotesOpen || hasExtraNotes
                    ? 'border-gray-200 bg-white'
                    : 'border-gray-200/80 bg-gray-50/40 hover:border-gray-300 hover:bg-white/80'
                )}
              >
                <button
                  type="button"
                  disabled={disabled && !hasExtraNotes}
                  aria-expanded={extraNotesOpen}
                  onClick={() => {
                    if (disabled) return;
                    setExtraNotesOpen((v) => !v);
                  }}
                  className={uiCx(
                    'flex w-full items-center gap-3 px-3.5 py-3 text-left',
                    disabled ? 'cursor-default' : 'cursor-pointer'
                  )}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                    <MessageSquareText className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-800">Additional notes</span>
                    <span className={uiCx(uiTypography.helper, 'mt-0.5 block')}>
                      {hasExtraNotes
                        ? 'Optional free-text note added'
                        : 'Optional — only if something is not covered above'}
                    </span>
                  </span>
                  {hasExtraNotes ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                      <Check className="h-3 w-3" aria-hidden />
                      Added
                    </span>
                  ) : null}
                  {!disabled ? (
                    <ChevronDown
                      className={uiCx(
                        'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                        extraNotesOpen && 'rotate-180'
                      )}
                      aria-hidden
                    />
                  ) : null}
                </button>
                {(extraNotesOpen || (disabled && hasExtraNotes)) && (
                  <div className="border-t border-gray-100 px-3.5 py-3">
                    {disabled ? (
                      hasExtraNotes ? (
                        <p className="whitespace-pre-wrap break-words text-sm text-gray-700">
                          {additionalComments.text}
                        </p>
                      ) : null
                    ) : (
                      <AppTextarea
                        value={additionalComments.text}
                        onChange={(e) => updateAdditionalComments({ text: e.target.value })}
                        placeholder="Optional note — only if something is not covered above"
                        rows={3}
                      />
                    )}
                  </div>
                )}
              </div>

              <div
                className={uiCx(
                  'overflow-hidden rounded-xl border border-dashed transition-colors',
                  extraPhotosOpen || hasExtraPhotos
                    ? 'border-gray-200 bg-white'
                    : 'border-gray-200/80 bg-gray-50/40 hover:border-gray-300 hover:bg-white/80'
                )}
              >
                <button
                  type="button"
                  disabled={disabled && !hasExtraPhotos}
                  aria-expanded={extraPhotosOpen}
                  onClick={() => {
                    if (disabled) return;
                    setExtraPhotosOpen((v) => !v);
                  }}
                  className={uiCx(
                    'flex w-full items-center gap-3 px-3.5 py-3 text-left',
                    disabled ? 'cursor-default' : 'cursor-pointer'
                  )}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                    <ImageIcon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-800">Additional photos</span>
                    <span className={uiCx(uiTypography.helper, 'mt-0.5 block')}>
                      {hasExtraPhotos
                        ? `${additionalComments.imageIds.length} photo${
                            additionalComments.imageIds.length === 1 ? '' : 's'
                          } attached`
                        : 'Optional — extras beyond field photos'}
                    </span>
                  </span>
                  {hasExtraPhotos ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                      <Check className="h-3 w-3" aria-hidden />
                      {additionalComments.imageIds.length}
                    </span>
                  ) : null}
                  {!disabled ? (
                    <ChevronDown
                      className={uiCx(
                        'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                        extraPhotosOpen && 'rotate-180'
                      )}
                      aria-hidden
                    />
                  ) : null}
                </button>
                {(extraPhotosOpen || (disabled && hasExtraPhotos)) && (
                  <div className="border-t border-gray-100 px-3.5 pb-3.5 pt-3">
                    <SafetyFieldCommentPanel
                      expanded={!disabled}
                      disabled={disabled}
                      text=""
                      imageIds={additionalComments.imageIds}
                      onTextChange={() => {}}
                      onImageIdsChange={setAdditionalCommentImageIds}
                      projectId={projectId}
                      uploadFile={uploadFile}
                      imagesOnly
                      enableFieldworkPhrases={false}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {workerSig != null && !hideWorkerSignatureBlock && (
            <div
              data-safety-field-key={DYNAMIC_FORM_WORKER_SIGNATURE_HIGHLIGHT_KEY}
              className={uiCx(
                'scroll-mt-3 overflow-hidden rounded-xl border border-dashed border-gray-200 bg-white',
                highlightKeySet?.has(DYNAMIC_FORM_WORKER_SIGNATURE_HIGHLIGHT_KEY) &&
                  'ring-2 ring-red-500/90'
              )}
            >
              <div className="flex items-start gap-3 px-3.5 py-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <PenLine className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {workerSig.required ? (
                        <span className="inline-flex flex-wrap items-baseline gap-x-1">
                          <span>Worker signature</span>
                          <span className="text-red-600" aria-hidden>
                            *
                          </span>
                          <span className="sr-only"> (required)</span>
                        </span>
                      ) : (
                        'Worker signature'
                      )}
                    </p>
                    <p className={uiCx(uiTypography.helper, 'mt-0.5')}>
                      {workerSig.required
                        ? 'Required before submit'
                        : 'Optional — sign when the template asks for it'}
                    </p>
                  </div>
                  {(sigMode === 'typed' || sigMode === 'any') && (
                    <AppInput
                      value={getStr(formPayload, '_worker_signature')}
                      onChange={(e) => setKey('_worker_signature', e.target.value)}
                      disabled={disabled}
                      placeholder="Type full name to sign"
                    />
                  )}
                  {(sigMode === 'drawn' || sigMode === 'any') && projectId && (
                    <>
                      {workerSigFileId && !disabled && canWrite && (
                        <p className="text-sm text-gray-600">
                          Signature on file.{' '}
                          <button
                            type="button"
                            className="font-semibold text-brand-red hover:underline"
                            onClick={() => clearWorkerSignaturePersisted()}
                          >
                            Replace signature
                          </button>
                        </p>
                      )}
                      {workerSigFileId && disabled && (
                        <p className="text-sm text-gray-600">Signature on file — see signatures below.</p>
                      )}
                      {!workerSigFileId && (
                        <SafetySignaturePad
                          projectId={projectId}
                          disabled={disabled}
                          fileObjectId={workerSigFileId}
                          onFileObjectId={(id) => setKey('_worker_signature_file_id', id || '')}
                          signerDisplayName={signerDisplayName}
                          signerUserId={signerUserId}
                          onSignatureSaved={applyWorkerSignatureSaved}
                          onSignatureClear={clearWorkerSignaturePersisted}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}