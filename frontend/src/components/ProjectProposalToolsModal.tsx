import { useEffect, useState } from 'react';
import { PermissionToggleLabel } from '@/components/PermissionToggleRow';
import { PROJECT_LINE_PREFIX } from '@/lib/projectLinePermissionKeys';
import type { ProjectLine } from '@/lib/projectLinePermissions';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiSpacing,
} from '@/components/ui';

export type ProjectProposalToolsState = {
  approve: boolean;
  delete: boolean;
};

export function proposalToolKeys(line: ProjectLine): {
  approve: string;
  delete: string;
  write: string;
  read: string;
} {
  const p = PROJECT_LINE_PREFIX[line];
  return {
    read: `${p}:proposal:read`,
    write: `${p}:proposal:write`,
    approve: `${p}:proposal:approve`,
    delete: `${p}:proposal:delete`,
  };
}

export default function ProjectProposalToolsModal({
  open,
  line,
  approve,
  delete: deleteAllowed,
  canEdit,
  onClose,
  onSave,
}: {
  open: boolean;
  line: ProjectLine;
  approve: boolean;
  delete: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSave: (next: ProjectProposalToolsState) => void;
}) {
  const [draft, setDraft] = useState<ProjectProposalToolsState>({ approve: false, delete: false });

  useEffect(() => {
    if (!open) return;
    setDraft({ approve, delete: deleteAllowed });
  }, [open, approve, deleteAllowed]);

  const lineLabel = line === 'construction' ? 'Production' : 'Repairs & Maintenance';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Proposal — tools"
      description={`Extra Proposal tools for ${lineLabel}. Requires Edit Proposal above.`}
      footer={
        <div className={uiCx('flex justify-end gap-2', uiSpacing.inlineGap)}>
          <AppButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            variant="primary"
            disabled={!canEdit}
            onClick={() => onSave(draft)}
          >
            Save
          </AppButton>
        </div>
      }
    >
      <div className="space-y-3">
        <PermissionToggleLabel
          label="Approve pricing items"
          description="Show Approve on not-approved pricing and optional-service rows."
          checked={draft.approve}
          disabled={!canEdit}
          onToggle={() => setDraft((prev) => ({ ...prev, approve: !prev.approve }))}
        />
        <PermissionToggleLabel
          label="Delete pricing items"
          description="Allow permanent delete on not-approved rows and via the item remove dialog."
          checked={draft.delete}
          disabled={!canEdit}
          onToggle={() => setDraft((prev) => ({ ...prev, delete: !prev.delete }))}
        />
      </div>
    </AppFormModal>
  );
}
