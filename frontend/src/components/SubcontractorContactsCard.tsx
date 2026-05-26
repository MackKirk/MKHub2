import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Mail, Phone } from 'lucide-react';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import NewSubcontractorContactModal from '@/components/NewSubcontractorContactModal';
import EditSubcontractorContactModal, {
  type SubcontractorContactRecord,
} from '@/components/EditSubcontractorContactModal';
import {
  AppBadge,
  AppEmptyState,
  AppListCreateItem,
  AppSectionHeader,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const EM_DASH = '\u2014';

type Contact = SubcontractorContactRecord;

export default function SubcontractorContactsCard({
  companyId,
  companyDisplayName,
  hasEditPermission,
}: {
  companyId: string;
  companyDisplayName?: string;
  hasEditPermission?: boolean;
}) {
  const qc = useQueryClient();
  const { data, refetch, isSuccess } = useQuery({
    queryKey: ['subcontractor-company-contacts', companyId],
    queryFn: () => api<Contact[]>('GET', `/subcontractors/companies/${companyId}/contacts`),
    enabled: !!companyId,
  });
  const [list, setList] = useState<Contact[]>([]);
  useEffect(() => {
    setList(data || []);
  }, [data]);
  const [editContact, setEditContact] = useState<SubcontractorContactRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCreateOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createOpen]);

  const avatarByContactId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of list) {
      if (c.photo_file_id) {
        map.set(String(c.id), withFileAccessTokenIfNeeded(`/files/${c.photo_file_id}/thumbnail?w=160`) || '');
      }
    }
    return map;
  }, [list]);

  const contactMetaLine = (c: Contact) => {
    const parts = [c.role_title, c.department].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  };

  const refreshContacts = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['subcontractor-company', companyId] });
  };

  const onDragStart = (cid: string) => setDragId(cid);
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDropOver = async (overId: string) => {
    if (!dragId || dragId === overId) return;
    const curr = [...list];
    const from = curr.findIndex((x) => x.id === dragId);
    const to = curr.findIndex((x) => x.id === overId);
    if (from < 0 || to < 0) return;
    const [moved] = curr.splice(from, 1);
    curr.splice(to, 0, moved);
    setList(curr);
    try {
      await api('POST', `/subcontractors/companies/${companyId}/contacts/reorder`, curr.map((c) => String(c.id)));
      toast.success('Order saved');
      refreshContacts();
    } catch {
      toast.error('Failed to save order');
      refetch();
    }
  };

  const openEdit = (c: Contact) => {
    if (!hasEditPermission) return;
    setEditContact({
      id: String(c.id),
      name: c.name,
      email: c.email,
      phone: c.phone,
      role_title: c.role_title,
      department: c.department,
      is_primary: c.is_primary,
      photo_file_id: c.photo_file_id,
    });
  };

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Contacts"
        description={
          hasEditPermission
            ? 'Click a row to edit. Drag rows to reorder. Primary contact is highlighted.'
            : 'People at this subcontractor company.'
        }
        {...appSectionPresetProps('contact')}
      />
      <div className="flex flex-col gap-2">
        {hasEditPermission && (
          <AppListCreateItem label="New Contact" layout="row" onClick={() => setCreateOpen(true)} />
        )}
        {(list || []).map((c) => {
          const avatarSrc = avatarByContactId.get(String(c.id)) || '';
          const meta = contactMetaLine(c);

          return (
            <div
              key={c.id}
              role={hasEditPermission ? 'button' : undefined}
              tabIndex={hasEditPermission ? 0 : undefined}
              draggable={hasEditPermission}
              onDragStart={(e) => {
                e.stopPropagation();
                onDragStart(String(c.id));
              }}
              onDragOver={onDragOver}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropOver(String(c.id));
              }}
              onClick={() => openEdit(c)}
              onKeyDown={(e) => {
                if (hasEditPermission && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  openEdit(c);
                }
              }}
              className={uiCx(
                'group flex items-center gap-2 sm:gap-3 text-left',
                uiRadius.control,
                uiBorders.subtle,
                uiColors.surface,
                'px-2 py-2 sm:px-3 sm:py-2.5',
                hasEditPermission && 'cursor-pointer transition-shadow hover:border-gray-300 hover:shadow-sm',
                c.is_primary && 'ring-1 ring-emerald-200/80',
              )}
            >
              {hasEditPermission ? (
                <span
                  className="flex h-9 w-5 shrink-0 cursor-grab items-center justify-center text-gray-300 active:cursor-grabbing group-hover:text-gray-400"
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-hidden
                >
                  <GripVertical className="h-4 w-4" />
                </span>
              ) : null}
              <div className="relative shrink-0">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt=""
                    className={uiCx('h-11 w-11 object-cover', uiRadius.control, 'ring-2 ring-white')}
                  />
                ) : (
                  <div
                    className={uiCx(
                      'flex h-11 w-11 items-center justify-center text-sm font-semibold text-gray-600',
                      uiRadius.control,
                      'bg-gradient-to-br from-gray-100 to-gray-200',
                    )}
                  >
                    {(c.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={uiCx(uiTypography.sectionTitle, 'truncate')}>{c.name || EM_DASH}</span>
                  {c.is_primary ? <AppBadge variant="success">Primary</AppBadge> : null}
                </div>
                {meta ? <p className={uiCx(uiTypography.helper, 'truncate')}>{meta}</p> : null}
                <div
                  className={uiCx('mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5', uiTypography.helper)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex min-w-0 max-w-full items-center gap-1 truncate text-gray-600 hover:text-brand-red"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                      <span className="truncate">{c.email}</span>
                    </a>
                  ) : null}
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex min-w-0 items-center gap-1 text-gray-600 hover:text-brand-red"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                      <span>{c.phone}</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {isSuccess && (!list || !list.length) && !hasEditPermission ? (
        <AppEmptyState title="No contacts" />
      ) : null}
      <NewSubcontractorContactModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        companyId={companyId}
        companyName={companyDisplayName}
        onCreated={() => refreshContacts()}
      />
      <EditSubcontractorContactModal
        open={!!editContact}
        onClose={() => setEditContact(null)}
        companyId={companyId}
        companyDisplayName={companyDisplayName}
        contact={editContact}
        photoUrl={editContact ? avatarByContactId.get(String(editContact.id)) || '' : ''}
        onSaved={() => refreshContacts()}
        onDeleted={() => refreshContacts()}
      />
    </div>
  );
}
