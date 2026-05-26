export function uiCx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export const uiRadius = {
  card: 'rounded-xl',
  control: 'rounded-lg',
  /** Portaled picker menu (Job list pattern — rounded panel, not the trigger). */
  dropdownMenu: 'rounded-xl',
  badge: 'rounded-full',
  modal: 'rounded-xl',
  tab: 'rounded-lg',
} as const;

export const uiShadows = {
  card: 'shadow-sm',
  elevated: 'shadow-lg',
  hero: 'shadow-hero',
} as const;

export const uiBorders = {
  subtle: 'border border-gray-200',
  input: 'border border-gray-300',
  strong: 'border border-gray-300',
  createDashed: 'border-2 border-dashed border-gray-300',
} as const;

/** First list/grid item for “add new” flows (opens create page or modal). */
export const uiListCreateItem = {
  base: uiCx(
    uiBorders.createDashed,
    'bg-white text-center transition-all hover:border-brand-red hover:bg-gray-50',
    'flex w-full items-center justify-center gap-2',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30',
  ),
  label: 'font-medium text-xs text-gray-700',
  card: 'min-h-[200px] p-2.5',
  row: 'box-border min-h-[60px] px-3 py-3',
} as const;

export const uiColors = {
  surface: 'bg-white',
  surfaceSubtle: 'bg-gray-50',
  textStrong: 'text-gray-900',
  textBody: 'text-gray-700',
  textMuted: 'text-gray-600',
  accentSolid: 'bg-brand-red text-white border-brand-red',
  accentOutline: 'border border-brand-red text-brand-red',
} as const;

export const uiTypography = {
  pageTitle: 'text-lg font-semibold text-gray-900',
  pageSubtitle: 'text-sm text-gray-600',
  sectionTitle: 'text-sm font-semibold text-gray-900',
  sectionSubtitle: 'text-xs text-gray-600',
  body: 'text-sm text-gray-700',
  helper: 'text-xs text-gray-600',
  overline: 'text-[10px] uppercase tracking-wide text-gray-500 font-semibold',
  controlLabel: 'text-xs font-medium text-gray-600',
} as const;

/** Page shell header (AppPageHeader) — back control is separate from decorative icon tile. */
export const uiPageHeader = {
  backButton: uiCx(
    'flex h-8 w-8 shrink-0 items-center justify-center text-gray-600 transition-colors',
    'hover:bg-gray-100 hover:text-gray-900',
    uiRadius.control,
  ),
  iconTile: uiCx(
    'flex h-8 w-8 shrink-0 items-center justify-center bg-blue-100 text-blue-800',
    uiRadius.control,
  ),
} as const;

export const uiSpacing = {
  pageX: 'px-4 md:px-6',
  pageY: 'py-4 md:py-6',
  pageStack: 'space-y-4',
  sectionStack: 'space-y-3',
  cardPadding: 'p-4',
  compactCardPadding: 'p-3',
  headerGap: 'gap-3',
  controlY: 'py-1.5',
  controlX: 'px-2.5',
} as const;

/**
 * Searchable combobox: trigger matches AppInput (rounded-lg); menu is a separate rounded panel.
 */
export const uiDropdown = {
  /** Same shell as AppInput / Search — moderate corners, not pill-shaped. */
  trigger: uiCx(
    'w-full bg-white text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400',
    'focus:border-gray-400 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gray-400/35',
    'disabled:cursor-not-allowed disabled:bg-gray-100',
    uiSpacing.controlX,
    uiSpacing.controlY,
    uiRadius.control,
    uiBorders.input,
  ),
  triggerWithLeftIcon: 'pl-8',
  leftIcon: 'pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-gray-400',
  menu: uiCx(
    'fixed z-[100050] max-h-56 overflow-auto bg-white py-1.5',
    uiRadius.dropdownMenu,
    uiBorders.subtle,
    uiShadows.elevated,
  ),
  /** Search field stays fixed; only `menuOptionsList` scrolls (avoids options showing through the search bar). */
  menuSearchable: uiCx(
    'fixed z-[100050] flex max-h-56 flex-col overflow-hidden bg-white',
    uiRadius.dropdownMenu,
    uiBorders.subtle,
    uiShadows.elevated,
  ),
  menuSearchHeader: 'shrink-0 border-b border-gray-100 bg-white px-2.5 py-2',
  menuOptionsList: 'min-h-0 flex-1 list-none overflow-y-auto overscroll-contain py-1.5',
  option: uiCx(
    'w-full text-left text-xs text-gray-900 transition-colors hover:bg-gray-50',
    uiSpacing.controlX,
    uiSpacing.controlY,
  ),
  optionSelected: 'bg-gray-50 font-medium',
  optionMuted: uiCx('text-xs text-gray-500', uiSpacing.controlX, uiSpacing.controlY),
  optionEmpty: uiCx('text-xs text-amber-800', uiSpacing.controlX, uiSpacing.controlY),
} as const;

/** User picker rows and selected chip (AppUserSelect). */
export const uiUserSelect = {
  optionRow: 'flex items-center gap-3',
  /** Extra left padding when a 24px avatar sits in the trigger icon slot. */
  triggerWithAvatar: 'pl-11',
  optionCheck:
    'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-300 bg-white transition-colors',
  optionCheckSelected:
    'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-brand-red bg-brand-red transition-colors',
  avatarSm: 'h-6 w-6 shrink-0 rounded-full object-cover',
  avatarMd: 'h-8 w-8 shrink-0 rounded-full object-cover',
  avatarPlaceholder:
    'inline-flex shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-600',
  chip: 'inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800',
  chipRow: 'flex flex-wrap gap-1.5',
  chipAvatar: 'h-5 w-5',
  chipClear: 'shrink-0 text-gray-500 transition-colors hover:text-gray-800',
} as const;

/** Portaled calendar panel — same shell as dropdown menu. */
export const uiDatePicker = {
  panel: uiCx(
    'fixed z-[100050] overflow-hidden bg-white py-2',
    uiRadius.dropdownMenu,
    uiBorders.subtle,
    uiShadows.elevated,
  ),
  panelHeader: 'flex items-center justify-between gap-2 px-3 pb-2',
  navButton: uiCx(
    'inline-flex h-7 w-7 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100',
    uiRadius.control,
  ),
  weekHeader: 'grid grid-cols-7 gap-0.5 px-2',
  weekday: 'py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500',
  grid: 'grid grid-cols-7 gap-0.5 px-2',
  day: uiCx(
    'flex h-8 w-full items-center justify-center rounded-md text-xs text-gray-900 transition-colors hover:bg-gray-50',
  ),
  dayOutside: 'text-gray-400',
  dayToday: 'font-semibold text-brand-red',
  daySelected: 'bg-brand-red/10 font-medium ring-1 ring-inset ring-brand-red/35',
  footer: 'mt-2 flex items-center justify-between border-t border-gray-100 px-3 pt-2',
  footerAction: 'text-xs font-medium text-brand-red hover:text-brand-red/80',
  triggerIcon:
    'pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400',
  /** Clock In/Out card trigger — icon tile + overline + date (opens same portaled panel). */
  triggerCard: uiCx(
    'flex w-full items-center gap-2 bg-white text-left transition-colors hover:border-gray-300',
    uiRadius.control,
    uiBorders.input,
    uiSpacing.controlX,
    uiSpacing.controlY,
  ),
  triggerCardIcon: uiCx(
    'flex h-7 w-7 flex-shrink-0 items-center justify-center bg-gray-100',
    uiRadius.control,
  ),
  monthYearTrigger:
    'inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-100',
  yearSection: 'px-3 pb-2',
  yearList: 'max-h-[108px] overflow-y-auto overscroll-contain',
  yearGrid: 'grid grid-cols-4 gap-1',
  yearCell:
    'flex h-8 items-center justify-center rounded-md text-xs text-gray-900 transition-colors hover:bg-gray-50',
  yearCellActive: 'bg-brand-red/10 font-medium ring-1 ring-inset ring-brand-red/35',
  monthSection: 'border-t border-gray-100 px-3 pt-2 pb-1',
  monthGrid: 'mt-1.5 grid grid-cols-3 gap-1',
  monthCell:
    'flex h-8 items-center justify-center rounded-md text-xs text-gray-900 transition-colors hover:bg-gray-50',
  monthCellActive: 'bg-brand-red/10 font-medium ring-1 ring-inset ring-brand-red/35',
} as const;

/** Stacked modals (e.g. picker opened from a form modal on z-[200]). */
export const uiModalLayer = {
  default: 'z-50',
  stacked: 'z-[200]',
  nestedPicker: 'z-[210]',
  nestedPickerBusy: 'z-[220]',
  nestedEditor: 'z-[215]',
} as const;

/** Field-label “?” help tooltips (AppFieldHint). Above modal overlays and dropdown menus. */
export const uiFieldHint = {
  shell: uiCx(
    'pointer-events-none fixed z-[100060] rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-left shadow-xl ring-1 ring-slate-900/5',
  ),
} as const;

/** Dark label tooltip (Opportunities list / filter chips). Portaled via AppTooltip. */
export const uiTooltip = {
  /** Viewport-anchored shell only — do not add `relative` here (breaks `fixed`). */
  shell: 'pointer-events-none fixed z-[9999]',
  panel:
    'relative inline-block whitespace-nowrap rounded px-2 py-1 text-xs text-white shadow-lg bg-gray-900',
  arrowTop: 'absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900',
  arrowBottom: 'absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900',
} as const;

export const uiLayout = {
  contentContainer: 'max-w-7xl mx-auto',
  sectionGrid2: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  sectionGrid3: 'grid grid-cols-1 md:grid-cols-3 gap-4',
  actionsRow: 'flex flex-wrap items-center gap-2',
  /** Primary (left) + sidebar (right). Use on full-width pages (Schedule, Clock In/Out). */
  pageTwoColumn: 'grid grid-cols-[1.5fr_1fr] items-stretch gap-2',
  /** Overview: community feed + fixed-width utility sidebar. */
  pageOverview:
    'grid min-w-0 grid-cols-1 items-stretch gap-2 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]',
} as const;
