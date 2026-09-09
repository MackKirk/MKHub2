import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import NewContactModal from '@/components/NewContactModal';
import SiteFormModal from '@/components/SiteFormModal';
import {
  AppButton,
  AppCheckbox,
  AppClientSelect,
  AppFormModal,
  AppSelect,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type ProjectOwnerFields = {
  client_id?: string | null;
  client_display_name?: string | null;
  client_name?: string | null;
  site_id?: string | null;
  contact_id?: string | null;
  related_client_ids?: string[] | null;
  awarded_related_client_ids?: string[] | null;
  is_bidding?: boolean | null;
};

type Props = {
  open: boolean;
  projectId: string;
  project: ProjectOwnerFields;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export default function ChangeProjectOwnerModal({
  open,
  projectId,
  project,
  onClose,
  onSaved,
}: Props) {
  const currentClientId = String(project.client_id || '');
  const hadSite = !!project.site_id;
  const isBidding = !!project.is_bidding;
  const siteRequired = isBidding || hadSite;

  const [clientId, setClientId] = useState('');
  const [clientDisplayName, setClientDisplayName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [contactId, setContactId] = useState('');
  const [resyncBilling, setResyncBilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [newSiteModalOpen, setNewSiteModalOpen] = useState(false);
  const [newContactModalOpen, setNewContactModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClientId('');
    setClientDisplayName('');
    setSiteId('');
    setContactId('');
    setResyncBilling(false);
    setSites([]);
    setContacts([]);
    setNewSiteModalOpen(false);
    setNewContactModalOpen(false);
  }, [open, projectId]);

  const loadSites = useCallback(async (cid: string) => {
    if (!cid) {
      setSites([]);
      return;
    }
    setLoadingSites(true);
    try {
      const data = await api<any[]>('GET', `/clients/${encodeURIComponent(cid)}/sites`);
      setSites(data || []);
    } catch {
      setSites([]);
    } finally {
      setLoadingSites(false);
    }
  }, []);

  const loadContacts = useCallback(async (cid: string) => {
    if (!cid) {
      setContacts([]);
      return;
    }
    setLoadingContacts(true);
    try {
      const data = await api<any[]>('GET', `/clients/${encodeURIComponent(cid)}/contacts`);
      setContacts(data || []);
    } catch {
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !clientId) {
      setSites([]);
      setContacts([]);
      return;
    }
    void loadSites(clientId);
    void loadContacts(clientId);
  }, [open, clientId, loadSites, loadContacts]);

  useEffect(() => {
    if (!open || !clientId) {
      setClientDisplayName('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const c = await api<any>('GET', `/clients/${encodeURIComponent(clientId)}`);
        if (cancelled) return;
        setClientDisplayName(
          String(c?.display_name || c?.name || c?.legal_name || '').trim(),
        );
      } catch {
        if (!cancelled) setClientDisplayName('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const handleClientChange = (id: string) => {
    setClientId(id);
    setClientDisplayName('');
    setSiteId('');
    setContactId('');
  };

  const scrubbedRelated = useMemo(() => {
    const related = (project.related_client_ids || []).map(String).filter(Boolean);
    if (!clientId) return related;
    return related.filter((id) => id !== clientId);
  }, [project.related_client_ids, clientId]);

  const scrubbedAwarded = useMemo(() => {
    const awarded = (project.awarded_related_client_ids || []).map(String).filter(Boolean);
    const relatedSet = new Set(scrubbedRelated);
    return awarded.filter((id) => relatedSet.has(id));
  }, [project.awarded_related_client_ids, scrubbedRelated]);

  const relatedRemoved = useMemo(() => {
    if (!clientId) return false;
    return (project.related_client_ids || []).map(String).includes(clientId);
  }, [project.related_client_ids, clientId]);

  const siteOptions = useMemo(
    () =>
      sortByLabel(sites, (s: any) => (s.site_name || s.site_address_line1 || s.id || '').toString()).map(
        (s: any) => ({
          value: String(s.id),
          label: (s.site_name || s.site_address_line1 || s.id) as string,
        }),
      ),
    [sites],
  );

  const contactOptions = useMemo(
    () => [
      { value: '', label: 'No contact' },
      ...sortByLabel(contacts, (c: any) => (c.name || c.email || c.phone || c.id || '').toString()).map(
        (c: any) => ({
          value: String(c.id),
          label: (c.name || c.email || c.phone || c.id) as string,
        }),
      ),
    ],
    [contacts],
  );

  const canSave =
    !!clientId &&
    clientId !== currentClientId &&
    (!siteRequired || !!siteId) &&
    !saving;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      const body: Record<string, unknown> = {
        client_id: clientId,
        site_id: siteId || null,
        contact_id: contactId || null,
        related_client_ids: scrubbedRelated.length ? scrubbedRelated : null,
        awarded_related_client_ids: isBidding
          ? undefined
          : scrubbedAwarded.length
            ? scrubbedAwarded
            : null,
        resync_billing_from_client: !isBidding && resyncBilling,
      };
      if (isBidding) {
        delete body.awarded_related_client_ids;
      }
      await api('POST', `/projects/${encodeURIComponent(projectId)}/change-owner`, body);
      toast.success('Project owner updated');
      await onSaved();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed to change project owner';
      toast.error(typeof detail === 'string' ? detail : 'Failed to change project owner');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const currentLabel =
    project.client_display_name || project.client_name || currentClientId || '—';

  return (
    <>
      <AppFormModal
        open
        onClose={() => {
          if (!saving) onClose();
        }}
        title="Change Project Owner"
        description="Reassign the primary customer and update dependent fields in one step"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={!canSave} loading={saving}>
              {saving ? 'Saving…' : 'Change owner'}
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <div
            className={uiCx(
              'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950',
            )}
          >
            <p className="font-medium">This will:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              <li>Clear the current site and contact (they belong to the old customer)</li>
              <li>Move this record&apos;s folders and files to the new customer</li>
              {!isBidding ? (
                <li>Keep the current billing snapshot unless you choose to reapply below</li>
              ) : null}
              <li>Remove the new customer from Related Customers if they are listed there</li>
            </ul>
          </div>

          <p className={uiTypography.helper}>
            Current owner: <span className="font-medium text-gray-900">{currentLabel}</span>
          </p>

          <AppClientSelect
            label="New Project Owner / Source *"
            value={clientId}
            onChange={handleClientChange}
            placeholder="Search or select customer…"
            emptyMessage="No customers found."
            fieldHint="Project Owner / Source\n\nPrimary customer for this opportunity or project."
          />

          {relatedRemoved ? (
            <p className={uiTypography.helper}>
              This customer is currently a related customer and will be removed from that list.
              {scrubbedAwarded.length !== (project.awarded_related_client_ids || []).length
                ? ' Awarded related flags will be updated to match.'
                : ''}
            </p>
          ) : null}

          {clientId ? (
            <>
              <AppSelect
                label={siteRequired ? 'Site *' : 'Site'}
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                options={
                  siteRequired
                    ? siteOptions
                    : [{ value: '', label: 'No site' }, ...siteOptions]
                }
                placeholder={loadingSites ? 'Loading sites…' : 'Select site…'}
                emptyMessage={loadingSites ? 'Loading…' : 'No sites for this customer.'}
                fieldHint="Site\n\nJob site under the new project owner customer."
                disabled={loadingSites || !clientId}
                createNewPlacement="footer"
                createNewLabel="Create new site"
                onCreateNew={() => setNewSiteModalOpen(true)}
              />

              <AppSelect
                label="Contact"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                options={contactOptions}
                placeholder={loadingContacts ? 'Loading contacts…' : 'Select contact…'}
                emptyMessage={loadingContacts ? 'Loading…' : 'No contacts for this customer.'}
                fieldHint="Contact\n\nOptional primary contact at the new customer."
                disabled={loadingContacts || !clientId}
                createNewPlacement="footer"
                createNewLabel="Create new contact"
                onCreateNew={() => setNewContactModalOpen(true)}
              />
            </>
          ) : null}

          {!isBidding ? (
            <AppCheckbox
              label="Reapply billing from the new customer"
              checked={resyncBilling}
              onChange={(checked) => setResyncBilling(checked)}
              fieldHint="Billing\n\nWhen checked, overwrites this project's billing snapshot with the new customer's billing defaults. Leave unchecked to keep the current billing fields."
            />
          ) : null}
        </div>
      </AppFormModal>

      <SiteFormModal
        open={newSiteModalOpen}
        onClose={() => setNewSiteModalOpen(false)}
        clientId={clientId}
        clientDisplayName={clientDisplayName}
        overlayClassName={uiModalLayer.stacked}
        onCreated={async (site) => {
          await loadSites(clientId);
          setSiteId(String(site.id));
          setNewSiteModalOpen(false);
        }}
      />

      <NewContactModal
        open={newContactModalOpen}
        onClose={() => setNewContactModalOpen(false)}
        clientId={clientId}
        clientDisplayName={clientDisplayName}
        stackOnTop
        onCreated={async (c) => {
          await loadContacts(clientId);
          setContactId(String(c.id));
          setNewContactModalOpen(false);
        }}
      />
    </>
  );
}
