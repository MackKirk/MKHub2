import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ApiError, api, formatApiErrorDetail, withFileAccessToken } from '@/lib/api';
import {
  AppButton,
  AppFormModal,
  AppSelect,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';
import type { FieldworkRecord } from '@/types/fieldwork';

type PhraseItem = {
  id: string;
  label: string;
  parent_id?: string | null;
  is_active?: boolean;
  children?: PhraseItem[];
};

type RuntimeList = {
  id: string;
  name: string;
  items?: PhraseItem[];
};

type Catalogs = {
  observation: { list_id: string; list_name: string };
  work_performed: { list_id: string; list_name: string };
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  clientFileId: string;
  fileObjectId: string;
  fileName?: string | null;
};

function flattenLeaves(items: PhraseItem[] | undefined): { id: string; label: string }[] {
  if (!items?.length) return [];
  const walk = (nodes: PhraseItem[], path: string[]): { id: string; label: string }[] => {
    const acc: { id: string; label: string }[] = [];
    for (const n of nodes) {
      const next = [...path, n.label];
      const children = n.children || [];
      if (!children.length) {
        if (n.is_active !== false) acc.push({ id: n.id, label: next.join(' › ') });
      } else {
        acc.push(...walk(children, next));
      }
    }
    return acc;
  };
  return walk(items, []);
}

export default function FieldworkClassifyFileModal({
  open,
  onClose,
  projectId,
  clientFileId,
  fileObjectId,
  fileName,
}: Props) {
  const qc = useQueryClient();
  const [recordId, setRecordId] = useState('');
  const [entryType, setEntryType] = useState<'observation' | 'work_performed'>('observation');
  const [phraseItemId, setPhraseItemId] = useState('');
  const [extraNotes, setExtraNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setRecordId('');
    setEntryType('observation');
    setPhraseItemId('');
    setExtraNotes('');
  }, [open, clientFileId]);

  const { data: records = [] } = useQuery({
    queryKey: ['fieldworkRecords', projectId],
    queryFn: () =>
      api<FieldworkRecord[]>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records`
      ),
    enabled: open && !!projectId,
  });

  const editableRecords = useMemo(
    () =>
      records.filter((r) => {
        const st = (r.status || '').toLowerCase();
        return st === 'draft' || st === 'changes_requested';
      }),
    [records]
  );

  const { data: catalogs } = useQuery({
    queryKey: ['fieldworkPhraseCatalogs'],
    queryFn: () => api<Catalogs>('GET', '/fieldwork/phrase-catalogs'),
    enabled: open,
  });

  const listId =
    entryType === 'work_performed'
      ? catalogs?.work_performed?.list_id
      : catalogs?.observation?.list_id;

  const { data: listDetail } = useQuery({
    queryKey: ['formCustomListRuntime', listId],
    queryFn: () =>
      api<RuntimeList>('GET', `/form-custom-lists/${encodeURIComponent(listId!)}?for_runtime=true`),
    enabled: open && !!listId,
  });

  const phraseOptions = useMemo(() => flattenLeaves(listDetail?.items), [listDetail?.items]);

  const selectedRecord = editableRecords.find((r) => r.id === recordId);

  const classifyMut = useMutation({
    mutationFn: async () => {
      if (!recordId || !phraseItemId) throw new Error('Missing selection');
      const detail = await api<FieldworkRecord>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}`
      );
      return api(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/photos`,
        {
          file_object_id: fileObjectId,
          client_file_id: clientFileId,
          entry_type: entryType,
          phrase_item_id: phraseItemId,
          extra_notes: extraNotes.trim() || null,
          expected_row_version: detail.row_version,
          client_mutation_id: `files_classify_${clientFileId}`,
        }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      qc.invalidateQueries({ queryKey: ['fieldworkRecord', projectId, recordId] });
      toast.success('Photo linked and classified');
      onClose();
    },
    onError: (err: unknown) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not classify photo');
    },
  });

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Classify for Fieldwork"
      description="Link this Files image to an editable Field Report and apply an approved phrase. PhotoObservation is the source of truth — Files will show the phrase as read-only."
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            disabled={!recordId || !phraseItemId || classifyMut.isPending}
            loading={classifyMut.isPending}
            onClick={() => classifyMut.mutate()}
          >
            Link & classify
          </AppButton>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 items-start">
          <img
            src={withFileAccessToken(`/files/${fileObjectId}/thumbnail?w=160`)}
            alt={fileName || 'Photo'}
            className="h-20 w-28 rounded-md object-cover border border-gray-200 bg-gray-50"
          />
          <div>
            <p className={uiTypography.body}>{fileName || 'Untitled image'}</p>
            <p className={uiCx(uiTypography.helper, 'mt-1')}>
              Uses the same Fieldwork phrase catalogs (Observed Conditions / Work Performed).
            </p>
          </div>
        </div>

        <AppSelect
          label="Field report"
          value={recordId}
          onChange={(e) => setRecordId(e.target.value)}
          options={[
            { value: '', label: editableRecords.length ? 'Select report…' : 'No editable reports' },
            ...editableRecords.map((r) => ({
              value: r.id,
              label: `${(r.kind || '').replace('_', ' ')} · ${r.status} · v${r.version}`,
            })),
          ]}
        />

        {selectedRecord ? (
          <p className={uiCx(uiTypography.helper)}>
            Suggested folder for this report:{' '}
            {String(
              (selectedRecord.settings_snapshot as { default_pictures_folder?: string } | null)
                ?.default_pictures_folder || '—'
            )}
          </p>
        ) : null}

        <AppSelect
          label="Entry type"
          value={entryType}
          onChange={(e) => {
            setEntryType(e.target.value as 'observation' | 'work_performed');
            setPhraseItemId('');
          }}
          options={[
            { value: 'observation', label: 'Observed Conditions' },
            { value: 'work_performed', label: 'Work Performed' },
          ]}
        />

        <AppSelect
          label="Approved phrase"
          value={phraseItemId}
          onChange={(e) => setPhraseItemId(e.target.value)}
          options={[
            { value: '', label: phraseOptions.length ? 'Select phrase…' : 'No phrases in catalog' },
            ...phraseOptions.map((p) => ({ value: p.id, label: p.label })),
          ]}
        />

        <label className="block">
          <span className="text-sm font-medium text-gray-900">Additional notes (optional)</span>
          <textarea
            className="mt-1 w-full min-h-[72px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            maxLength={2000}
          />
        </label>
      </div>
    </AppFormModal>
  );
}
