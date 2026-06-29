import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { COMMUNITY_GROUP_DESCRIPTION_MAX_LEN } from '@/components/community/communityGroupTypes';
import {
  communityGroupFieldHints,
  createCommunityGroupQuickInfo,
} from '@/lib/formModalQuickInfo';
import { AppButton, AppFormModal, AppInput, AppTextarea, uiLayout, uiSpacing, uiCx } from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateCommunityGroupModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) => api('POST', '/community/groups', payload),
    onSuccess: () => {
      toast.success('Group created');
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      setName('');
      setDescription('');
      onClose();
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to create group');
    },
  });

  const handleSubmit = () => {
    const n = name.trim();
    if (!n) {
      toast.error('Group name is required');
      return;
    }
    const d = description.trim();
    createMutation.mutate({
      name: n,
      description: d || undefined,
    });
  };

  const handleClose = () => {
    if (createMutation.isPending) return;
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title="Create group"
      description="Name your group and optionally add context for collaborators."
      quickInfo={createCommunityGroupQuickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={createMutation.isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            variant="primary"
            size="sm"
            loading={createMutation.isPending}
            disabled={!name.trim()}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? 'Creating…' : 'Create group'}
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppInput
          id="cg-name"
          label="Name *"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Warehouse team"
          autoFocus
          fieldHint={communityGroupFieldHints.name}
        />
        <AppTextarea
          id="cg-desc"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, COMMUNITY_GROUP_DESCRIPTION_MAX_LEN))}
          placeholder="Optional notes about who belongs in this group…"
          rows={4}
          maxLength={COMMUNITY_GROUP_DESCRIPTION_MAX_LEN}
          helperText={`${description.length} / ${COMMUNITY_GROUP_DESCRIPTION_MAX_LEN}`}
          fieldHint={communityGroupFieldHints.description}
        />
      </div>
    </AppFormModal>
  );
}
