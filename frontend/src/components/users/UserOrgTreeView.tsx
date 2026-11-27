import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, FoldVertical, Hand, Maximize2, Mouse, Printer, Search, Star, UnfoldVertical, UserRound, ZoomIn, ZoomOut } from 'lucide-react';
import { withFileAccessToken } from '@/lib/api';
import {
  buildUserOrgForest,
  collectOrgNodeIdsWithChildren,
  countOrgForestPeople,
  countOrgNodeReports,
  focusOrgForestOnQuery,
  personMatchesOrgQuery,
  type OrgPerson,
  type OrgTreeNode,
} from '@/lib/userOrgTree';
import {
  AppButton,
  AppEmptyState,
  AppTooltip,
  uiBorders,
  uiCx,
  uiRadius,
  uiShadows,
  uiTypography,
} from '@/components/ui';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.12;
const PAN_CLICK_SLOP_PX = 6;
/** Leaves past this count wrap onto extra rows so a wide team stays on screen. */
const LEAF_ROW_SIZE = 4;
const ROW_GAP_PX = 16;
const SLOT_PAD_X_PX = 8;
/** w-28 name card. The side bus meets the center of the first card. */
const NAMES_CARD_PX = 112;
/** h-10 initials mark. */
const INITIALS_CARD_PX = 40;
/** Space kept inside a wrapped team so its side line cannot run under the sibling on the left. */
const BUS_GUTTER_PX = 18;
const LINE = 'bg-slate-500';
const LINE_BORDER = 'border-slate-500';
const DENSITY_STORAGE_KEY = 'users-org-card-density';
/** Landscape letter/A4 content box, after page margin and the print header. */
const PRINT_CHART_MAX_W = 980;
const PRINT_CHART_MAX_H = 640;
const ORG_PRINT_CSS = `
@media print {
  @page { size: landscape; margin: 8mm; }
  html, body { background: #fff !important; height: auto !important; }
  body > *:not(#org-print-root) { display: none !important; }
  #org-print-root {
    display: block !important;
    position: static !important;
    opacity: 1 !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #org-print-root * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

const ORG_LEGEND = [
  { icon: Hand, label: 'Drag to pan' },
  { icon: Mouse, label: 'Scroll to zoom' },
  { icon: UnfoldVertical, label: 'Click a number to expand' },
  { icon: UserRound, label: 'Click a person to open' },
  { icon: Search, label: 'Search shows the chain' },
] as const;

const canvasChrome = uiCx(
  'bg-white shadow-sm',
  uiRadius.control,
  uiBorders.subtle,
);

type OrgDensity = 'names' | 'initials';

function cardAnchorPx(density: OrgDensity) {
  const width = density === 'initials' ? INITIALS_CARD_PX : NAMES_CARD_PX;
  return SLOT_PAD_X_PX + width / 2;
}

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

type Camera = { x: number; y: number; zoom: number };

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function OrgPersonCard({
  node,
  canViewUserDetails,
  searchQuery,
  density,
  forPrint = false,
}: {
  node: OrgTreeNode;
  canViewUserDetails: boolean;
  searchQuery: string;
  density: OrgDensity;
  forPrint?: boolean;
}) {
  const navigate = useNavigate();
  const isAdmin = (node.roles || []).some((role) => String(role || '').toLowerCase() === 'admin');
  const isMatch = Boolean(searchQuery.trim()) && personMatchesOrgQuery(node, searchQuery);
  const isInactive = node.is_active === false;
  const detailPath = `/users/${encodeURIComponent(node.id)}`;
  const name = node.name || node.username;
  const initials = initialsFromName(name);
  const openDetail = () => {
    if (canViewUserDetails) navigate(detailPath);
  };

  const photo = node.profile_photo_file_id ? (
    <img
      src={withFileAccessToken(`/files/${node.profile_photo_file_id}/thumbnail?w=96`)}
      className={uiCx('h-9 w-9 object-cover', uiRadius.badge, isInactive && 'grayscale')}
      loading="lazy"
      alt=""
      draggable={false}
    />
  ) : (
    <img
      src="/ui/assets/placeholders/user.png"
      className={uiCx('h-9 w-9 object-cover', uiRadius.badge)}
      loading="lazy"
      alt=""
      draggable={false}
    />
  );

  const status = (
    <>
      {isAdmin ? (
        <AppTooltip content="Administrator">
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-yellow-400">
            <Star className="h-2 w-2 fill-yellow-800 text-yellow-800" />
          </span>
        </AppTooltip>
      ) : null}
      <span
        className={uiCx(
          'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white',
          isInactive ? 'bg-gray-400' : 'bg-emerald-500',
        )}
        title={isInactive ? 'Inactive' : 'Active'}
      />
    </>
  );

  const cardProps = {
    'data-org-card': 'true' as const,
    'data-org-person': node.id,
    role: canViewUserDetails ? ('button' as const) : undefined,
    tabIndex: canViewUserDetails ? 0 : undefined,
    onKeyDown: canViewUserDetails
      ? (event: ReactKeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openDetail();
          }
        }
      : undefined,
  };

  if (density === 'initials') {
    const mark = (
      <div
        {...cardProps}
        className={uiCx(
          'relative flex h-10 w-10 items-center justify-center rounded-full border bg-white text-[11px] font-semibold text-gray-800 shadow-sm',
          canViewUserDetails && !forPrint && 'cursor-pointer hover:border-gray-400',
          isMatch ? 'border-brand-red bg-red-50 text-brand-red ring-2 ring-brand-red/20' : 'border-gray-300',
          isInactive && 'opacity-80',
        )}
        aria-label={name}
      >
        {initials}
        {status}
      </div>
    );
    if (forPrint) return mark;
    return (
      <AppTooltip
        wrap
        placement="top"
        content={
          <span className="flex items-center gap-2">
            {photo}
            <span className="block min-w-0 text-left">
              <span className="block font-semibold">{name}</span>
              <span className="mt-0.5 block text-xs font-normal text-gray-200">{node.job_title || '—'}</span>
            </span>
          </span>
        }
      >
        {mark}
      </AppTooltip>
    );
  }

  return (
    <div
      {...cardProps}
      className={uiCx(
        uiRadius.control,
        uiShadows.card,
        'relative z-10 flex w-28 shrink-0 flex-col items-center border bg-white px-1.5 py-2 text-center transition-shadow',
        canViewUserDetails && 'cursor-pointer hover:border-gray-400 hover:shadow-md',
        isMatch ? 'border-brand-red bg-red-50 ring-2 ring-brand-red/15' : 'border-gray-300',
        isInactive && 'opacity-80',
      )}
      title={[name, node.job_title].filter(Boolean).join(' · ')}
    >
      <div className="relative">
        {photo}
        {status}
      </div>
      <div className="mt-1.5 w-full truncate text-xs font-semibold leading-tight text-gray-900">{name}</div>
      <div className="w-full truncate text-[10px] leading-tight text-gray-500">{node.job_title || '—'}</div>
    </div>
  );
}

function OrgElbow({ index, count }: { index: number; count: number }) {
  const isFirst = index === 0;
  const isLast = index === count - 1;
  const isEnd = isFirst || isLast;

  return (
    <>
      {!isEnd ? <span className={uiCx('pointer-events-none absolute left-0 top-0 z-0 h-0.5 w-full', LINE)} aria-hidden /> : null}
      {isFirst ? (
        <>
          <span
            className={uiCx('pointer-events-none absolute top-0 z-0 h-0.5', LINE)}
            style={{ left: 'calc(50% + 8px)', width: 'calc(50% - 8px)' }}
            aria-hidden
          />
          <span
            className={uiCx('pointer-events-none absolute top-0 z-0 h-2.5 w-2.5 rounded-tl-lg border-l-2 border-t-2', LINE_BORDER)}
            style={{ left: 'calc(50% - 1px)' }}
            aria-hidden
          />
        </>
      ) : null}
      {isLast ? (
        <>
          <span
            className={uiCx('pointer-events-none absolute left-0 top-0 z-0 h-0.5', LINE)}
            style={{ width: 'calc(50% - 8px)' }}
            aria-hidden
          />
          <span
            className={uiCx('pointer-events-none absolute top-0 z-0 h-2.5 w-2.5 rounded-tr-lg border-r-2 border-t-2', LINE_BORDER)}
            style={{ left: 'calc(50% - 9px)' }}
            aria-hidden
          />
        </>
      ) : null}
      <span
        className={uiCx('pointer-events-none absolute left-1/2 z-0 w-0.5 -translate-x-1/2', LINE)}
        style={isEnd ? { top: 8, height: 11 } : { top: 0, height: 19 }}
        aria-hidden
      />
    </>
  );
}

function OrgToggle({
  expanded,
  node,
  onToggle,
}: {
  expanded: boolean;
  node: OrgTreeNode;
  onToggle: (id: string) => void;
}) {
  const direct = node.children.length;
  const teamSize = countOrgNodeReports(node);
  const name = node.name || node.username;
  const title =
    teamSize > direct
      ? `${direct} direct ${direct === 1 ? 'report' : 'reports'}, ${teamSize} in the team`
      : direct === 1
        ? '1 direct report'
        : `${direct} direct reports`;

  return (
    <div className="flex flex-col items-center">
      <span className={uiCx('h-3 w-0.5', LINE)} aria-hidden />
      <button
        type="button"
        className={uiCx(
          'relative z-20 -mt-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border bg-white px-1 text-[10px] font-semibold leading-none shadow-sm',
          expanded ? 'border-brand-red text-brand-red' : 'border-slate-300 text-slate-600 hover:border-slate-400',
        )}
        aria-label={expanded ? `Hide reports of ${name}` : `Show reports of ${name}`}
        aria-expanded={expanded}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(node.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 rotate-180" aria-hidden />
        ) : (
          <span>{direct > 99 ? '99+' : direct}</span>
        )}
      </button>
      {expanded ? <span className={uiCx('relative z-0 -mt-1.5 mb-[-2px] h-3 w-0.5', LINE)} aria-hidden /> : null}
    </div>
  );
}

type OrgBranchProps = {
  node: OrgTreeNode;
  canViewUserDetails: boolean;
  expandedIds: Set<string>;
  searchQuery: string;
  onToggle: (id: string) => void;
  density: OrgDensity;
  forPrint?: boolean;
};

/** Split a wide leaf row into balanced rows, widest first so the parent stays centered. */
function wrapLeafRows(nodes: OrgTreeNode[]): OrgTreeNode[][] {
  const rowCount = Math.ceil(nodes.length / LEAF_ROW_SIZE);
  const base = Math.floor(nodes.length / rowCount);
  const extra = nodes.length % rowCount;
  const rows: OrgTreeNode[][] = [];
  let index = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const size = base + (row < extra ? 1 : 0);
    rows.push(nodes.slice(index, index + size));
    index += size;
  }
  return rows;
}

function shouldWrapLeaves(nodes: OrgTreeNode[]): boolean {
  return nodes.length > LEAF_ROW_SIZE && nodes.every((node) => node.children.length === 0);
}

function OrgRowBus({ isLast, anchorPx }: { isLast: boolean; anchorPx: number }) {
  return (
    <>
      <span
        className={uiCx('pointer-events-none absolute top-0 z-0 h-0.5', LINE)}
        style={{ left: -BUS_GUTTER_PX, width: BUS_GUTTER_PX + anchorPx }}
        aria-hidden
      />
      {isLast ? null : (
        <span
          className={uiCx('pointer-events-none absolute z-0 w-0.5', LINE)}
          style={{ left: -BUS_GUTTER_PX, top: 0, height: `calc(100% + ${ROW_GAP_PX + 2}px)` }}
          aria-hidden
        />
      )}
    </>
  );
}

function OrgLevel({
  nodes,
  forceDrop = false,
  canViewUserDetails,
  expandedIds,
  searchQuery,
  onToggle,
  density,
  forPrint = false,
}: {
  nodes: OrgTreeNode[];
  forceDrop?: boolean;
} & Omit<OrgBranchProps, 'node'>) {
  const count = nodes.length;
  const showRail = count > 1;
  const showDrop = showRail || forceDrop;

  return (
    <div className="flex items-start">
      {nodes.map((node, index) => (
        <div
          key={node.id}
          className={uiCx('relative flex w-max flex-col items-center px-2', showDrop && 'pt-[18px]')}
        >
          {showRail ? <OrgElbow index={index} count={count} /> : null}
          {forceDrop && count === 1 ? (
            <span className={uiCx('pointer-events-none absolute left-1/2 top-0 z-0 h-[19px] w-0.5 -translate-x-1/2', LINE)} aria-hidden />
          ) : null}
          <OrgBranch
            node={node}
            canViewUserDetails={canViewUserDetails}
            expandedIds={expandedIds}
            searchQuery={searchQuery}
            onToggle={onToggle}
            density={density}
            forPrint={forPrint}
          />
        </div>
      ))}
    </div>
  );
}

function OrgChildren(props: { nodes: OrgTreeNode[] } & Omit<OrgBranchProps, 'node'>) {
  const { nodes, ...branchProps } = props;
  if (!shouldWrapLeaves(nodes)) return <OrgLevel nodes={nodes} {...branchProps} />;

  const rows = wrapLeafRows(nodes);
  const anchorPx = cardAnchorPx(branchProps.density);
  return (
    <div
      className="flex flex-col items-start"
      style={{ gap: ROW_GAP_PX, paddingLeft: BUS_GUTTER_PX, paddingRight: BUS_GUTTER_PX }}
    >
      {rows.map((row, index) => (
        <div key={row[0].id} className="relative">
          <OrgRowBus isLast={index === rows.length - 1} anchorPx={anchorPx} />
          <OrgLevel nodes={row} forceDrop={row.length === 1} {...branchProps} />
        </div>
      ))}
    </div>
  );
}

function OrgBranch({
  node,
  canViewUserDetails,
  expandedIds,
  searchQuery,
  onToggle,
  density,
  forPrint = false,
}: OrgBranchProps) {
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && expandedIds.has(node.id);

  return (
    <div className="flex w-max flex-col items-center">
      <OrgPersonCard
        node={node}
        canViewUserDetails={forPrint ? false : canViewUserDetails}
        searchQuery={searchQuery}
        density={density}
        forPrint={forPrint}
      />
      {hasChildren ? (
        forPrint ? (
          <span className={uiCx('h-6 w-0.5', LINE)} aria-hidden />
        ) : (
          <OrgToggle expanded={expanded} node={node} onToggle={onToggle} />
        )
      ) : null}
      {expanded ? (
        <OrgChildren
          nodes={node.children}
          canViewUserDetails={canViewUserDetails}
          expandedIds={expandedIds}
          searchQuery={searchQuery}
          onToggle={onToggle}
          density={density}
          forPrint={forPrint}
        />
      ) : null}
    </div>
  );
}

function OrgForestLayout({
  teams,
  unassigned,
  canViewUserDetails,
  expandedIds,
  searchQuery,
  onToggle,
  density,
  forPrint = false,
}: {
  teams: OrgTreeNode[];
  unassigned: OrgTreeNode[];
  canViewUserDetails: boolean;
  expandedIds: Set<string>;
  searchQuery: string;
  onToggle: (id: string) => void;
  density: OrgDensity;
  forPrint?: boolean;
}) {
  return (
    <>
      {teams.length > 0 ? (
        <div className="flex flex-nowrap items-start justify-center gap-x-6">
          {teams.map((node) => (
            <OrgBranch
              key={node.id}
              node={node}
              canViewUserDetails={canViewUserDetails}
              expandedIds={expandedIds}
              searchQuery={searchQuery}
              onToggle={onToggle}
              density={density}
              forPrint={forPrint}
            />
          ))}
        </div>
      ) : null}
      {unassigned.length > 0 ? (
        <div className="w-full border-t border-gray-200 pt-6">
          <div className="mb-4 text-center">
            <h3 className={uiTypography.sectionTitle}>No supervisor</h3>
            <p className={uiTypography.helper}>People without a supervisor and with no direct reports.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {unassigned.map((node) => (
              <OrgPersonCard
                key={node.id}
                node={node}
                canViewUserDetails={forPrint ? false : canViewUserDetails}
                searchQuery={searchQuery}
                density={density}
                forPrint={forPrint}
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function printSheetSubtitle(searchQuery: string, count: number) {
  const date = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const people = `${count} ${count === 1 ? 'person' : 'people'}`;
  const query = searchQuery.trim();
  return query ? `${date} · Search “${query}” · ${people}` : `${date} · ${people}`;
}

function waitForPrintImages(root: HTMLElement) {
  const imgs = [...root.querySelectorAll('img')];
  const pending = imgs.map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) {
          resolve();
          return;
        }
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      }),
  );
  return Promise.race([
    Promise.all(pending),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1500);
    }),
  ]);
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
  const visible = useMemo(() => focusOrgForestOnQuery(forest, searchQuery), [forest, searchQuery]);
  const visibleCount = countOrgForestPeople(visible);
  const peopleKey = useMemo(
    () => people.map((person) => `${person.id}:${person.manager_user_id || ''}`).join(','),
    [people],
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [density, setDensity] = useState<OrgDensity>(() => {
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
    return saved === 'initials' ? 'initials' : 'names';
  });
  const prevSearchRef = useRef('');
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const navigate = useNavigate();
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const printRootRef = useRef<HTMLDivElement>(null);
  const printExpandedIds = useMemo(
    () => new Set(collectOrgNodeIdsWithChildren([...visible.teams, ...visible.unassigned])),
    [visible],
  );
  const pressPersonIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (!printOpen) return;
    let cancelled = false;
    const onDone = () => {
      window.removeEventListener('afterprint', onDone);
      if (!cancelled) setPrintOpen(false);
    };
    const run = async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      const root = printRootRef.current;
      if (cancelled || !root) return;
      await waitForPrintImages(root);
      if (cancelled) return;
      const chart = root.querySelector<HTMLElement>('[data-org-print-chart]');
      const frame = root.querySelector<HTMLElement>('[data-org-print-frame]');
      if (!chart || !frame) return;
      const width = chart.offsetWidth;
      const height = chart.offsetHeight;
      const scale = Math.min(1, PRINT_CHART_MAX_W / Math.max(width, 1), PRINT_CHART_MAX_H / Math.max(height, 1));
      chart.style.transform = `scale(${scale})`;
      frame.style.width = `${Math.ceil(width * scale)}px`;
      frame.style.height = `${Math.ceil(height * scale)}px`;
      window.addEventListener('afterprint', onDone);
      window.print();
    };
    void run();
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', onDone);
    };
  }, [printOpen]);

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
    shouldCenterRef.current = true;
  }, [density]);

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
  }, [peopleKey, expandedIds, density, centerContent]);

  useEffect(() => {
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  useEffect(() => {
    const query = searchQuery.trim();
    const previous = prevSearchRef.current;
    prevSearchRef.current = query;
    if (!query) {
      if (!previous) return;
      setExpandedIds(new Set(forest.teams.map((node) => node.id)));
      shouldCenterRef.current = true;
      return;
    }
    setExpandedIds(new Set(collectOrgNodeIdsWithChildren([...visible.teams, ...visible.unassigned])));
    shouldCenterRef.current = true;
  }, [searchQuery, visible, forest.teams]);

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
    const person = target.closest('[data-org-person]');
    pressPersonIdRef.current = person?.getAttribute('data-org-person') ?? null;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cameraRef.current.x,
      originY: cameraRef.current.y,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < PAN_CLICK_SLOP_PX * PAN_CLICK_SLOP_PX) return;
    if (!drag.moved) setIsDragging(true);
    drag.moved = true;
    pressPersonIdRef.current = null;
    setCamera((prev) => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }));
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>, openPerson: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const personId = pressPersonIdRef.current;
    const moved = drag.moved;
    dragRef.current = null;
    pressPersonIdRef.current = null;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    if (openPerson && !moved && personId && canViewUserDetails) {
      navigate(`/users/${encodeURIComponent(personId)}`);
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
    <>
    <div
        ref={viewportRef}
        className={uiCx(
          'relative h-[min(72vh,760px)] overflow-hidden select-none',
          'bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:18px_18px] bg-gray-50',
          isDragging ? 'cursor-grabbing [&_*]:cursor-grabbing' : 'cursor-grab',
        )}
        style={{ touchAction: 'none' }}
        tabIndex={0}
        role="application"
        aria-label="Organization chart canvas. Drag to pan, scroll to zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endPan(event, true)}
        onPointerCancel={(event) => endPan(event, false)}
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
          data-org-zoom="true"
          className={uiCx('absolute left-3 top-3 z-20 px-2.5 py-2', canvasChrome)}
          aria-label="Chart actions"
        >
          <ul className="flex flex-col gap-1.5">
            {ORG_LEGEND.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-[11px] font-medium leading-none text-gray-600">
                <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div data-org-zoom="true" className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <div className={uiCx('flex overflow-hidden', canvasChrome)}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              onClick={() => setPrintOpen(true)}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Print
            </button>
          </div>
          <div className={uiCx('flex overflow-hidden', canvasChrome)} role="group" aria-label="Expand or collapse the chart">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              onClick={expandAll}
            >
              <UnfoldVertical className="h-3.5 w-3.5" aria-hidden />
              Expand all
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 border-l border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              onClick={collapseAll}
            >
              <FoldVertical className="h-3.5 w-3.5" aria-hidden />
              Collapse all
            </button>
          </div>
          <div className={uiCx('flex overflow-hidden', canvasChrome)} role="group" aria-label="How much to show on each person">
            {(
              [
                ['names', 'Names'],
                ['initials', 'Initials'],
              ] as const
            ).map(([value, label]) => {
              const active = density === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={uiCx(
                    'px-2.5 py-1 text-xs font-semibold',
                    active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50',
                  )}
                  aria-pressed={active}
                  onClick={() => setDensity(value)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div
          ref={contentRef}
          className="absolute left-0 top-0 inline-flex flex-col items-center gap-10 px-8 py-6 will-change-transform"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <OrgForestLayout
            teams={visible.teams}
            unassigned={visible.unassigned}
            canViewUserDetails={canViewUserDetails}
            expandedIds={expandedIds}
            searchQuery={searchQuery}
            onToggle={toggleNode}
            density={density}
          />
        </div>

        <div
          data-org-zoom="true"
          className={uiCx('absolute bottom-3 right-3 flex overflow-hidden', canvasChrome)}
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
    {printOpen
      ? createPortal(
          <div
            id="org-print-root"
            ref={printRootRef}
            className="pointer-events-none fixed top-0 z-[70] opacity-0"
            style={{ left: -100000, width: 'max-content' }}
            aria-hidden
          >
            <style>{ORG_PRINT_CSS}</style>
            <div className="px-4 pb-3 pt-1 text-center">
              <h1 className="text-base font-semibold tracking-tight text-gray-900">Organization</h1>
              <p className="mt-0.5 text-[11px] text-gray-500">{printSheetSubtitle(searchQuery, visibleCount)}</p>
            </div>
            <div data-org-print-frame className="mx-auto overflow-hidden" style={{ width: 'max-content' }}>
              <div
                data-org-print-chart
                className="inline-flex w-max flex-col items-center gap-10 bg-white px-4 py-2"
                style={{ transformOrigin: 'top left' }}
              >
                <OrgForestLayout
                  teams={visible.teams}
                  unassigned={visible.unassigned}
                  canViewUserDetails={false}
                  expandedIds={printExpandedIds}
                  searchQuery={searchQuery}
                  onToggle={toggleNode}
                  density={density}
                  forPrint
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null}
    </>
  );
}
