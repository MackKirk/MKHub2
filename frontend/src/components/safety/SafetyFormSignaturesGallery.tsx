import { withFileAccessToken } from '@/lib/api';
import { getCustomSignaturesFromPayload } from '@/lib/customSafetySignatures';

export type SafetyFormAdditionalSignedRequest = {
  id: string;
  status?: string | null;
  signature_file_object_id?: string | null;
  signer_display_name_snapshot?: string | null;
  signed_at?: string | null;
  signature_location_label?: string | null;
};

function formatSignedAt(iso: string | undefined | null): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

type Props = {
  formPayload: Record<string, unknown>;
  /** Optional invite/sign requests (inspections). */
  signRequests?: SafetyFormAdditionalSignedRequest[] | null;
  /** Section heading — default matches inspection copy. */
  title?: string;
};

/**
 * Shows persisted worker + custom (+ optional additional) signatures from a safety form payload.
 * Used under inspections and follow-up modals so “Signature on file — see signatures below” has a gallery.
 */
export default function SafetyFormSignaturesGallery({
  formPayload,
  signRequests,
  title = 'Signatures',
}: Props) {
  const workerFileId =
    typeof formPayload._worker_signature_file_id === 'string' &&
    formPayload._worker_signature_file_id.trim()
      ? formPayload._worker_signature_file_id.trim()
      : null;
  const workerName =
    typeof formPayload._worker_signature_signer_name === 'string'
      ? formPayload._worker_signature_signer_name.trim()
      : '';
  const workerSignedAt =
    typeof formPayload._worker_signature_signed_at === 'string'
      ? formPayload._worker_signature_signed_at
      : '';
  const workerLoc =
    typeof formPayload._worker_signature_location_label === 'string'
      ? formPayload._worker_signature_location_label.trim()
      : '';

  const additionalSigned = (signRequests ?? [])
    .filter((r) => (r.status || '').toLowerCase() === 'signed' && r.signature_file_object_id)
    .sort((a, b) => {
      const ta = Date.parse(a.signed_at || '') || 0;
      const tb = Date.parse(b.signed_at || '') || 0;
      return ta - tb;
    });

  const customSigned = getCustomSignaturesFromPayload(formPayload)
    .filter((e) => (e.file_id || '').trim())
    .sort((a, b) => {
      const ta = Date.parse(a.signed_at || '') || 0;
      const tb = Date.parse(b.signed_at || '') || 0;
      return ta - tb;
    });

  if (!workerFileId && additionalSigned.length === 0 && customSigned.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</div>
      <div className="space-y-4">
        {workerFileId ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <div className="text-sm font-semibold text-gray-600 mb-2">Worker</div>
            <div className="flex flex-wrap gap-4 items-start">
              <a
                href={withFileAccessToken(`/files/${encodeURIComponent(workerFileId)}/thumbnail?w=640`)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 block rounded border border-gray-200 bg-white overflow-hidden"
              >
                <img
                  src={withFileAccessToken(`/files/${encodeURIComponent(workerFileId)}/thumbnail?w=320`)}
                  alt=""
                  className="max-h-28 w-auto max-w-[200px] object-contain"
                />
              </a>
              <div className="text-sm text-gray-800 space-y-1 min-w-0 flex-1">
                <div>
                  <span className="text-gray-600">Signed by: </span>
                  <span className="font-semibold">{workerName || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Time: </span>
                  <span>{formatSignedAt(workerSignedAt)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Location: </span>
                  <span>{workerLoc || 'Not captured'}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {customSigned.map((c) => (
          <div key={c.id} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <div className="text-sm font-semibold text-gray-600 mb-2">Custom Signer</div>
            <div className="flex flex-wrap gap-4 items-start">
              <a
                href={withFileAccessToken(`/files/${encodeURIComponent(c.file_id!)}/thumbnail?w=640`)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 block rounded border border-gray-200 bg-white overflow-hidden"
              >
                <img
                  src={withFileAccessToken(`/files/${encodeURIComponent(c.file_id!)}/thumbnail?w=320`)}
                  alt=""
                  className="max-h-28 w-auto max-w-[200px] object-contain"
                />
              </a>
              <div className="text-sm text-gray-800 space-y-1 min-w-0 flex-1">
                <div>
                  <span className="text-gray-600">Signed by: </span>
                  <span className="font-semibold">{(c.name || '').trim() || '—'}</span>
                </div>
                {(c.company || '').trim() ? (
                  <div>
                    <span className="text-gray-600">Company: </span>
                    <span>{(c.company || '').trim()}</span>
                  </div>
                ) : null}
                {(c.occupation || '').trim() ? (
                  <div>
                    <span className="text-gray-600">Occupation: </span>
                    <span>{(c.occupation || '').trim()}</span>
                  </div>
                ) : null}
                <div>
                  <span className="text-gray-600">Time: </span>
                  <span>{formatSignedAt(c.signed_at)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Location: </span>
                  <span>{(c.location_label || '').trim() || 'Not captured'}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {additionalSigned.map((r) => (
          <div key={r.id} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <div className="text-sm font-semibold text-gray-600 mb-2">Additional signer</div>
            <div className="flex flex-wrap gap-4 items-start">
              <a
                href={withFileAccessToken(
                  `/files/${encodeURIComponent(r.signature_file_object_id!)}/thumbnail?w=640`
                )}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 block rounded border border-gray-200 bg-white overflow-hidden"
              >
                <img
                  src={withFileAccessToken(
                    `/files/${encodeURIComponent(r.signature_file_object_id!)}/thumbnail?w=320`
                  )}
                  alt=""
                  className="max-h-28 w-auto max-w-[200px] object-contain"
                />
              </a>
              <div className="text-sm text-gray-800 space-y-1 min-w-0 flex-1">
                <div>
                  <span className="text-gray-600">Signed by: </span>
                  <span className="font-semibold">
                    {(r.signer_display_name_snapshot || '').trim() || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Time: </span>
                  <span>{formatSignedAt(r.signed_at)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Location: </span>
                  <span>{(r.signature_location_label || '').trim() || 'Not captured'}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
