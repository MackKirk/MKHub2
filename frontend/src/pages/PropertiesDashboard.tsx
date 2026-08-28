import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Building2, Calendar, ClipboardList, Download } from 'lucide-react';

type DashboardData = {
  total_properties: number;
  company_properties: number;
  family_properties: number;
  leases_expiring_count: number;
  leases_expired_count: number;
  insurance_expiring_count: number;
  permits_expired_count: number;
  tax_due_count: number;
  tax_overdue_count: number;
  leases_expiring: Array<{ id: string; property_name?: string; status: string; end_date?: string }>;
  leases_expired: Array<{ id: string; property_name?: string; status: string; end_date?: string }>;
  insurance_expiring: Array<{ id: string; property_name?: string; provider?: string; expiry_date?: string }>;
  permits_expired: Array<{ id: string; property_name?: string; title?: string; compliance_label?: string }>;
  tax_due: Array<{ id: string; property_name?: string; tax_year: number; status: string; due_date?: string }>;
};

function KpiCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'critical' | 'info';
  onClick?: () => void;
}) {
  const border =
    tone === 'critical'
      ? 'border-l-red-500'
      : tone === 'warn'
        ? 'border-l-amber-500'
        : tone === 'ok'
          ? 'border-l-green-500'
          : 'border-l-blue-500';
  return (
    <AppCard
      className={uiCx('border-l-4', border, onClick && 'cursor-pointer transition-colors hover:bg-gray-50')}
      onClick={onClick}
    >
      <div className={uiTypography.helper}>{label}</div>
      <div className={uiCx(uiTypography.sectionTitle, 'mt-1 text-2xl')}>{value}</div>
    </AppCard>
  );
}

export default function PropertiesDashboard() {
  const nav = useNavigate();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['properties-dashboard'],
    queryFn: () => api<DashboardData>('GET', '/properties/dashboard'),
  });

  const exportCsv = () => {
    window.open('/properties/export/register.csv', '_blank');
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Properties"
        subtitle="Portfolio register — leases, insurance, tax, and permits"
        icon={<Building2 className="h-4 w-4" />}
        actions={
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap gap-2')}>
            <AppButton variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={exportCsv}>
              Export register
            </AppButton>
            <AppButton onClick={() => nav('/properties/list')}>View all properties</AppButton>
          </div>
        }
      />

      {isLoading ? (
        <AppCard>
          <div className={uiTypography.helper}>Loading dashboard…</div>
        </AppCard>
      ) : isError ? (
        <AppEmptyState
          title="Unable to load dashboard"
          description={(error as Error)?.message || 'Check that the backend is running and you have Properties permissions.'}
        />
      ) : !data ? (
        <AppEmptyState title="Unable to load dashboard" />
      ) : (
        <div className={uiSpacing.sectionStack}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total properties" value={data.total_properties} tone="info" onClick={() => nav('/properties/list')} />
            <KpiCard label="Company" value={data.company_properties} tone="info" />
            <KpiCard label="Family" value={data.family_properties} tone="info" />
            <KpiCard
              label="Expired permits"
              value={data.permits_expired_count}
              tone={data.permits_expired_count > 0 ? 'critical' : 'ok'}
              onClick={() => nav('/properties/approvals')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Leases expiring"
              value={data.leases_expiring_count}
              tone={data.leases_expiring_count > 0 ? 'warn' : 'ok'}
            />
            <KpiCard
              label="Leases expired"
              value={data.leases_expired_count}
              tone={data.leases_expired_count > 0 ? 'critical' : 'ok'}
            />
            <KpiCard
              label="Insurance expiring (60d)"
              value={data.insurance_expiring_count}
              tone={data.insurance_expiring_count > 0 ? 'warn' : 'ok'}
            />
            <KpiCard
              label="Tax due / overdue"
              value={data.tax_due_count + data.tax_overdue_count}
              tone={data.tax_overdue_count > 0 ? 'critical' : data.tax_due_count > 0 ? 'warn' : 'ok'}
              onClick={() => nav('/properties/calendar')}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AppCard>
              <AppSectionHeader
                title="Expired permits"
                description="Permits that need attention on the approvals board."
                {...appSectionPresetProps('warranties')}
                action={
                  <AppButton variant="ghost" size="sm" onClick={() => nav('/properties/approvals')}>
                    Open board
                  </AppButton>
                }
              />
              <div className="mt-4">
                {data.permits_expired.length === 0 ? (
                  <p className={uiTypography.helper}>No lapsed permits.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.permits_expired.map((p) => (
                      <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                        <span>
                          <span className="font-medium text-gray-900">{p.title || 'Permit'}</span>
                          <span className="text-gray-500"> · {p.property_name}</span>
                        </span>
                        <AppBadge variant="danger">{p.compliance_label || 'Expired'}</AppBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </AppCard>

            <AppCard>
              <AppSectionHeader
                title="Leases needing attention"
                description="Expired and soon-to-expire lease agreements."
                {...appSectionPresetProps('documents')}
              />
              <div className="mt-4">
                {[...(data.leases_expired ?? []), ...(data.leases_expiring ?? [])].length === 0 ? (
                  <p className={uiTypography.helper}>No leases expiring or expired.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {[...(data.leases_expired ?? []), ...(data.leases_expiring ?? [])].slice(0, 8).map((l) => (
                      <li key={l.id} className="flex justify-between gap-2">
                        <span className="font-medium text-gray-900">{l.property_name}</span>
                        <AppBadge variant={l.status === 'expired' ? 'danger' : 'warning'}>{l.status}</AppBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </AppCard>
          </div>

          <AppCard>
            <AppSectionHeader
              title="Quick links"
              description="Jump to register tools."
              {...appSectionPresetProps('fieldBrief')}
            />
            <div className={uiCx(uiLayout.actionsRow, 'mt-4 flex-wrap gap-2')}>
              <AppButton variant="secondary" leftIcon={<ClipboardList className="h-4 w-4" />} onClick={() => nav('/properties/approvals')}>
                Approvals board
              </AppButton>
              <AppButton variant="secondary" leftIcon={<Calendar className="h-4 w-4" />} onClick={() => nav('/properties/calendar')}>
                Calendar
              </AppButton>
              <AppButton variant="secondary" leftIcon={<Building2 className="h-4 w-4" />} onClick={() => nav('/properties/list')}>
                All properties
              </AppButton>
            </div>
          </AppCard>
        </div>
      )}
    </div>
  );
}
