import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import SiteFormModal, { type ClientSiteRecord } from '@/components/SiteFormModal';

type Site = ClientSiteRecord & { id: string };
type ClientFile = {
  id: string;
  file_object_id: string;
  is_image?: boolean;
  content_type?: string;
  site_id?: string;
  category?: string;
};

export default function SiteDetail() {
  const { customerId, siteId } = useParams();
  const nav = useNavigate();
  const isNew = String(siteId || '') === 'new';

  const { data: sites, refetch } = useQuery({
    queryKey: ['clientSites', customerId],
    queryFn: () => api<Site[]>('GET', `/clients/${customerId}/sites`),
    enabled: !!customerId,
  });

  const { data: files, refetch: refetchFiles } = useQuery({
    queryKey: ['clientFilesForSiteHeader', customerId],
    queryFn: () => api<ClientFile[]>('GET', `/clients/${customerId}/files`),
    enabled: !!customerId,
  });

  const site = useMemo(
    () => (sites || []).find((x) => String(x.id) === String(siteId)) || null,
    [sites, siteId],
  );

  const coverUrl = useMemo(() => {
    if (isNew) return '';
    const arr = (files || []).filter((f) => String(f.site_id || '') === String(siteId));
    const cover = arr.find((f) => String(f.category || '') === 'site-cover-derived');
    const img =
      cover || arr.find((f) => f.is_image === true || String(f.content_type || '').startsWith('image/'));
    return img ? withFileAccessToken(`/files/${img.file_object_id}/thumbnail?w=600`) : '';
  }, [files, siteId, isNew]);

  const handleRefresh = () => {
    refetch();
    refetchFiles();
  };

  if (!customerId) return null;
  if (!isNew && !site) return null;

  return (
    <SiteFormModal
      open
      onClose={() => nav(-1)}
      clientId={String(customerId)}
      site={isNew ? null : site}
      coverUrl={coverUrl}
      onSaved={handleRefresh}
      onDeleted={handleRefresh}
    />
  );
}
