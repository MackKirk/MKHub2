import { useQuery } from '@tanstack/react-query';
import { Briefcase, Mail, Users } from 'lucide-react';
import { api } from '@/lib/api';
import {
  SubcontractorCompanyOverviewActivity,
  type ActivityFeedItem,
} from './SubcontractorCompanyOverviewActivity';

type Company = {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ContactRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
};

type Worker = {
  id: string;
  is_active: boolean;
};

export function SubcontractorCompanyOverviewTab({
  companyId,
  company,
  contacts,
  documentCount,
  onTabChange,
}: {
  companyId: string;
  company: Company;
  contacts: ContactRow[];
  documentCount: number;
  onTabChange: (tab: 'contacts' | 'files' | 'workers') => void;
}) {
  const { data: workers } = useQuery({
    queryKey: ['subcontractor-workers-overview', companyId],
    queryFn: () =>
      api<Worker[]>('GET', `/subcontractors/companies/${companyId}/workers?include_inactive=true&sort=name&dir=asc`),
    enabled: !!companyId,
  });

  const { data: activityFeed, isLoading: activityLoading } = useQuery({
    queryKey: ['subcontractor-company-activity', companyId],
    queryFn: () => api<ActivityFeedItem[]>('GET', `/subcontractors/companies/${companyId}/activity-feed`),
    enabled: !!companyId,
  });

  const totalWorkers = workers?.length ?? 0;
  const activeCount = (workers || []).filter((w) => w.is_active).length;
  const inactiveCount = (workers || []).filter((w) => !w.is_active).length;
  const contactsCount = contacts.length;
  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];

  const companySince = company.created_at
    ? new Date(company.created_at).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const snapshotMetrics = [
    { label: 'Workers', value: String(totalWorkers), sub: `${activeCount} active` },
    { label: 'Contacts', value: String(contactsCount), sub: primaryContact?.name || undefined },
    { label: 'Documents', value: String(documentCount), sub: 'Company library' },
    {
      label: 'Status',
      value: company.is_active ? 'Active' : 'Inactive',
      sub: inactiveCount ? `${inactiveCount} inactive workers` : undefined,
    },
  ];

  const summaryLine =
    totalWorkers > 0
      ? `${totalWorkers} worker${totalWorkers === 1 ? '' : 's'} · ${contactsCount} contact${contactsCount === 1 ? '' : 's'} · ${documentCount} document${documentCount === 1 ? '' : 's'}`
      : contactsCount > 0
        ? `${contactsCount} contact${contactsCount === 1 ? '' : 's'} — add workers to enable clock-in`
        : 'Add contacts and workers to get started';

  return (
    <div className="space-y-6 min-w-0">
      <div className="space-y-3 min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between text-sm min-w-0">
          {companySince ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600 min-w-0">
              <span>
                <span className="text-gray-500">Company since:</span>{' '}
                <span className="font-medium text-gray-900">{companySince}</span>
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {primaryContact ? (
              <span className="inline-flex items-center gap-1.5 text-gray-700 min-w-0">
                <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <button
                  type="button"
                  onClick={() => onTabChange('contacts')}
                  className="hover:text-brand-red truncate text-left"
                >
                  {primaryContact.name}
                  {primaryContact.email ? (
                    <span className="text-gray-500 font-normal"> · {primaryContact.email}</span>
                  ) : null}
                </button>
              </span>
            ) : company.contact_name ? (
              <span className="inline-flex items-center gap-1.5 text-gray-700 min-w-0">
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="truncate">
                  {company.contact_name}
                  {company.email ? <span className="text-gray-500 font-normal"> · {company.email}</span> : null}
                </span>
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onTabChange('contacts')}
              className="inline-flex items-center gap-1 text-gray-600 hover:text-brand-red"
            >
              <Users className="h-3.5 w-3.5" />
              {contactsCount} contacts
            </button>
            <button
              type="button"
              onClick={() => onTabChange('workers')}
              className="inline-flex items-center gap-1 text-gray-600 hover:text-brand-red"
            >
              <Briefcase className="h-3.5 w-3.5" />
              {totalWorkers} workers
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm">
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {snapshotMetrics.map((m) => (
              <div key={m.label} className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{m.label}</div>
                <div className="text-lg font-semibold text-gray-900 tabular-nums truncate">{m.value}</div>
                {m.sub ? <div className="text-[11px] text-gray-500 truncate">{m.sub}</div> : null}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3 border-t border-gray-100 pt-3">{summaryLine}</p>
        </div>
      </div>

      <SubcontractorCompanyOverviewActivity
        events={activityFeed || []}
        loading={activityLoading}
        onViewWorkers={() => onTabChange('workers')}
      />
    </div>
  );
}
