export function uiCx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export const uiRadius = {
  card: 'rounded-xl',
  control: 'rounded-lg',
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
  row: 'min-h-[60px] p-2.5',
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

export const uiLayout = {
  contentContainer: 'max-w-7xl mx-auto',
  sectionGrid2: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  sectionGrid3: 'grid grid-cols-1 md:grid-cols-3 gap-4',
  actionsRow: 'flex flex-wrap items-center gap-2',
} as const;
