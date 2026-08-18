import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Maximize2, Star, Users, ZoomIn, ZoomOut } from 'lucide-react';
import { withFileAccessToken } from '@/lib/api';
import {
  buildUserOrgForest,
  collectOrgNodeIdsWithChildren,
  countOrgForestPeople,
  countOrgNodeReports,
  filterOrgForestByQuery,
  orgAncestorIdsToExpand,
  personMatchesOrgQuery,
  type OrgPerson,
  type OrgTreeNode,
} from '@/lib/userOrgTree';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppSectionHeader,
  AppTooltip,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.12;
const PAN_CLICK_SLOP_PX = 6;

type Camera = { x: number; y: number; zoom: number };

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function OrgPersonCard({
  node,
  canViewUserDetails,
  searchQuery,
  expanded,
  ignoreCardClickRef,
  onToggle,
}: {
  node: OrgTreeNode;
  canViewUserDetails: boolean;
  searchQuery: string;
  expanded: boolean;
  ignoreCardClickRef: MutableRefObject<boolean>;
  onToggle: (id: string) => void;
}) {
  const navigate = useNavigate();
  const hasChildren = node.children.length > 0;
  const isAdmin = (node.roles || []).some((role) => String(role || '').toLowerCase() === 'admin');
  const isMatch = Boolean(searchQuery.trim()) && personMatchesOrgQuery(node, searchQuery);
  const isInactive = node.is_active === false;
  const teamSize = countOrgNodeReports(node);
  const detailPath = `/users/${encodeURIComponent(node.id)}`;
  const name = node.name || node.username;
  const reportsLabel =
    node.children.length === 1 ? '1 report' : `${node.children.length} reports`;
  const teamLabel =
    teamSize > node.children.length ? `${reportsLabel} · ${teamSize} total` : reportsLabel;

  const openDetail = () => {
    if (ignoreCardClickRef.current) return;
    if (canViewUserDetails) navigate(detailPath);
  };

  return (
    <div className="relative flex w-56 flex-col items-center">
      <div
        data-org-card="true"
        className={uiCx(
          uiRadius.card,
          uiBorders.subtle,
          uiShadows.card,
          uiColors.surface,
          'w-full overflow-hidden text-center transition-shadow',
          canViewUserDetails && 'cursor-pointer hover:border-gray-300 hover:shadow-md',
          isMatch && 'border-brand-red bg-red-50 ring-2 ring-brand-red/15',
          isInactive && 'opacity-80',
        )}
        role={canViewUserDetails ? 'button' : undefined}
        tabIndex={canViewUserDetails ? 0 : undefined}
        onClick={canViewUserDetails ? openDetail : undefined}
        onKeyDown={
          canViewUserDetails
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openDetail();
                }
              }
            : undefined
        }
      >
        <div className="flex flex-col items-center px-3 pb-3 pt-4">
          <div className="relative shrink-0">
            {node.profile_photo_file_id ? (
              <img
                src={withFileAccessToken(`/files/${node.profile_photo_file_id}/thumbnail?w=128`)}
                className={uiCx(
                  'h-14 w-14 object-cover ring-2 ring-white',
                  uiRadius.badge,
                  uiShadows.card,
                  isInactive && 'grayscale',
                )}
                loading="lazy"
                alt=""
                draggable={false}
              />
            ) : (
              <img
                src="/ui/assets/placeholders/user.png"
                className={uiCx('h-14 w-14 object-cover ring-2 ring-white', uiRadius.badge, uiShadows.card)}
                loading="lazy"
                alt=""
                draggable={false}
              />
            )}
            {isAdmin ? (
              <AppTooltip content="Administrator">
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-yellow-400">
                  <Star className="h-2.5 w-2.5 fill-yellow-800 text-yellow-800" />
                </span>
              </AppTooltip>
            ) : null}
            <span
              className={uiCx(
                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white',
                isInactive ? 'bg-gray-400' : 'bg-emerald-500',
              )}
              title={isInactive ? 'Inactive' : 'Active'}
            />
          </div>
          <div className={uiCx(uiTypography.sectionTitle, 'mt-2.5 w-full truncate px-1 text-xs')} title={name}>
            {name}
          </div>
          <div className={uiCx(uiTypography.helper, 'mt-0.5 min-h-[1rem] w-full truncate px-1')} title={node.job_title || ''}>
            {node.job_title || '—'}
          </div>
          {hasChildren ? (
            <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-medium text-gray-500">
              <Users className="h-3 w-3" aria-hidden />
              <span>{teamLabel}</span>
            </div>
          ) : isInactive ? (
            <div className="mt-2">
              <AppBadge variant="danger" className="normal-case !tracking-normal">
                Inactive
              </AppBadge>
            </div>
          ) : null}
        </div>
      </div>
      {hasChildren ? (
        <button
          type="button"
          className={uiCx(
            'relative z-10 -mb-2 mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50',
            expanded ? 'border-brand-red text-brand-red' : 'border-gray-200',
          )}
          aria-label={expanded ? `Hide reports of ${name}` : `Show reports of ${name}`}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ChevronDown
            className={uiCx('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );
}

function OrgBranch({
  node,
  canViewUserDetails,
  expandedIds,
  searchQuery,
  ignoreCardClickRef,
  onToggle,
}: {
  node: OrgTreeNode;
  canViewUserDetails: boolean;
  expandedIds: Set<string>;
  searchQuery: string;
  ignoreCardClickRef: MutableRefObject<boolean>;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && expandedIds.has(node.id);

  return (
    <div className="flex min-w-[14.5rem] flex-col items-center">
      <OrgPersonCard
        node={node}
        canViewUserDetails={canViewUserDetails}
        searchQuery={searchQuery}
        expanded={expanded}
        ignoreCardClickRef={ignoreCardClickRef}
        onToggle={onToggle}
      />
      {expanded ? (
        <div className="flex w-full flex-col items-center">
          <div className="h-5 w-px bg-gray-300" aria-hidden />
          <ul className="flex flex-nowrap justify-center gap-x-5">
            {node.children.map((child) => (
              <li key={child.id} className="flex flex-col items-center">
                <div className="h-4 w-px bg-gray-300" aria-hidden />
                <OrgBranch
                  node={child}
                  canViewUserDetails={canViewUserDetails}
                  expandedIds={expandedIds}
                  searchQuery={searchQuery}
                  ignoreCardClickRef={ignoreCardClickRef}
                  onToggle={onToggle}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function zoomAroundPoint(camera: Camera, nextZoom: number, originX: number, originY: number): Camera {
  const zoom = clampZoom(nextZoom);
  const contentX = (originX - camera.x) / camera.zoom;
  const contentY = (originY - camera.y) / camera.zoom;
  return {
    zoom,
    x: originX - contentX * zoom,
    y: originY - contentY * zoom,
  };
}

export function UserOrgTreeView({
  people,
  searchQuery,
  canViewUserDetails,
}: {
  people: OrgPerson[];
  searchQuery: string;
  canViewUserDetails: boolean;
}) {
  const forest = useMemo(() => buildUserOrgForest(people), [people]);
  const visible = useMemo(() => filterOrgForestByQuery(forest, searchQuery), [forest, searchQuery]);
  const visibleCount = countOrgForestPeople(visible);
  const peopleKey = useMemo(
    () => people.map((person) => `${person.id}:${person.manager_user_id || ''}`).join(','),
    [people],
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const ignoreCardClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const shouldCenterRef = useRef(true);

  useLayoutEffect(() => {
    shouldCenterRef.current = true;
    setExpandedIds(new Set(forest.teams.map((node) => node.id)));
    // Reset when the org membership or reporting lines change, not on every fetch identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey]);

  const centerContent = useCallback((zoom = 1) => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const nextZoom = clampZoom(zoom);
    setCamera({
      zoom: nextZoom,
      x: (viewport.clientWidth - content.offsetWidth * nextZoom) / 2,
      y: 36,
    });
  }, []);

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const pad = 64;
    const width = Math.max(content.offsetWidth, 1);
    const height = Math.max(content.offsetHeight, 1);
    const nextZoom = clampZoom(
      Math.min((viewport.clientWidth - pad) / width, (viewport.clientHeight - pad) / height),
    );
    setCamera({
      zoom: nextZoom,
      x: (viewport.clientWidth - width * nextZoom) / 2,
      y: Math.max(24, (viewport.clientHeight - height * nextZoom) / 2),
    });
  }, []);

  useLayoutEffect(() => {
    if (!shouldCenterRef.current) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        centerContent(1);
        shouldCenterRef.current = false;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [peopleKey, expandedIds, centerContent]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const ancestorIds = orgAncestorIdsToExpand([...visible.teams, ...visible.unassigned], searchQuery);
    if (ancestorIds.size === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      ancestorIds.forEach((id) => next.add(id));
      return next;
    });
  }, [searchQuery, visible]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const originX = event.clientX - rect.left;
      const originY = event.clientY - rect.top;
      const factor = event.deltaY > 0 ? 1 - ZOOM_STEP : 1 + ZOOM_STEP;
      setCamera((prev) => zoomAroundPoint(prev, prev.zoom * factor, originX, originY));
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [visibleCount]);

  const toggleNode = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(collectOrgNodeIdsWithChildren([...visible.teams, ...visible.unassigned])));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const zoomBy = (direction: 1 | -1) => {
    const viewport = viewportRef.current;
    const originX = viewport ? viewport.clientWidth / 2 : 0;
    const originY = viewport ? viewport.clientHeight / 2 : 0;
    setCamera((prev) => zoomAroundPoint(prev, prev.zoom * (direction > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP), originX, originY));
  };

  const resetZoom = () => centerContent(1);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-org-zoom], button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cameraRef.current.x,
      originY: cameraRef.current.y,
      moved: false,
    };
    setIsDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < PAN_CLICK_SLOP_PX * PAN_CLICK_SLOP_PX) return;
    drag.moved = true;
    ignoreCardClickRef.current = true;
    setCamera((prev) => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }));
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    dragRef.current = null;
    setIsDragging(false);
    if (moved) {
      ignoreCardClickRef.current = true;
      window.setTimeout(() => {
        ignoreCardClickRef.current = false;
      }, 0);
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
  };

  if (visibleCount === 0) {
    return (
      <AppEmptyState
        title={searchQuery.trim() ? 'No people match this search in the org chart.' : 'No people to show in the org chart.'}
        description="Hierarchy follows each employee’s supervisor. Assign a supervisor on the user profile to place someone in the tree."
        className="border-0 bg-transparent p-0 shadow-none"
      />
    );
  }

  return (
    <div>
      <div className={uiCx(uiSpacing.cardPadding, 'flex flex-wrap items-start justify-between gap-3 border-b border-gray-100')}>
        <AppSectionHeader
          title="Organization"
          description="Drag to pan the chart, scroll to zoom. Expand a person to see who reports to them."
        />
        <div className={uiLayout.actionsRow}>
          <AppButton type="button" variant="ghost" size="sm" onClick={expandAll}>
            Expand all
          </AppButton>
          <AppButton type="button" variant="ghost" size="sm" onClick={collapseAll}>
            Collapse all
          </AppButton>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={uiCx(
          'relative h-[min(72vh,760px)] overflow-hidden select-none',
          'bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:18px_18px] bg-gray-50',
          isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ touchAction: 'none' }}
        tabIndex={0}
        role="application"
        aria-label="Organization chart canvas. Drag to pan, scroll to zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomBy(1);
          } else if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            zoomBy(-1);
          } else if (event.key === '0') {
            event.preventDefault();
            resetZoom();
          } else if (event.key === 'f' || event.key === 'F') {
            event.preventDefault();
            fitToView();
          }
        }}
      >
        <div
          ref={contentRef}
          className="absolute left-0 top-0 inline-flex flex-col items-center gap-10 px-8 py-6 will-change-transform"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {visible.teams.length > 0 ? (
            <div className="flex flex-nowrap items-start justify-center gap-x-10">
              {visible.teams.map((node) => (
                <OrgBranch
                  key={node.id}
                  node={node}
                  canViewUserDetails={canViewUserDetails}
                  expandedIds={expandedIds}
                  searchQuery={searchQuery}
                  ignoreCardClickRef={ignoreCardClickRef}
                  onToggle={toggleNode}
                />
              ))}
            </div>
          ) : null}

          {visible.unassigned.length > 0 ? (
            <div className="w-full border-t border-gray-200 pt-6">
              <div className="mb-4 text-center">
                <h3 className={uiTypography.sectionTitle}>No supervisor</h3>
                <p className={uiTypography.helper}>People without a supervisor and with no direct reports.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                {visible.unassigned.map((node) => (
                  <OrgPersonCard
                    key={node.id}
                    node={node}
                    canViewUserDetails={canViewUserDetails}
                    searchQuery={searchQuery}
                    expanded={false}
                    ignoreCardClickRef={ignoreCardClickRef}
                    onToggle={toggleNode}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div
          data-org-zoom="true"
          className={uiCx(
            'absolute bottom-3 right-3 flex overflow-hidden bg-white shadow-sm',
            uiRadius.control,
            uiBorders.subtle,
          )}
        >
          <AppTooltip content="Zoom out">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="!rounded-none !px-2.5"
              aria-label="Zoom out"
              onClick={() => zoomBy(-1)}
              disabled={camera.zoom <= MIN_ZOOM}
            >
              <ZoomOut className="h-4 w-4" />
            </AppButton>
          </AppTooltip>
          <AppTooltip content="Reset to 100%">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="!rounded-none min-w-[3.25rem] !px-2 tabular-nums"
              aria-label="Reset zoom"
              onClick={resetZoom}
            >
              {Math.round(camera.zoom * 100)}%
            </AppButton>
          </AppTooltip>
          <AppTooltip content="Zoom in">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="!rounded-none !px-2.5"
              aria-label="Zoom in"
              onClick={() => zoomBy(1)}
              disabled={camera.zoom >= MAX_ZOOM}
            >
              <ZoomIn className="h-4 w-4" />
            </AppButton>
          </AppTooltip>
          <AppTooltip content="Fit chart in view">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="!rounded-none !border-l !border-gray-200 !px-2.5"
              aria-label="Fit chart in view"
              onClick={fitToView}
            >
              <Maximize2 className="h-4 w-4" />
            </AppButton>
          </AppTooltip>
        </div>
      </div>
    </div>
  );
}
