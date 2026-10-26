import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { AppButton, AppInput } from '@/components/ui';

type PortalAccessPayload = {
  invites: Array<{
    id: string;
    email: string;
    status: string;
    expires_at?: string | null;
    created_at?: string | null;
  }>;
  memberships: Array<{
    id: string;
    email: string;
    name?: string | null;
    status: string;
    created_at?: string | null;
  }>;
};

type PortalInviteResponse = {
  id: string;
  email: string;
  status: string;
  expires_at?: string | null;
  invite_link?: string;
  email_sent?: boolean;
};

export default function PortalAccessPanel({
  clientId,
  enabled,
}: {
  clientId: string;
  enabled: boolean;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-access', clientId],
    queryFn: () => api<PortalAccessPayload>('GET', `/clients/${clientId}/portal-access`),
    enabled: enabled && !!clientId,
  });

  const inviteMut = useMutation({
    mutationFn: (em: string) =>
      api<PortalInviteResponse>('POST', `/clients/${clientId}/portal-invites`, { email: em }),
    onSuccess: (res) => {
      setEmail('');
      qc.invalidateQueries({ queryKey: ['portal-access', clientId] });
      if (res?.email_sent) {
        setLastInviteLink(null);
        toast.success('Invitation sent');
      } else {
        const link = res?.invite_link || null;
        setLastInviteLink(link);
        toast.error(
          link
            ? 'Invite created, but email was not sent. Copy the link below.'
            : 'Invite created, but email was not sent.',
        );
      }
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to invite'),
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) =>
      api('POST', `/clients/${clientId}/portal-invites/${inviteId}/revoke`),
    onSuccess: () => {
      toast.success('Invite revoked');
      qc.invalidateQueries({ queryKey: ['portal-access', clientId] });
    },
  });

  const revokeMember = useMutation({
    mutationFn: (membershipId: string) =>
      api('POST', `/clients/${clientId}/portal-memberships/${membershipId}/revoke`),
    onSuccess: () => {
      toast.success('Access revoked');
      qc.invalidateQueries({ queryKey: ['portal-access', clientId] });
    },
  });

  const copyLink = async () => {
    if (!lastInviteLink) return;
    try {
      await navigator.clipboard.writeText(lastInviteLink);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  if (!enabled) return null;

  const activeMembers = (data?.memberships || []).filter((m) => m.status === 'active');
  const pendingInvites = (data?.invites || []).filter((i) => i.status === 'pending');

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const em = email.trim();
          if (!em) return;
          inviteMut.mutate(em);
        }}
      >
        <div className="min-w-[200px] flex-1">
          <AppInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contact@company.com"
            required
          />
        </div>
        <AppButton type="submit" size="sm" disabled={inviteMut.isPending}>
          {inviteMut.isPending ? 'Sending…' : 'Invite'}
        </AppButton>
      </form>

      {lastInviteLink ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="mb-1 font-semibold">Invite link (email not sent)</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs">{lastInviteLink}</code>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => void copyLink()}>
              Copy
            </AppButton>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-5 text-sm">
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Members</h4>
            {activeMembers.length === 0 ? (
              <p className="text-gray-500">No members yet</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {activeMembers.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate text-gray-900">
                      {m.name ? `${m.name} · ` : ''}
                      {m.email}
                    </span>
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => revokeMember.mutate(m.id)}
                    >
                      Revoke
                    </AppButton>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pending invites
            </h4>
            {pendingInvites.length === 0 ? (
              <p className="text-gray-500">None</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {pendingInvites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate text-gray-900">{i.email}</span>
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => revokeInvite.mutate(i.id)}
                    >
                      Revoke
                    </AppButton>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
