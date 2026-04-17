import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import { fileStartsWithPdfMagic, isPdfFileCandidate } from '@/lib/pdfGuards';
import { uploadFormTemplateReferencePdf } from '@/lib/formTemplateReferencePdfUpload';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import OverlayPortal from '@/components/OverlayPortal';
import {
  ModalCloseChevron,
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SAFETY_MODAL_OVERLAY,
  SafetyFormModalLayout,
  SafetyFormPdfPreviewShell,
} from '@/components/safety/SafetyModalChrome';
import PageHeaderBar from '@/components/PageHeaderBar';
import SafetyFieldTypeIcon from '@/components/SafetyFieldTypeIcon';
import SafetySearchableSingle from '@/components/SafetySearchableSingle';
import DynamicSafetyForm from '@/components/DynamicSafetyForm';
import {
  DEFAULT_DEFINITION,
  FIELD_TYPE_OPTIONS,
  normalizeDefinition,
  type SafetyFormDefinition,
  type SafetyFormField,
  type SafetyFormFieldType,
  type SafetyFormSection,
} from '@/types/safetyFormTemplate';

type CustomListPickerRow = {
  id: string;
  name: string;
  status: string;
  include_other?: boolean;
};

type TemplateDetail = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  status: string;
  version_label: string;
  definition: SafetyFormDefinition;
};

function buildPersistedDefinition(def: SafetyFormDefinition, sigRequired: boolean): SafetyFormDefinition {
  return {
    ...def,
    signature_policy: {
      ...def.signature_policy,
      worker: {
        ...def.signature_policy?.worker,
        required: sigRequired,
        mode: 'drawn',
      },
    },
  };
}

function serializePersistedFormState(
  def: SafetyFormDefinition,
  sigRequired: boolean,
  name: string,
  description: string,
  category: string,
  status: string,
  versionLabel: string
): string {
  return JSON.stringify({
    definition: buildPersistedDefinition(def, sigRequired),
    name: (name || '').trim(),
    description: (description || '').trim() || null,
    category: (category || '').trim() || 'inspection',
    status,
    version_label: (versionLabel || '').trim(),
  });
}

function snapshotFormFromTmpl(t: TemplateDetail): string | null {
  if (!t.definition) return null;
  const d = normalizeDefinition(t.definition);
  const wr = t.definition?.signature_policy?.worker;
  const descRaw = t.description;
  const desc = descRaw != null && String(descRaw).trim() !== '' ? String(descRaw).trim() : null;
  const st = (t.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';
  return serializePersistedFormState(
    d,
    Boolean(wr?.required),
    t.name || '',
    desc ?? '',
    t.category || 'inspection',
    st,
    t.version_label || ''
  );
}

function displayLabelForFieldType(type: SafetyFormFieldType): string {
  return FIELD_TYPE_OPTIONS.find((o) => o.type === type)?.label ?? type;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-[1.125rem] h-[1.125rem]'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function RequiredAsteriskIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
      <path d="M12 4.5v15" />
      <path d="M5.5 8.25 18.5 15.75" />
      <path d="M18.5 8.25 5.5 15.75" />
    </svg>
  );
}

function newSection(order: number): SafetyFormSection {
  return {
    id: crypto.randomUUID(),
    title: 'New section',
    order,
    fields: [],
  };
}

function newField(type: SafetyFormFieldType, order: number): SafetyFormField {
  const id = crypto.randomUUID();
  const key = `field_${id.slice(0, 8)}`;
  const base: SafetyFormField = {
    id,
    key,
    type,
    label: FIELD_TYPE_OPTIONS.find((x) => x.type === type)?.label || 'Field',
    order,
    required: false,
  };
  if (type === 'image_view') {
    base.settings = { allowMultipleFiles: true, maxFiles: 8 };
  }
  if (type === 'pdf_view') {
    base.settings = { referencePdfAttachments: [] };
  }
  return base;
}

/** Static shell for a section in the main builder column (section reorder happens in the left rail). */
function BuilderSectionCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-4 last:mb-0">{children}</div>;
}

function HamburgerDragIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SortableSectionsSidebarItem({
  sectionId,
  titleText,
  onNavigate,
}: {
  sectionId: string;
  titleText: string;
  onNavigate: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.65 : 1 };
  const display = titleText.trim() || 'Section title';
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-1.5 rounded-lg border border-gray-200/90 bg-white px-2 py-2 shadow-sm"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="cursor-grab active:cursor-grabbing touch-none text-gray-400 hover:text-gray-600 p-1 shrink-0 mt-0.5 rounded"
        aria-label="Drag to reorder section"
        {...listeners}
        {...attributes}
      >
        <HamburgerDragIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        className="flex-1 min-w-0 text-left text-xs font-medium text-gray-800 leading-snug hover:text-brand-red"
        title={display}
        onClick={onNavigate}
      >
        {display}
      </button>
    </div>
  );
}

function SortableFieldRow({
  id,
  children,
}: {
  id: string;
  children: (drag: {
    setActivatorNodeRef: (el: HTMLElement | null) => void;
    listeners: DraggableSyntheticListeners;
    attributes: DraggableAttributes;
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="p-3 space-y-2 border-b border-gray-50 last:border-b-0 bg-white">
      {children({ setActivatorNodeRef, listeners, attributes })}
    </div>
  );
}

export default function FormTemplateEditorPage() {
  const { id: templateId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [localName, setLocalName] = useState('');
  const [editingTemplateName, setEditingTemplateName] = useState(false);
  const [editingVersionLabel, setEditingVersionLabel] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('inspection');
  const [status, setStatus] = useState('active');
  const [definition, setDefinition] = useState<SafetyFormDefinition>(DEFAULT_DEFINITION);
  const [versionLabel, setVersionLabel] = useState('');
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState<'build' | 'preview'>('build');
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [addFieldSectionId, setAddFieldSectionId] = useState<string | null>(null);
  const [modalSelectedType, setModalSelectedType] = useState<SafetyFormFieldType | null>(null);
  const [modalItemName, setModalItemName] = useState('');
  const [modalCustomListId, setModalCustomListId] = useState('');
  const [modalCustomListSearch, setModalCustomListSearch] = useState('');
  const [sigRequired, setSigRequired] = useState(false);
  const [customListEdit, setCustomListEdit] = useState<{ sectionId: string; fieldId: string } | null>(null);
  const [customListEditDraft, setCustomListEditDraft] = useState('');
  const [imageViewEdit, setImageViewEdit] = useState<{ sectionId: string; fieldId: string } | null>(null);
  const [imageViewDraftMulti, setImageViewDraftMulti] = useState(true);
  const [imageViewDraftMax, setImageViewDraftMax] = useState(8);
  const [pdfViewEdit, setPdfViewEdit] = useState<{ sectionId: string; fieldId: string } | null>(null);
  const [pdfViewDraftAttachments, setPdfViewDraftAttachments] = useState<{ id: string; originalName: string }[]>([]);
  const [pdfViewUploading, setPdfViewUploading] = useState(false);
  const [pdfViewDropActive, setPdfViewDropActive] = useState(false);
  const pdfViewDragDepth = useRef(0);
  const [pdfBuilderPreview, setPdfBuilderPreview] = useState<{ url: string; name: string } | null>(null);
  const pdfModalFileRef = useRef<HTMLInputElement | null>(null);
  const templateNameInputRef = useRef<HTMLInputElement | null>(null);
  const versionLabelInputRef = useRef<HTMLInputElement | null>(null);
  const sectionTitleInputRef = useRef<HTMLInputElement | null>(null);
  const fieldLabelInputRef = useRef<HTMLInputElement | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{ sectionId: string; fieldId: string } | null>(null);
  const skipTemplateNameCommitRef = useRef(false);
  const skipVersionLabelCommitRef = useRef(false);
  const { data: tmpl, isLoading } = useQuery({
    queryKey: ['formTemplate', templateId],
    queryFn: () => api<TemplateDetail>('GET', `/form-templates/${encodeURIComponent(templateId!)}`),
    enabled: !!templateId,
  });

  const { data: customListsForPicker = [] } = useQuery({
    queryKey: ['formCustomLists'],
    queryFn: () => api<CustomListPickerRow[]>('GET', '/form-custom-lists'),
  });
  const activeCustomLists = useMemo(
    () => customListsForPicker.filter((l) => (l.status || '').toLowerCase() === 'active'),
    [customListsForPicker]
  );

  const modalFilteredCustomLists = useMemo(() => {
    const q = modalCustomListSearch.trim().toLowerCase();
    if (!q) return activeCustomLists;
    return activeCustomLists.filter((L) => (L.name || '').toLowerCase().includes(q));
  }, [activeCustomLists, modalCustomListSearch]);

  useEffect(() => {
    if (!tmpl) return;
    setLocalName(tmpl.name || '');
    setVersionLabel(tmpl.version_label || '');
    setDescription(tmpl.description || '');
    setCategory(tmpl.category || 'inspection');
    setStatus((tmpl.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active');
    setDefinition(normalizeDefinition(tmpl.definition || DEFAULT_DEFINITION));
    const wr = tmpl.definition?.signature_policy?.worker;
    setSigRequired(Boolean(wr?.required));
  }, [tmpl?.id, tmpl?.name, tmpl?.version_label, tmpl?.description, tmpl?.category, tmpl?.status, tmpl?.definition]);

  const saveFormMut = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error('No template');
      const def: SafetyFormDefinition = {
        ...definition,
        signature_policy: {
          ...definition.signature_policy,
          worker: {
            ...definition.signature_policy?.worker,
            required: sigRequired,
            mode: 'drawn',
          },
        },
      };
      return api<TemplateDetail>('PUT', `/form-templates/${encodeURIComponent(templateId)}`, {
        definition: def,
        version_label: versionLabel.trim(),
        name: localName.trim() || 'Untitled',
        description: description.trim() || null,
        category: category.trim() || 'inspection',
        status,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formTemplate', templateId] });
      qc.invalidateQueries({ queryKey: ['formTemplates'] });
      toast.success('Saved');
    },
    onError: () => toast.error('Could not save'),
  });

  const saveMetaMut = useMutation({
    mutationFn: (
      patch?: Partial<{ name: string; description: string | null; category: string; status: string; version_label: string }>
    ) =>
      api('PUT', `/form-templates/${encodeURIComponent(templateId!)}`, {
        name: patch?.name !== undefined ? patch.name.trim() || 'Untitled' : localName.trim() || 'Untitled',
        description: patch?.description !== undefined ? patch.description : description.trim() || null,
        category: patch?.category !== undefined ? patch.category : category.trim() || 'inspection',
        status: patch?.status !== undefined ? patch.status : status,
        version_label: patch?.version_label !== undefined ? patch.version_label : versionLabel.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formTemplate', templateId] });
      qc.invalidateQueries({ queryKey: ['formTemplates'] });
      toast.success('Saved');
    },
    onError: () => toast.error('Could not save'),
  });

  useEffect(() => {
    if (!editingTemplateName) return;
    const t = window.setTimeout(() => {
      templateNameInputRef.current?.focus();
      templateNameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingTemplateName]);

  useEffect(() => {
    if (!editingVersionLabel) return;
    const t = window.setTimeout(() => {
      versionLabelInputRef.current?.focus();
      versionLabelInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingVersionLabel]);

  useEffect(() => {
    if (!editingSectionId) return;
    const t = window.setTimeout(() => {
      sectionTitleInputRef.current?.focus();
      sectionTitleInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingSectionId]);

  useEffect(() => {
    if (!editingField) return;
    const t = window.setTimeout(() => {
      fieldLabelInputRef.current?.focus();
      fieldLabelInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingField]);

  const commitTemplateName = () => {
    if (skipTemplateNameCommitRef.current) {
      skipTemplateNameCommitRef.current = false;
      return;
    }
    const trimmed = localName.trim();
    if (!trimmed) {
      toast.error('Template name cannot be empty');
      setLocalName(tmpl?.name || '');
      window.setTimeout(() => {
        templateNameInputRef.current?.focus();
        templateNameInputRef.current?.select();
      }, 0);
      return;
    }
    setEditingTemplateName(false);
    if (tmpl && trimmed !== (tmpl.name || '').trim()) {
      saveMetaMut.mutate({ name: trimmed });
    }
  };

  const cancelTemplateNameEdit = () => {
    skipTemplateNameCommitRef.current = true;
    setLocalName(tmpl?.name || '');
    setEditingTemplateName(false);
  };

  const commitVersionLabel = () => {
    if (skipVersionLabelCommitRef.current) {
      skipVersionLabelCommitRef.current = false;
      return;
    }
    setEditingVersionLabel(false);
    const trimmed = versionLabel.trim();
    if (tmpl && trimmed !== (tmpl.version_label || '').trim()) {
      saveMetaMut.mutate({ version_label: trimmed });
    }
  };

  const cancelVersionLabelEdit = () => {
    skipVersionLabelCommitRef.current = true;
    setVersionLabel(tmpl?.version_label || '');
    setEditingVersionLabel(false);
  };

  const beginEditVersionLabel = () => {
    skipVersionLabelCommitRef.current = false;
    setVersionLabel(tmpl?.version_label || '');
    setEditingTemplateName(false);
    setEditingSectionId(null);
    setEditingField(null);
    setEditingVersionLabel(true);
  };

  const beginEditTemplateName = () => {
    skipTemplateNameCommitRef.current = false;
    setLocalName(tmpl?.name || '');
    setEditingVersionLabel(false);
    setEditingSectionId(null);
    setEditingField(null);
    setEditingTemplateName(true);
  };

  const beginEditSectionTitle = (secId: string) => {
    setEditingTemplateName(false);
    setEditingVersionLabel(false);
    setEditingField(null);
    setEditingSectionId(secId);
  };

  const beginEditFieldLabel = (sectionId: string, fieldId: string) => {
    setEditingTemplateName(false);
    setEditingVersionLabel(false);
    setEditingSectionId(null);
    setEditingField({ sectionId, fieldId });
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!tmpl?.definition) return false;
    const remote = snapshotFormFromTmpl(tmpl);
    if (remote === null) return false;
    const local = serializePersistedFormState(
      definition,
      sigRequired,
      localName,
      description,
      category,
      status,
      versionLabel
    );
    return local !== remote;
  }, [tmpl, definition, sigRequired, localName, description, category, status, versionLabel]);

  const flushSaveAll = useCallback(async () => {
    if (!templateId) throw new Error('Cannot save');
    await saveFormMut.mutateAsync();
    await qc.refetchQueries({ queryKey: ['formTemplate', templateId] });
  }, [templateId, qc, saveFormMut]);

  const handleGuardDiscard = useCallback(() => {
    if (!tmpl?.definition) return;
    setEditingTemplateName(false);
    setEditingVersionLabel(false);
    setLocalName(tmpl.name || '');
    setVersionLabel(tmpl.version_label || '');
    const td = tmpl.description;
    setDescription(td != null && String(td).trim() !== '' ? String(td) : '');
    setCategory(tmpl.category || 'inspection');
    setStatus((tmpl.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active');
    setDefinition(normalizeDefinition(tmpl.definition));
    const wr = tmpl.definition?.signature_policy?.worker;
    setSigRequired(Boolean(wr?.required));
  }, [tmpl]);

  useUnsavedChangesGuard(hasUnsavedChanges, flushSaveAll, handleGuardDiscard);

  const handleTabChange = useCallback(
    async (next: 'build' | 'preview') => {
      if (next === tab) return;
      if (!hasUnsavedChanges) {
        setTab(next);
        return;
      }
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        confirmText: 'Save and Continue',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Continue without saving',
      });
      if (result === 'cancel') return;
      if (result === 'confirm') {
        try {
          await flushSaveAll();
        } catch {
          return;
        }
      }
      setTab(next);
    },
    [tab, hasUnsavedChanges, confirm, flushSaveAll]
  );

  const addSection = () => {
    setDefinition((d) => {
      const maxO = d.sections.reduce((m, s) => Math.max(m, s.order), -1);
      return { ...d, sections: [...d.sections, newSection(maxO + 1)] };
    });
  };

  const removeSection = (sid: string) => {
    setDefinition((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== sid) }));
  };

  const updateSectionTitle = (sid: string, title: string) => {
    setDefinition((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === sid ? { ...s, title } : s)),
    }));
  };

  const openAddField = (sid: string) => {
    setAddFieldSectionId(sid);
    setModalSelectedType(null);
    setModalItemName('');
    setModalCustomListId('');
    setModalCustomListSearch('');
    setShowTypeModal(true);
  };

  const selectTypeInModal = (type: SafetyFormFieldType) => {
    setModalSelectedType(type);
    setModalItemName('');
    setModalCustomListId('');
    setModalCustomListSearch('');
  };

  const commitNewField = () => {
    if (!addFieldSectionId || !modalSelectedType) return;
    const type = modalSelectedType;
    const isDropdown = type === 'dropdown_single' || type === 'dropdown_multi';
    if (isDropdown) {
      if (!modalCustomListId.trim()) return;
      const finalLabel = modalItemName.trim();
      if (!finalLabel) return;
      const listRow = customListsForPicker.find((L) => L.id === modalCustomListId.trim());
      const addOtherField = Boolean(listRow?.include_other);
      setDefinition((d) => ({
        ...d,
        sections: d.sections.map((sec) => {
          if (sec.id !== addFieldSectionId) return sec;
          const maxO = sec.fields.reduce((m, f) => Math.max(m, f.order), -1);
          const baseOrder = maxO + 1;
          const f = newField(type, baseOrder);
          const next: SafetyFormField = {
            ...f,
            label: finalLabel,
            optionsSource: { type: 'custom_list', customListId: modalCustomListId.trim() },
            options: undefined,
          };
          const fields = [...sec.fields, next];
          if (addOtherField) {
            const other = newField('long_text', baseOrder + 1);
            fields.push({ ...other, label: 'Other:' });
          }
          return { ...sec, fields };
        }),
      }));
    } else {
      const finalLabel = modalItemName.trim();
      if (!finalLabel) return;
      setDefinition((d) => ({
        ...d,
        sections: d.sections.map((sec) => {
          if (sec.id !== addFieldSectionId) return sec;
          const maxO = sec.fields.reduce((m, f) => Math.max(m, f.order), -1);
          const f = newField(type, maxO + 1);
          return { ...sec, fields: [...sec.fields, { ...f, label: finalLabel }] };
        }),
      }));
    }
    setShowTypeModal(false);
    setAddFieldSectionId(null);
    setModalSelectedType(null);
    setModalItemName('');
    setModalCustomListId('');
    setModalCustomListSearch('');
  };

  const closeTypeModal = useCallback(() => {
    setShowTypeModal(false);
    setAddFieldSectionId(null);
    setModalSelectedType(null);
    setModalItemName('');
    setModalCustomListId('');
    setModalCustomListSearch('');
  }, []);

  useEffect(() => {
    if (!showTypeModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTypeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTypeModal, closeTypeModal]);

  useEffect(() => {
    if (!showTypeModal) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showTypeModal]);

  const removeField = (sid: string, fid: string) => {
    setDefinition((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === sid ? { ...s, fields: s.fields.filter((f) => f.id !== fid) } : s)),
    }));
  };

  const updateField = (sid: string, fid: string, patch: Partial<SafetyFormField>) => {
    setDefinition((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id !== sid
          ? s
          : {
              ...s,
              fields: s.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)),
            }
      ),
    }));
  };

  const closeCustomListModal = () => setCustomListEdit(null);

  const closeImageViewModal = useCallback(() => setImageViewEdit(null), []);

  const saveImageViewModal = () => {
    if (!imageViewEdit) return;
    const sec = definition.sections.find((s) => s.id === imageViewEdit.sectionId);
    const field = sec?.fields.find((f) => f.id === imageViewEdit.fieldId);
    if (!field || field.type !== 'image_view') return;
    const maxFiles = Math.min(50, Math.max(1, imageViewDraftMax || 8));
    updateField(imageViewEdit.sectionId, imageViewEdit.fieldId, {
      settings: {
        ...field.settings,
        allowMultipleFiles: imageViewDraftMulti,
        maxFiles,
      },
    });
    setImageViewEdit(null);
  };

  useEffect(() => {
    if (!imageViewEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeImageViewModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageViewEdit, closeImageViewModal]);

  const closePdfViewModal = useCallback(() => {
    setPdfBuilderPreview(null);
    setPdfViewEdit(null);
    pdfViewDragDepth.current = 0;
    setPdfViewDropActive(false);
  }, []);

  const savePdfViewModal = () => {
    if (!pdfViewEdit) return;
    const sec = definition.sections.find((s) => s.id === pdfViewEdit.sectionId);
    const field = sec?.fields.find((f) => f.id === pdfViewEdit.fieldId);
    if (!field || field.type !== 'pdf_view') return;
    updateField(pdfViewEdit.sectionId, pdfViewEdit.fieldId, {
      settings: {
        ...field.settings,
        referencePdfAttachments: [...pdfViewDraftAttachments],
      },
    });
    setPdfViewEdit(null);
    setPdfBuilderPreview(null);
  };

  const processPdfViewModalFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0 || pdfViewUploading) return;

    const rejected = files.filter((f) => !isPdfFileCandidate(f));
    const candidates = files.filter((f) => isPdfFileCandidate(f));
    if (candidates.length === 0) {
      toast.error(
        rejected.length > 1
          ? 'Only PDF files (.pdf) are accepted.'
          : `Only PDF files are accepted — "${rejected[0]?.name || 'file'}" is not a PDF.`
      );
      return;
    }
    if (rejected.length > 0) {
      toast(`${rejected.length} non-PDF file(s) ignored — only .pdf is accepted.`, { icon: 'ℹ️' });
    }

    const pdfs: File[] = [];
    for (const file of candidates) {
      if (await fileStartsWithPdfMagic(file)) pdfs.push(file);
      else toast.error(`"${file.name}" is not a valid PDF file.`);
    }
    if (pdfs.length === 0) return;

    setPdfViewUploading(true);
    let ok = 0;
    for (const file of pdfs) {
      try {
        const id = await uploadFormTemplateReferencePdf(file);
        setPdfViewDraftAttachments((prev) => [...prev, { id, originalName: file.name }]);
        ok++;
      } catch (e: unknown) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`);
      }
    }
    setPdfViewUploading(false);
    if (ok > 0) toast.success(`${ok} PDF(s) added`);
  };

  const openPdfBuilderPreview = async (fileId: string, name: string) => {
    try {
      const r = await api<{ preview_url: string }>('GET', `/files/${encodeURIComponent(fileId)}/preview`);
      setPdfBuilderPreview({ url: r.preview_url, name });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open PDF');
    }
  };

  useEffect(() => {
    if (!pdfViewEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pdfBuilderPreview) setPdfBuilderPreview(null);
        else closePdfViewModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdfViewEdit, pdfBuilderPreview, closePdfViewModal]);

  const saveCustomListModal = () => {
    if (!customListEdit) return;
    const id = customListEditDraft.trim();
    if (!id) {
      updateField(customListEdit.sectionId, customListEdit.fieldId, {
        optionsSource: undefined,
        options: undefined,
      });
    } else {
      updateField(customListEdit.sectionId, customListEdit.fieldId, {
        optionsSource: { type: 'custom_list', customListId: id },
        options: undefined,
      });
    }
    setCustomListEdit(null);
  };

  const sorted = useMemo(() => {
    return [...definition.sections].sort((a, b) => a.order - b.order);
  }, [definition.sections]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onSectionDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDefinition((d) => {
      const list = [...d.sections].sort((a, b) => a.order - b.order);
      const oldIndex = list.findIndex((s) => s.id === active.id);
      const newIndex = list.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return d;
      const moved = arrayMove(list, oldIndex, newIndex);
      return {
        ...d,
        sections: d.sections.map((s) => {
          const idx = moved.findIndex((x) => x.id === s.id);
          if (idx < 0) return s;
          return { ...s, order: idx };
        }),
      };
    });
  }, []);

  const scrollToFormSection = useCallback((sectionId: string) => {
    document.getElementById(`form-builder-section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const onFieldDragEnd = useCallback((sectionId: string, e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDefinition((d) => ({
      ...d,
      sections: d.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const list = [...sec.fields].sort((a, b) => a.order - b.order);
        const oldIndex = list.findIndex((f) => f.id === active.id);
        const newIndex = list.findIndex((f) => f.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return sec;
        const moved = arrayMove(list, oldIndex, newIndex);
        return {
          ...sec,
          fields: moved.map((f, i) => ({ ...f, order: i })),
        };
      }),
    }));
  }, []);

  if (!templateId) {
    return <div className="p-6 text-sm text-gray-600">Missing template id.</div>;
  }

  return (
    <div className="space-y-4 min-w-0 pb-24">
      {isLoading || !tmpl ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">Loading…</div>
      ) : (
        <>
          <PageHeaderBar
            leading={
              <Link
                to="/safety/form-templates"
                className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center shrink-0"
                title="Back to form templates"
                aria-label="Back to form templates"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
            }
            title="Form Templates"
            subtitle="Build sections in the Builder tab. Save Form stores the current definition for inspections."
          />
          <div className="rounded-xl border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex flex-col gap-2 min-w-0">
                  {/* Row 1: name (left) | Version + value (right, same line) */}
                  <div className="flex flex-row items-center justify-between gap-4 min-w-0">
                    <div className="flex-1 min-w-0">
                      {editingTemplateName ? (
                        <input
                          ref={templateNameInputRef}
                          value={localName}
                          onChange={(e) => setLocalName(e.target.value)}
                          onBlur={() => commitTemplateName()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelTemplateNameEdit();
                            }
                          }}
                          className="w-full text-lg font-semibold text-gray-900 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={beginEditTemplateName}
                          className="text-left w-full min-w-0 text-lg font-semibold text-gray-900 truncate rounded-lg px-1 py-1 -mx-1 hover:bg-gray-100/80"
                        >
                          {localName.trim() || tmpl.name}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 max-w-[50%] sm:max-w-none">
                      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Version</span>
                      {editingVersionLabel ? (
                        <input
                          ref={versionLabelInputRef}
                          type="text"
                          value={versionLabel}
                          onChange={(e) => setVersionLabel(e.target.value)}
                          onBlur={() => commitVersionLabel()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelVersionLabelEdit();
                            }
                          }}
                          placeholder="1.0"
                          maxLength={100}
                          aria-label="Version label"
                          className="w-28 sm:w-32 text-right text-sm font-semibold text-gray-900 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={beginEditVersionLabel}
                          className="text-sm font-semibold text-gray-900 truncate rounded-lg px-2 py-1.5 -mx-0 border border-transparent hover:bg-gray-100/80 tabular-nums min-w-[2.5rem] text-right"
                        >
                          {versionLabel.trim() ? (
                            versionLabel.trim()
                          ) : (
                            <span className="text-gray-400 font-normal">—</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Row 2: required hint (left) | Active (right) */}
                  <div className="flex flex-row items-center justify-between gap-4 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-gray-800 min-w-0 flex-1">
                      <span className="text-red-600 shrink-0 inline-flex" aria-hidden>
                        <RequiredAsteriskIcon className="w-4 h-4" />
                      </span>
                      <span>Indicate Required Fields</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <label
                        className="flex items-center gap-2.5 cursor-pointer select-none"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          if (saveMetaMut.isPending) return;
                          const st = (status || '').toLowerCase();
                          const next = st === 'active' ? 'inactive' : 'active';
                          setStatus(next);
                          saveMetaMut.mutate({ status: next });
                        }}
                      >
                        <span className="text-xs text-gray-700">{status === 'active' ? 'Active' : 'Inactive'}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={status === 'active'}
                          disabled={saveMetaMut.isPending}
                          title={status === 'active' ? 'Active' : 'Inactive'}
                          aria-label={
                            status === 'active' ? 'Template is active. Click to deactivate.' : 'Template is inactive. Click to activate.'
                          }
                          onClick={() => {
                            const st = (status || '').toLowerCase();
                            const next = st === 'active' ? 'inactive' : 'active';
                            setStatus(next);
                            saveMetaMut.mutate({ status: next });
                          }}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 disabled:opacity-50 ${
                            status === 'active' ? 'bg-gray-900 border-gray-900' : 'bg-gray-200 border-gray-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                              status === 'active' ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </label>
                      {saveMetaMut.isPending && <span className="text-xs text-gray-400 whitespace-nowrap">Saving…</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          <div className="flex gap-2 border-b border-gray-200">
            <button
              type="button"
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${tab === 'build' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500'}`}
              onClick={() => void handleTabChange('build')}
            >
              Builder
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${tab === 'preview' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500'}`}
              onClick={() => void handleTabChange('preview')}
            >
              Preview
            </button>
          </div>

          {tab === 'preview' ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              {!definition.sections.some((s) => (s.fields || []).length > 0) && (
                <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Add at least one field in the Builder tab to preview the form here.
                </p>
              )}
              <DynamicSafetyForm
                definition={{
                  ...definition,
                  signature_policy: {
                    ...definition.signature_policy,
                    worker: {
                      ...definition.signature_policy?.worker,
                      required: sigRequired,
                      mode: 'drawn',
                    },
                  },
                }}
                formPayload={previewPayload}
                setFormPayload={setPreviewPayload}
                canWrite
                readOnly={false}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label={
                      sigRequired
                        ? 'Worker signature required. Click to make optional.'
                        : 'Worker signature optional. Click to require.'
                    }
                    aria-pressed={sigRequired}
                    title={sigRequired ? 'Required — click to make optional' : 'Optional — click to require'}
                    onClick={() => setSigRequired(!sigRequired)}
                    className={`h-9 w-9 shrink-0 inline-flex items-center justify-center bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 focus-visible:rounded ${
                      sigRequired ? 'text-red-600 hover:text-red-700' : 'text-gray-400 hover:text-gray-500'
                    }`}
                  >
                    <RequiredAsteriskIcon className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-700">Require worker signature</span>
                </div>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
                <div className="flex flex-col xl:flex-row gap-4 xl:gap-5 items-start">
                  <div className="flex-1 min-w-0 w-full space-y-4">
                    {sorted.map((sec) => (
                      <BuilderSectionCard key={sec.id}>
                        <div id={`form-builder-section-${sec.id}`} className="scroll-mt-6">
                          <div className="px-3 py-2 bg-gray-200 flex flex-wrap items-center gap-2 border-b border-gray-200">
                            {editingSectionId === sec.id ? (
                              <input
                                ref={sectionTitleInputRef}
                                value={sec.title}
                                onChange={(e) => updateSectionTitle(sec.id, e.target.value)}
                                onBlur={() => setEditingSectionId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape' || e.key === 'Enter') {
                                    e.preventDefault();
                                    setEditingSectionId(null);
                                  }
                                }}
                                className="flex-1 min-w-[120px] px-2 py-1 border border-gray-200 rounded text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                                aria-label="Section title"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => beginEditSectionTitle(sec.id)}
                                className="flex-1 min-w-[120px] text-left text-sm font-semibold text-gray-900 truncate rounded px-2 py-1 -mx-0 border border-transparent hover:bg-gray-100/80"
                                aria-label="Edit section title"
                              >
                                {sec.title.trim() ? sec.title : <span className="text-gray-400">Section title</span>}
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label="Remove section"
                              title="Remove section"
                              onClick={async () => {
                                const title = sec.title.trim() || 'Untitled section';
                                const fc = sec.fields.length;
                                const message =
                                  fc === 0
                                    ? `Remove section "${title}" from the form?`
                                    : `Section "${title}" and all ${fc} ${fc === 1 ? 'field' : 'fields'} will be removed from the form.`;
                                const r = await confirm({
                                  title: 'Remove section?',
                                  message,
                                  confirmText: 'Delete',
                                  cancelText: 'Cancel',
                                });
                                if (r !== 'confirm') return;
                                removeSection(sec.id);
                              }}
                              className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-red-600 rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
                            >
                              <TrashIcon className="w-[1.125rem] h-[1.125rem]" />
                            </button>
                          </div>
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onFieldDragEnd(sec.id, e)}>
                            <SortableContext
                              items={[...sec.fields].sort((a, b) => a.order - b.order).map((f) => f.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {[...sec.fields]
                                .sort((a, b) => a.order - b.order)
                                .map((field) => (
                                  <SortableFieldRow key={field.id} id={field.id}>
                                    {({ setActivatorNodeRef, listeners, attributes }) => (
                                      <>
                                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                                          <button
                                            type="button"
                                            ref={setActivatorNodeRef}
                                            className="cursor-grab text-gray-400 hover:text-gray-700 px-0.5 shrink-0 touch-none"
                                            aria-label="Drag field"
                                            {...listeners}
                                            {...attributes}
                                          >
                                            ⋮
                                          </button>
                                          <div className="flex shrink-0 items-center gap-1">
                                            {field.type !== 'text_info' && (
                                              <button
                                                type="button"
                                                aria-label={field.required ? 'Required field. Click to make optional.' : 'Optional field. Click to require.'}
                                                aria-pressed={Boolean(field.required)}
                                                title={field.required ? 'Required — click to make optional' : 'Optional — click to require'}
                                                onClick={() =>
                                                  updateField(sec.id, field.id, {
                                                    required: !Boolean(field.required),
                                                  })
                                                }
                                                className={`h-9 w-9 shrink-0 inline-flex items-center justify-center bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 focus-visible:rounded ${
                                                  field.required ? 'text-red-600 hover:text-red-700' : 'text-gray-400 hover:text-gray-500'
                                                }`}
                                              >
                                                <RequiredAsteriskIcon className="w-5 h-5" />
                                              </button>
                                            )}
                                            <span
                                              className="h-9 w-9 shrink-0 inline-flex items-center justify-center"
                                              title={displayLabelForFieldType(field.type)}
                                            >
                                              <SafetyFieldTypeIcon type={field.type} className="w-5 h-5 text-gray-600" />
                                            </span>
                                          </div>
                                          {editingField?.sectionId === sec.id && editingField?.fieldId === field.id ? (
                                            <input
                                              ref={fieldLabelInputRef}
                                              value={field.label}
                                              onChange={(e) => updateField(sec.id, field.id, { label: e.target.value })}
                                              onBlur={() => setEditingField(null)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Escape' || e.key === 'Enter') {
                                                  e.preventDefault();
                                                  setEditingField(null);
                                                }
                                              }}
                                              className="flex-1 min-w-[100px] px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                                              placeholder="Question / label"
                                              aria-label="Question or label"
                                            />
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => beginEditFieldLabel(sec.id, field.id)}
                                              className="flex-1 min-w-[100px] text-left px-3 py-2 border-2 border-transparent rounded-xl text-sm text-gray-900 truncate hover:bg-gray-100/80"
                                              aria-label="Edit question or label"
                                            >
                                              {field.label.trim() ? (
                                                field.label
                                              ) : (
                                                <span className="text-gray-400">Question / label</span>
                                              )}
                                            </button>
                                          )}
                                          {(field.type === 'dropdown_single' || field.type === 'dropdown_multi') && (
                                            <button
                                              type="button"
                                              aria-label="Edit custom list"
                                              title={
                                                field.optionsSource?.customListId
                                                  ? `Custom list: ${activeCustomLists.find((l) => l.id === field.optionsSource?.customListId)?.name ?? 'Unknown'}`
                                                  : 'Choose custom list'
                                              }
                                              onClick={() => {
                                                setCustomListEdit({ sectionId: sec.id, fieldId: field.id });
                                                setCustomListEditDraft(field.optionsSource?.customListId || '');
                                              }}
                                              className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-blue-600 rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
                                            >
                                              <PencilIcon />
                                            </button>
                                          )}
                                          {field.type === 'image_view' && (
                                            <button
                                              type="button"
                                              aria-label="Edit image field options"
                                              title={
                                                field.settings?.allowMultipleFiles === false
                                                  ? 'Single file — edit options'
                                                  : `Multiple files, max ${field.settings?.maxFiles ?? 8} — edit`
                                              }
                                              onClick={() => {
                                                setImageViewEdit({ sectionId: sec.id, fieldId: field.id });
                                                setImageViewDraftMulti(field.settings?.allowMultipleFiles !== false);
                                                setImageViewDraftMax(
                                                  Math.min(50, Math.max(1, field.settings?.maxFiles ?? 8))
                                                );
                                              }}
                                              className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-blue-600 rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
                                            >
                                              <PencilIcon />
                                            </button>
                                          )}
                                          {field.type === 'pdf_view' && (
                                            <button
                                              type="button"
                                              aria-label="Edit reference PDFs"
                                              title={
                                                (field.settings?.referencePdfAttachments?.length ?? 0) > 0
                                                  ? `${field.settings?.referencePdfAttachments?.length} reference PDF(s) — edit`
                                                  : 'Attach reference PDFs (view-only for respondents)'
                                              }
                                              onClick={() => {
                                                setPdfViewEdit({ sectionId: sec.id, fieldId: field.id });
                                                setPdfViewDraftAttachments([
                                                  ...(field.settings?.referencePdfAttachments ?? []),
                                                ]);
                                                setPdfBuilderPreview(null);
                                              }}
                                              className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-blue-600 rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
                                            >
                                              <PencilIcon />
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            aria-label="Remove field"
                                            title="Remove field"
                                            onClick={async () => {
                                              const label = field.label.trim() || 'Untitled field';
                                              const sectionTitle = sec.title.trim() || 'Untitled section';
                                              const r = await confirm({
                                                title: 'Remove field?',
                                                message: `Remove field "${label}" from section "${sectionTitle}"?`,
                                                confirmText: 'Delete',
                                                cancelText: 'Cancel',
                                              });
                                              if (r !== 'confirm') return;
                                              removeField(sec.id, field.id);
                                            }}
                                            className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-red-600 rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
                                          >
                                            <TrashIcon className="w-[1.125rem] h-[1.125rem]" />
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </SortableFieldRow>
                                ))}
                            </SortableContext>
                          </DndContext>
                          <div className="p-2 pt-3 border-t border-gray-50">
                            <button
                              type="button"
                              onClick={() => openAddField(sec.id)}
                              className="w-full px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                            >
                              + Add field
                            </button>
                          </div>
                        </div>
                      </BuilderSectionCard>
                    ))}
                    <button
                      type="button"
                      onClick={addSection}
                      className="w-full px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                      + Add section
                    </button>
                  </div>

                  <aside
                    className="w-full xl:w-[15rem] shrink-0 xl:sticky xl:top-2 z-[5] rounded-xl border border-gray-200 bg-gray-50/90 p-3 space-y-2 xl:max-h-[min(78vh,calc(100dvh-10rem))] xl:overflow-y-auto"
                    aria-label="Form sections"
                  >
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-snug px-0.5 break-words">
                      {(localName.trim() || tmpl.name).toUpperCase()} — SECTIONS
                    </p>
                    <button
                      type="button"
                      onClick={addSection}
                      className="w-full px-3 py-2 text-sm font-medium border border-dashed border-gray-300 rounded-lg text-gray-700 hover:bg-white/80"
                    >
                      + Add section
                    </button>
                    <div className="border-t border-gray-200 pt-2 space-y-1.5">
                      <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                        {sorted.map((sec) => (
                          <SortableSectionsSidebarItem
                            key={sec.id}
                            sectionId={sec.id}
                            titleText={sec.title}
                            onNavigate={() => scrollToFormSection(sec.id)}
                          />
                        ))}
                      </SortableContext>
                    </div>
                  </aside>
                </div>
              </DndContext>
            </div>
          )}

          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur pl-4 pr-[3.75rem] py-3 sm:pr-[4.25rem] flex flex-wrap gap-3 justify-end md:pl-[var(--sidebar-width,0px)]">
            <button
              type="button"
              disabled={saveFormMut.isPending}
              onClick={() => saveFormMut.mutate()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              Save form
            </button>
          </div>
        </>
      )}

      {customListEdit && (
        <OverlayPortal>
          <div className={SAFETY_MODAL_OVERLAY} onClick={closeCustomListModal} role="presentation">
            <SafetyFormModalLayout
              widthClass="w-full max-w-md"
              titleId="custom-list-modal-title"
              title="Custom list"
              subtitle="Choose which reusable list supplies options for this dropdown."
              shellOverflow="visible"
              bodyClassName="overflow-visible flex-1 p-4 min-h-0"
              onClose={closeCustomListModal}
              footer={
                <>
                  <button type="button" onClick={closeCustomListModal} className={SAFETY_MODAL_BTN_CANCEL}>
                    Cancel
                  </button>
                  <button type="button" onClick={saveCustomListModal} className={SAFETY_MODAL_BTN_PRIMARY}>
                    Save
                  </button>
                </>
              }
            >
              <label className="block">
                <span className={SAFETY_MODAL_FIELD_LABEL}>List</span>
                <div className="mt-1">
                  <SafetySearchableSingle
                    label=""
                    hideLabel
                    value={customListEditDraft}
                    onChange={setCustomListEditDraft}
                    rows={activeCustomLists.map((L) => ({ value: L.id, label: L.name }))}
                    emptyLabel="None (clear)"
                    searchPlaceholder="Search lists…"
                  />
                </div>
              </label>
              <p className="text-[10px] text-gray-500 mt-3">
                Create or edit lists under{' '}
                <Link to="/safety/form-custom-lists" className="text-brand-red hover:underline" onClick={(e) => e.stopPropagation()}>
                  Form Custom Lists
                </Link>
                .
              </p>
            </SafetyFormModalLayout>
          </div>
        </OverlayPortal>
      )}

      {imageViewEdit && (
        <OverlayPortal>
          <div className={SAFETY_MODAL_OVERLAY} onClick={closeImageViewModal} role="presentation">
            <SafetyFormModalLayout
              widthClass="w-full max-w-md"
              titleId="image-view-modal-title"
              title="View / attach image"
              subtitle={(() => {
                const sec = definition.sections.find((s) => s.id === imageViewEdit.sectionId);
                const f = sec?.fields.find((fld) => fld.id === imageViewEdit.fieldId);
                return f?.label?.trim() ? `Field: “${f.label.trim()}”` : 'Configure how respondents can attach photos.';
              })()}
              onClose={closeImageViewModal}
              footer={
                <>
                  <button type="button" onClick={closeImageViewModal} className={SAFETY_MODAL_BTN_CANCEL}>
                    Cancel
                  </button>
                  <button type="button" onClick={saveImageViewModal} className={SAFETY_MODAL_BTN_PRIMARY}>
                    Save
                  </button>
                </>
              }
            >
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Attachments</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5 mb-3">Allow one file or multiple images per response.</p>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={imageViewDraftMulti}
                      onChange={(e) => setImageViewDraftMulti(e.target.checked)}
                      className="rounded border-gray-300 text-brand-red focus:ring-brand-red/30"
                    />
                    <span className="text-sm text-gray-800">Allow multiple files</span>
                  </label>
                </div>
                {imageViewDraftMulti && (
                  <div>
                    <label className={SAFETY_MODAL_FIELD_LABEL}>Max files (1–50)</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={imageViewDraftMax}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setImageViewDraftMax(1);
                          return;
                        }
                        const v = parseInt(raw, 10);
                        if (Number.isNaN(v)) return;
                        setImageViewDraftMax(Math.min(50, Math.max(1, v)));
                      }}
                      className="w-full max-w-[8rem] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                    />
                  </div>
                )}
              </div>
            </SafetyFormModalLayout>
          </div>
        </OverlayPortal>
      )}

      {pdfViewEdit && (
        <OverlayPortal>
          <div className={SAFETY_MODAL_OVERLAY} onClick={closePdfViewModal} role="presentation">
            <SafetyFormModalLayout
              widthClass="w-full max-w-2xl"
              titleId="pdf-view-modal-title"
              title="View PDF — reference documents"
              subtitle={(() => {
                const sec = definition.sections.find((s) => s.id === pdfViewEdit.sectionId);
                const f = sec?.fields.find((fld) => fld.id === pdfViewEdit.fieldId);
                return f?.label?.trim() ? `Field: “${f.label.trim()}”` : 'Shown read-only to people filling out the form.';
              })()}
              onClose={closePdfViewModal}
              innerCardProps={{
                onDragEnter: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pdfViewDragDepth.current += 1;
                  setPdfViewDropActive(true);
                },
                onDragLeave: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pdfViewDragDepth.current -= 1;
                  if (pdfViewDragDepth.current <= 0) {
                    pdfViewDragDepth.current = 0;
                    setPdfViewDropActive(false);
                  }
                },
                onDragOver: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'copy';
                },
                onDrop: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pdfViewDragDepth.current = 0;
                  setPdfViewDropActive(false);
                  if (pdfViewUploading) return;
                  const fl = e.dataTransfer.files;
                  if (fl?.length) void processPdfViewModalFiles(fl);
                },
              }}
              footer={
                <>
                  <button type="button" onClick={closePdfViewModal} className={SAFETY_MODAL_BTN_CANCEL}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={savePdfViewModal}
                    disabled={pdfViewUploading}
                    className={SAFETY_MODAL_BTN_PRIMARY}
                  >
                    Save
                  </button>
                </>
              }
            >
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Reference PDFs</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Upload one or more PDFs. Respondents can open them for reference only.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pdfViewUploading}
                  onClick={() => pdfModalFileRef.current?.click()}
                  className={`w-full rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                    pdfViewDropActive ? 'border-brand-red bg-red-50/40' : 'border-gray-300 bg-gray-50/30 hover:border-gray-400'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800">
                    {pdfViewUploading ? 'Uploading…' : 'Drag PDFs here or click to choose'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Multiple files allowed.</p>
                </button>
                <input
                  ref={pdfModalFileRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  className="hidden"
                  disabled={pdfViewUploading}
                  onChange={(e) => {
                    const fl = e.target.files;
                    if (fl?.length) void processPdfViewModalFiles(fl);
                    e.target.value = '';
                  }}
                />

                {pdfViewDraftAttachments.length > 0 && (
                  <div>
                    <div className={SAFETY_MODAL_FIELD_LABEL}>Attached ({pdfViewDraftAttachments.length})</div>
                    <ul className="space-y-2 mt-1">
                      {pdfViewDraftAttachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2"
                        >
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left text-sm text-blue-600 hover:underline truncate"
                            onClick={() => void openPdfBuilderPreview(a.id, a.originalName)}
                          >
                            {a.originalName}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 text-xs text-gray-500 hover:text-red-600 px-2 py-1"
                            onClick={() =>
                              setPdfViewDraftAttachments((prev) => prev.filter((x) => x.id !== a.id))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </SafetyFormModalLayout>
          </div>
        </OverlayPortal>
      )}

      {pdfBuilderPreview && (
        <SafetyFormPdfPreviewShell
          name={pdfBuilderPreview.name}
          url={pdfBuilderPreview.url}
          onClose={() => setPdfBuilderPreview(null)}
        />
      )}

      {showTypeModal && (
        <OverlayPortal>
          <div className={SAFETY_MODAL_OVERLAY} onClick={closeTypeModal} role="presentation">
            <div
              className="w-full max-w-lg max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-field-type-title"
            >
              <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <ModalCloseChevron onClose={closeTypeModal} />
                    <div className="min-w-0">
                      <div id="add-field-type-title" className="text-sm font-semibold text-gray-900">
                        Create New Item Type
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">Choose a field type and enter a label</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-4 min-h-0">
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <div key={opt.type}>
                      {modalSelectedType === opt.type ? (
                        <div className="flex flex-col gap-2 px-4 py-3 bg-gray-50/90">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-10 h-10 shrink-0 flex items-center justify-center">
                              <SafetyFieldTypeIcon type={opt.type} className="w-5 h-5 text-gray-600" />
                            </span>
                            <input
                              autoFocus
                              type="text"
                              value={modalItemName}
                              onChange={(e) => setModalItemName(e.target.value)}
                              placeholder="Write your Question"
                              required
                              aria-required
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                const dd = opt.type === 'dropdown_single' || opt.type === 'dropdown_multi';
                                const can = dd
                                  ? modalCustomListId.trim() && modalItemName.trim()
                                  : modalItemName.trim();
                                if (can) {
                                  e.preventDefault();
                                  commitNewField();
                                }
                              }}
                              className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                            />
                            <button
                              type="button"
                              onClick={commitNewField}
                              disabled={
                                (() => {
                                  const dd = opt.type === 'dropdown_single' || opt.type === 'dropdown_multi';
                                  if (dd) {
                                    return !modalCustomListId.trim() || !modalItemName.trim();
                                  }
                                  return !modalItemName.trim();
                                })()
                              }
                              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-red text-white text-sm font-medium hover:bg-[#aa1212] disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-brand-red"
                            >
                              <span aria-hidden>✓</span> Create
                            </button>
                          </div>
                          {(opt.type === 'dropdown_single' || opt.type === 'dropdown_multi') && (
                            <>
                              <div className="flex flex-col gap-2 min-w-0 pl-12 w-full">
                                <label htmlFor="modal-custom-list-search" className="sr-only">
                                  Search custom lists
                                </label>
                                <input
                                  id="modal-custom-list-search"
                                  type="search"
                                  value={modalCustomListSearch}
                                  onChange={(e) => setModalCustomListSearch(e.target.value)}
                                  placeholder="Search lists…"
                                  autoComplete="off"
                                  onKeyDown={(e) => e.stopPropagation()}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                                />
                                <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                                  <button
                                    type="button"
                                    onClick={() => setModalCustomListId('')}
                                    className={`w-full px-3 py-2.5 text-left text-sm ${
                                      !modalCustomListId.trim()
                                        ? 'bg-blue-50 text-blue-900 font-medium'
                                        : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                                  >
                                    Select custom list…
                                  </button>
                                  {activeCustomLists.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-gray-500">No active lists yet.</div>
                                  ) : modalFilteredCustomLists.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-gray-500">No lists match your search.</div>
                                  ) : (
                                    modalFilteredCustomLists.map((L) => (
                                      <button
                                        key={L.id}
                                        type="button"
                                        onClick={() => setModalCustomListId(L.id)}
                                        className={`w-full px-3 py-2.5 text-left text-sm truncate ${
                                          modalCustomListId === L.id
                                            ? 'bg-blue-50 text-blue-900 font-medium'
                                            : 'text-gray-800 hover:bg-gray-50'
                                        }`}
                                      >
                                        {L.name}
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                              <p className="text-[10px] text-gray-500 pl-12">
                                Create lists under{' '}
                                <Link to="/safety/form-custom-lists" className="text-brand-red hover:underline" onClick={(e) => e.stopPropagation()}>
                                  Form Custom Lists
                                </Link>{' '}
                                if none appear here.
                              </p>
                            </>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectTypeInModal(opt.type)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/80 transition-colors"
                        >
                          <span className="w-10 h-10 shrink-0 flex items-center justify-center">
                            <SafetyFieldTypeIcon type={opt.type} className="w-5 h-5 text-gray-600" />
                          </span>
                          <span className="text-sm text-gray-900">{opt.label}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-2 rounded-b-xl">
                <button type="button" onClick={closeTypeModal} className={SAFETY_MODAL_BTN_CANCEL}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
