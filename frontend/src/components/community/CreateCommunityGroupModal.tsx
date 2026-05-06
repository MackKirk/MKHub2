import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import OverlayPortal from '@/components/OverlayPortal';
import {
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SafetyModalOverlayBackdrop,
  SafetyFormModalLayout,
} from '@/components/safety/SafetyModalChrome';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { COMMUNITY_GROUP_DESCRIPTION_MAX_LEN } from '@/components/community/communityGroupTypes';

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

  if (!open) return null;

  return (
    <OverlayPortal>
      <SafetyModalOverlayBackdrop onBackdropClick={() => handleClose()}>
        <SafetyFormModalLayout
          widthClass="w-full max-w-md"
          titleId="create-community-group-title"
          title="Create group"
          subtitle="Name your group and optionally add context for collaborators."
          onClose={handleClose}
          footer={
            <>
              <button type="button" className={SAFETY_MODAL_BTN_CANCEL} onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className={SAFETY_MODAL_BTN_PRIMARY}
                disabled={!name.trim() || createMutation.isPending}
                onClick={handleSubmit}
              >
                {createMutation.isPending ? 'Creating…' : 'Create group'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="cg-name" className={SAFETY_MODAL_FIELD_LABEL}>
                Name<span className="text-red-500 normal-case ml-0.5">*</span>
              </label>
              <input
                id="cg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Warehouse team"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-brand-red"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="cg-desc" className={SAFETY_MODAL_FIELD_LABEL}>
                Description
              </label>
              <textarea
                id="cg-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, COMMUNITY_GROUP_DESCRIPTION_MAX_LEN))}
                placeholder="Optional notes about who belongs in this group…"
                rows={4}
                maxLength={COMMUNITY_GROUP_DESCRIPTION_MAX_LEN}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-brand-red resize-y min-h-[5rem]"
              />
              <div className="mt-1 text-[10px] text-gray-400 tabular-nums">
                {description.length} / {COMMUNITY_GROUP_DESCRIPTION_MAX_LEN}
              </div>
            </div>
          </div>
        </SafetyFormModalLayout>
      </SafetyModalOverlayBackdrop>
    </OverlayPortal>
  );
}
