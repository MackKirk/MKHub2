import { useState } from 'react';
import { MapPin, User } from 'lucide-react';
import { AppBadge, AppButton, AppUserAvatar, uiCx } from '@/components/ui';
import { getProjectStatusBadgeVariant } from '@/lib/projectUi';
import {
  clusterCountLabel,
  clusterListScrollClass,
  formatClusterLocation,
  getClusterVisibleItems,
  shouldShowSeeAll,
} from './mapPopupClusterUtils';
import type { LocationGroup, MapListKind, MapPointPerson, MapViewLabels, ProjectMapPoint } from './projectMap.types';
import { PROJECT_MAP_LABELS } from '../../lib/mapViewLabels';

export const MAP_POPUP_ROOT_ID = 'mk-map-popup-root';

function statusDisplayLabel(point: ProjectMapPoint): string {
  if (point.status_label?.trim()) return point.status_label.trim();
  if (!point.status) return 'Unknown';
  return point.status.charAt(0).toUpperCase() + point.status.slice(1);
}

function DivisionChips({ names, dense }: { names: string[]; dense?: boolean }) {
  if (!names.length) return null;
  return (
    <div className={dense ? 'mt-2' : 'mt-3'}>
      {!dense ? (
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Division</div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {names.map((name) => (
          <span
            key={name}
            className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function AddressBlock({ point }: { point: ProjectMapPoint }) {
  const street = point.address_street?.trim();
  const cityLine = point.address_city_line?.trim();
  const fallback = point.address?.trim();
  if (!street && !cityLine && !fallback) return null;

  return (
    <div className="mt-3 flex gap-2">
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
      <div className="min-w-0 text-xs leading-relaxed text-gray-600">
        {street ? <div className="font-medium text-gray-800">{street}</div> : null}
        {cityLine ? <div>{cityLine}</div> : null}
        {!street && !cityLine && fallback ? <div>{fallback}</div> : null}
      </div>
    </div>
  );
}

function PersonBlock({
  label,
  person,
  dense,
}: {
  label: string;
  person?: MapPointPerson | null;
  dense?: boolean;
}) {
  return (
    <div className={dense ? 'mt-2' : 'mt-3'}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      {person?.name ? (
        <div className="flex items-center gap-2">
          <AppUserAvatar
            user={{
              name: person.name,
              profile_photo_file_id: person.avatar_file_id,
            }}
            size="sm"
          />
          <span className="text-sm text-gray-800">{person.name}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Unassigned</span>
        </div>
      )}
    </div>
  );
}

type ClusterProjectRowProps = {
  point: ProjectMapPoint;
  labels: MapViewLabels;
  listKind: MapListKind;
  onOpen: (projectId: string) => void;
};

function ClusterProjectRow({ point, labels, listKind, onOpen }: ClusterProjectRowProps) {
  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <div className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">{point.name}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs text-gray-500">{point.code}</span>
        <AppBadge variant={getProjectStatusBadgeVariant(point.status_label || point.status)} className="shrink-0">
          {statusDisplayLabel(point)}
        </AppBadge>
      </div>
      <DivisionChips names={point.division_names} dense />
      {listKind === 'opportunities' ? (
        <PersonBlock label="Estimator" person={point.estimator} dense />
      ) : (
        <>
          <PersonBlock label="Estimator" person={point.estimator} dense />
          <PersonBlock label="Project Admin" person={point.project_admin} dense />
        </>
      )}
      <AppButton
        type="button"
        variant="primary"
        size="sm"
        className="mt-3 w-full"
        onClick={() => onOpen(point.id)}
      >
        {labels.openAction}
      </AppButton>
    </div>
  );
}

function ClusterLocationHeader({ group, labels }: { group: LocationGroup; labels: MapViewLabels }) {
  const location = formatClusterLocation(group);
  const countLabel = clusterCountLabel(group.projects.length, labels);
  const primaryLine = location.street || location.fullLine;
  const secondaryParts = [
    location.street ? location.cityLine : null,
    countLabel,
  ].filter(Boolean);

  return (
    <div className="flex gap-2 border-b border-gray-100 pb-2.5">
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
      <div className="min-w-0 text-xs leading-relaxed text-gray-600">
        {primaryLine ? (
          <div className="font-medium text-gray-800">{primaryLine}</div>
        ) : (
          <div className="font-medium text-gray-800">{countLabel}</div>
        )}
        {primaryLine && secondaryParts.length > 0 ? (
          <div>{secondaryParts.join(' · ')}</div>
        ) : null}
      </div>
    </div>
  );
}

type SinglePopupProps = {
  point: ProjectMapPoint;
  labels: MapViewLabels;
  listKind?: MapListKind;
  onOpen: (projectId: string) => void;
};

export function ProjectMapSinglePopup({ point, labels, listKind = 'projects', onOpen }: SinglePopupProps) {
  return (
    <div className="inline-block w-max max-w-[min(280px,calc(100vw-48px))] p-1 pr-6">
      <div>
        <div className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">{point.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs text-gray-500">{point.code}</span>
          <AppBadge variant={getProjectStatusBadgeVariant(point.status_label || point.status)} className="shrink-0">
            {statusDisplayLabel(point)}
          </AppBadge>
        </div>
        {point.customer_name ? (
          <div className="mt-1 text-sm text-gray-700">{point.customer_name}</div>
        ) : null}
      </div>

      <AddressBlock point={point} />
      <DivisionChips names={point.division_names} />
      {listKind === 'opportunities' ? (
        <PersonBlock label="Estimator" person={point.estimator} />
      ) : (
        <>
          <PersonBlock label="Estimator" person={point.estimator} />
          <PersonBlock label="Project Admin" person={point.project_admin} />
        </>
      )}

      <AppButton
        type="button"
        variant="primary"
        size="sm"
        className="mt-3 w-full"
        onClick={() => onOpen(point.id)}
      >
        {labels.openAction}
      </AppButton>
    </div>
  );
}

type ClusterPopupProps = {
  group: LocationGroup;
  labels: MapViewLabels;
  listKind?: MapListKind;
  onOpen: (projectId: string) => void;
};

export function ProjectMapClusterPopup({ group, labels, listKind = 'projects', onOpen }: ClusterPopupProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = getClusterVisibleItems(group.projects, expanded);
  const scrollClass = clusterListScrollClass(group.projects.length, expanded);
  const showSeeAll = shouldShowSeeAll(group.projects.length, expanded);

  return (
    <div className="inline-block w-max max-w-[min(320px,calc(100vw-48px))] p-1 pr-6">
      <ClusterLocationHeader group={group} labels={labels} />
      <div className={uiCx(scrollClass)}>
        {visibleItems.map((point) => (
          <ClusterProjectRow
            key={point.id}
            point={point}
            labels={labels}
            listKind={listKind}
            onOpen={onOpen}
          />
        ))}
      </div>
      {showSeeAll ? (
        <AppButton
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full text-xs"
          onClick={() => setExpanded(true)}
        >
          {labels.seeAllAtLocation(group.projects.length)}
        </AppButton>
      ) : null}
    </div>
  );
}

type PopupProps = {
  group: LocationGroup;
  labels?: MapViewLabels;
  listKind?: MapListKind;
  onOpen: (projectId: string) => void;
};

export function ProjectMapPopup({ group, labels = PROJECT_MAP_LABELS, listKind = 'projects', onOpen }: PopupProps) {
  if (group.projects.length === 1) {
    return <ProjectMapSinglePopup point={group.projects[0]} labels={labels} listKind={listKind} onOpen={onOpen} />;
  }
  return <ProjectMapClusterPopup group={group} labels={labels} listKind={listKind} onOpen={onOpen} />;
}

/** Shell div for React mount in Google InfoWindow. */
export function buildMapPopupHtml(): string {
  return `<div id="${MAP_POPUP_ROOT_ID}"></div>`;
}
