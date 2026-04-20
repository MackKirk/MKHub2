import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import SafetySignaturePad from '@/components/SafetySignaturePad';
import PageHeaderBar from '@/components/PageHeaderBar';

type InspectionDetail = {
  id: string;
  project_id: string;
  status?: string;
  sign_requests?: Array<{
    id: string;
    signer_user_id: string;
    status: string;
  }>;
};

export default function SafetyInspectionSignPage() {
  const { projectId = '', inspectionId = '' } = useParams<{ projectId: string; inspectionId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string; username?: string; profile?: { first_name?: string; last_name?: string } }>('GET', '/auth/me'),
  });

  const signerDisplayName = useMemo(() => {
    const p = me?.profile;
    if (p && ((p.first_name || '').trim() || (p.last_name || '').trim())) {
      return `${(p.first_name || '').trim()} ${(p.last_name || '').trim()}`.trim();
    }
    return (me?.username || '').trim() || 'User';
  }, [me]);

  const myId = me?.id != null ? String(me.id) : '';

  const { data: projMeta } = useQuery({
    queryKey: ['projectMetaSign', projectId],
    queryFn: () => api<{ business_line?: string }>('GET', `/projects/${encodeURIComponent(projectId)}`),
    enabled: !!projectId,
  });

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['projectSafetyInspection', projectId, inspectionId],
    queryFn: () =>
      api<InspectionDetail>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(inspectionId)}`
      ),
    enabled: !!projectId && !!inspectionId,
  });

  const myPendingRequest = useMemo(() => {
    const reqs = detail?.sign_requests;
    if (!reqs || !myId) return null;
    return reqs.find((r) => r.signer_user_id === myId && (r.status || '').toLowerCase() === 'pending') || null;
  }, [detail?.sign_requests, myId]);

  const completeMutation = useMutation({
    mutationFn: async (body: { sign_request_id: string; signature_file_object_id: string; signed_at?: string; location_label?: string }) =>
      api<InspectionDetail>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(inspectionId)}/signatures/complete`,
        body
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId, inspectionId] });
      qc.invalidateQueries({ queryKey: ['projectSafetyInspections', projectId] });
      qc.invalidateQueries({ queryKey: ['safetyInspections'] });
      qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      qc.invalidateQueries({ queryKey: ['projectFiles', projectId] });
      if (data?.status === 'finalized') {
        toast.success('All signatures collected. Inspection is finalized.');
        const base =
          projMeta?.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
        nav(`${base}/${encodeURIComponent(projectId)}?tab=safety&safety_inspection=${encodeURIComponent(inspectionId)}`);
      } else {
        toast.success('Signature recorded.');
      }
      if ((data as { pdf_attachment_error?: string })?.pdf_attachment_error) {
        toast.error('The final PDF could not be saved to Project files.');
      }
    },
    onError: () => toast.error('Could not submit signature'),
  });

  if (!projectId || !inspectionId) {
    return <div className="p-6 text-sm text-gray-600">Invalid link.</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto px-4 py-6">
      <PageHeaderBar title="Sign safety inspection" subtitle="Draw your signature and save." />
      {isLoading && <div className="text-sm text-gray-500">Loading…</div>}
      {error && <div className="text-sm text-red-700">Could not load inspection.</div>}
      {detail && detail.status !== 'pending_signatures' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This inspection is not awaiting signatures.
        </div>
      )}
      {detail && detail.status === 'pending_signatures' && !myPendingRequest && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          You do not have a pending signature request for this inspection.
        </div>
      )}
      {detail && detail.status === 'pending_signatures' && myPendingRequest && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <SafetySignaturePad
            projectId={projectId}
            disabled={completeMutation.isPending}
            fileObjectId={null}
            onFileObjectId={() => {}}
            signerDisplayName={signerDisplayName}
            signerUserId={myId}
            onSignatureSaved={(fileId, meta) => {
              completeMutation.mutate({
                sign_request_id: myPendingRequest.id,
                signature_file_object_id: fileId,
                signed_at: meta.signedAt,
                location_label: meta.locationLabel,
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
