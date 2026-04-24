import type { Dispatch, SetStateAction } from 'react';
import SafetySignaturePad, { type SavedSignatureMeta } from '@/components/SafetySignaturePad';
import { SAFETY_MODAL_FIELD_LABEL } from '@/components/safety/SafetyModalChrome';
import {
  getCustomSignaturesFromPayload,
  removeCustomSignatureSlot,
  updateCustomSignatureSlot,
  type CustomSafetySignatureSlot,
} from '@/lib/customSafetySignatures';

const INPUT_CLASS =
  'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400';

type Props = {
  projectId: string;
  formPayload: Record<string, unknown>;
  setFormPayload: Dispatch<SetStateAction<Record<string, unknown>>>;
  disabled?: boolean;
};

export default function CustomSafetySignatureSlots({ projectId, formPayload, setFormPayload, disabled }: Props) {
  const entries = getCustomSignaturesFromPayload(formPayload);
  const pendingOnly = entries.filter((e) => !(e.file_id || '').trim());

  if (pendingOnly.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Custom signatures</div>
      <div className="space-y-4">
        {pendingOnly.map((entry) => (
          <CustomSignatureRow
            key={entry.id}
            projectId={projectId}
            entry={entry}
            disabled={disabled}
            setFormPayload={setFormPayload}
          />
        ))}
      </div>
    </div>
  );
}

function CustomSignatureRow({
  projectId,
  entry,
  disabled,
  setFormPayload,
}: {
  projectId: string;
  entry: CustomSafetySignatureSlot;
  disabled?: boolean;
  setFormPayload: Dispatch<SetStateAction<Record<string, unknown>>>;
}) {
  const id = entry.id;
  const nameTrim = entry.name.trim();
  const padDisabled = !!(disabled || !nameTrim);

  const onField = (key: 'name' | 'company' | 'occupation', value: string) => {
    setFormPayload((prev) => updateCustomSignatureSlot(prev, id, { [key]: value }));
  };

  const onSignatureSaved = (fileIdSaved: string, meta: SavedSignatureMeta) => {
    setFormPayload((prev) =>
      updateCustomSignatureSlot(prev, id, {
        file_id: fileIdSaved,
        signed_at: meta.signedAt,
        location_label: meta.locationLabel?.trim() || undefined,
      })
    );
  };

  const removeRow = () => {
    setFormPayload((prev) => removeCustomSignatureSlot(prev, id));
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-xs font-medium text-gray-500">Custom Signer</div>
        <button
          type="button"
          disabled={disabled}
          onClick={removeRow}
          className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-1">
        <div>
          <label className={SAFETY_MODAL_FIELD_LABEL}>
            Name
            <span className="text-red-600 font-semibold ml-0.5" aria-hidden>
              *
            </span>
            <span className="sr-only"> (required to sign)</span>
          </label>
          <input
            type="text"
            value={entry.name}
            onChange={(e) => onField('name', e.target.value)}
            disabled={disabled}
            placeholder="Full name of person signing"
            className={INPUT_CLASS}
          />
          {!nameTrim ? <p className="mt-1 text-xs text-gray-500">Enter a name to enable the signature pad.</p> : null}
        </div>
        <div>
          <label className={SAFETY_MODAL_FIELD_LABEL}>Company</label>
          <input
            type="text"
            value={entry.company}
            onChange={(e) => onField('company', e.target.value)}
            disabled={disabled}
            placeholder="Optional"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className={SAFETY_MODAL_FIELD_LABEL}>Occupation</label>
          <input
            type="text"
            value={entry.occupation}
            onChange={(e) => onField('occupation', e.target.value)}
            disabled={disabled}
            placeholder="Optional"
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <SafetySignaturePad
        projectId={projectId}
        disabled={padDisabled}
        fileObjectId={null}
        onFileObjectId={() => {}}
        signerDisplayName={nameTrim || ' '}
        onSignatureSaved={onSignatureSaved}
        onSignatureClear={() => {
          /* canvas clear only; no persisted id yet */
        }}
      />
    </div>
  );
}
