import { Link } from 'react-router-dom';
import { Mail, MapPin, Users } from 'lucide-react';
import { formatDateForDisplay, formatCurrency } from './customerOverviewUtils';
import type { RelationshipSnapshot } from './customerOverviewTypes';
import type { OverviewDisplayMode } from './customerOverviewTypes';

type ClientInfo = {
  client_status?: string;
  client_type?: string;
  created_at?: string;
  display_name?: string;
  name?: string;
};

type Contact = { id: string; name?: string; email?: string; is_primary?: boolean };

export function CustomerOverviewAccountStrip({
  client,
  contactsCount,
  sitesCount,
  primaryContact,
  clientSince,
  snapshot,
  displayMode,
  onContactsClick,
  onSitesClick,
}: {
  client: ClientInfo;
  contactsCount: number;
  sitesCount: number;
  primaryContact?: Contact;
  clientSince?: string;
  snapshot: RelationshipSnapshot;
  displayMode: OverviewDisplayMode;
  onContactsClick: () => void;
  onSitesClick: () => void;
}) {
  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between text-sm min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600 min-w-0">
          {client.client_status ? (
            <span>
              <span className="text-gray-500">Status:</span>{' '}
              <span className="font-medium text-gray-900">{client.client_status}</span>
            </span>
          ) : null}
          {client.client_type ? (
            <span>
              <span className="text-gray-500">Type:</span>{' '}
              <span className="font-medium text-gray-900">{client.client_type}</span>
            </span>
          ) : null}
          {clientSince ? (
            <span>
              <span className="text-gray-500">Client since:</span>{' '}
              <span className="font-medium text-gray-900">{formatDateForDisplay(clientSince)}</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primaryContact ? (
            <span className="inline-flex items-center gap-1.5 text-gray-700 min-w-0">
              <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <button type="button" onClick={onContactsClick} className="hover:text-brand-red truncate text-left">
                {primaryContact.name}
                {primaryContact.email ? (
                  <span className="text-gray-500 font-normal"> · {primaryContact.email}</span>
                ) : null}
              </button>
            </span>
          ) : null}
          <button
            type="button"
            onClick={onContactsClick}
            className="inline-flex items-center gap-1 text-gray-600 hover:text-brand-red"
          >
            <Users className="h-3.5 w-3.5" />
            {contactsCount} contacts
          </button>
          <button
            type="button"
            onClick={onSitesClick}
            className="inline-flex items-center gap-1 text-gray-600 hover:text-brand-red"
          >
            <MapPin className="h-3.5 w-3.5" />
            {sitesCount} sites
          </button>
        </div>
      </div>

      <CustomerOverviewRelationshipSnapshot snapshot={snapshot} displayMode={displayMode} />
    </div>
  );
}

function CustomerOverviewRelationshipSnapshot({
  snapshot,
  displayMode,
}: {
  snapshot: RelationshipSnapshot;
  displayMode: OverviewDisplayMode;
}) {
  const metrics = [
    {
      label: 'Delivered (period)',
      value:
        displayMode === 'value'
          ? formatCurrency(snapshot.deliveredInPeriod)
          : `${snapshot.deliveredCount}`,
      sub: displayMode === 'value' ? `${snapshot.deliveredCount} projects` : undefined,
    },
    {
      label: 'Open pipeline',
      value:
        displayMode === 'value'
          ? formatCurrency(snapshot.pipelineValue)
          : `${snapshot.pipelineCount}`,
      sub: displayMode === 'value' ? `${snapshot.pipelineCount} opportunities` : undefined,
    },
    {
      label: 'Active WIP',
      value: displayMode === 'value' ? formatCurrency(snapshot.wipValue) : `${snapshot.wipCount}`,
      sub: displayMode === 'value' ? `${snapshot.wipCount} in progress` : undefined,
    },
    {
      label: 'Last win',
      value: snapshot.lastWinDate
        ? formatDateForDisplay(snapshot.lastWinDate.toISOString())
        : '—',
      sub:
        snapshot.lastWinName && snapshot.lastWinValue > 0 && displayMode === 'value'
          ? `${snapshot.lastWinName} · ${formatCurrency(snapshot.lastWinValue)}`
          : snapshot.lastWinName || undefined,
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{m.label}</div>
            <div className="text-lg font-semibold text-gray-900 tabular-nums truncate">{m.value}</div>
            {m.sub ? <div className="text-[11px] text-gray-500 truncate">{m.sub}</div> : null}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600 mt-3 border-t border-gray-100 pt-3">{snapshot.summaryLine}</p>
      {snapshot.nextMilestone ? (
        <p className="text-xs mt-1">
          <span className="text-gray-500">Next: </span>
          <Link
            to={`/projects/${encodeURIComponent(snapshot.nextMilestone.id)}`}
            className="font-medium text-brand-red hover:underline"
          >
            {snapshot.nextMilestone.label}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
