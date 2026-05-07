import type { ReactNode } from 'react';

/** Shared motion for interactive editor chrome (microinteractions). */
export const editorTransitionInteractive =
  'transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out';

/**
 * Main editor row behind pages strip + canvas + layers.
 * Light, calm workspace aligned with the rest of the Hub (enterprise clean).
 */
export const editorSurfaceWorkspaceClass =
  'bg-gradient-to-br from-slate-50 via-white to-slate-100/90';

/**
 * Left / right side panels (pages strip, layers) — light chrome, subtle depth.
 */
export const editorPanelAsideClass =
  'border-slate-200/90 bg-white/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.95)] ring-1 ring-slate-900/[0.04]';

/** Context strip under main ribbon (selection + inspector). */
export const editorContextStripClass =
  'border-t border-slate-200/75 bg-white/98 shadow-[inset_0_1px_0_0_rgba(255,255,255,1)]';

/**
 * Single horizontal toolbar row (selection ribbon + formatting inspector).
 * Groups are direct children — use editorContextToolbarGroupClass on each.
 */
export const editorContextToolbarRowClass =
  'flex min-h-8 min-w-0 flex-nowrap items-center divide-x divide-slate-300/85 overflow-x-auto py-0.5 [scrollbar-width:thin]';

/** One logical group between row dividers (padding only — no box border). */
export const editorContextToolbarGroupClass =
  'flex min-w-0 flex-shrink-0 items-center gap-1 px-2.5 first:pl-0 sm:gap-1.5 sm:px-3';

/** Contextual toolbar text buttons — flat / ghost (aligns with main ribbon h-8 controls). */
export const selectionToolButtonBaseClass = `${editorTransitionInteractive} inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35 active:scale-[0.98]`;

export const selectionToolButtonGhostClass = `${selectionToolButtonBaseClass} border border-transparent bg-transparent text-slate-800 hover:bg-slate-100 hover:text-slate-900`;

export const selectionToolButtonGhostDisabledClass = `${selectionToolButtonBaseClass} cursor-not-allowed border-transparent bg-transparent text-slate-500 opacity-80 hover:bg-transparent`;

/** Icon-only controls (align grid, etc.). */
export const selectionIconToolButtonClass = `${editorTransitionInteractive} inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35 active:scale-[0.98] [&>svg]:text-slate-800`;

/** Segmented control shell (fit mode, text align toggles). Inset padding keeps the track border visible; segments are rounded pills inside. */
export const editorSegmentedControlTrackClass =
  'flex h-8 flex-shrink-0 items-stretch gap-0.5 rounded-lg bg-slate-200/95 p-0.5 ring-1 ring-inset ring-slate-400/45';

/** Selected / idle segments — rounded and inset within the track (no flush rectangle that clips the bottom ring). */
export const editorSegmentedSegmentSelectedClass =
  'bg-white text-slate-900 shadow-sm ring-1 ring-slate-300/65 rounded-md';
export const editorSegmentedSegmentIdleClass =
  'rounded-md text-slate-800 hover:bg-white/85';

/** Image position / small dropdown triggers — same height as context toolbar. */
export const selectionContextDropdownTriggerClass = `${editorTransitionInteractive} inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300/80 bg-white px-2 text-[11px] font-semibold text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35 disabled:cursor-not-allowed disabled:opacity-50`;

/** Discreet label for contextual formatting groups (not panel titles). */
export const editorToolbarMicroLabelClass =
  'text-[10px] font-semibold uppercase tracking-wide text-slate-600 select-none';

/** Group label under ribbon sections / panel headers. */
export const editorGroupLabelClass =
  'text-[10px] font-semibold uppercase tracking-wider text-slate-500 select-none';

/** Secondary caption / hints in strips. */
export const editorCaptionClass = 'text-[11px] text-slate-600 leading-snug';

/** Panel titles (layers, pages) — light panels. */
export const editorPanelTitleClass =
  'text-[13px] font-semibold tracking-tight text-slate-900';

/** Subtitle / meta under panel titles. */
export const editorPanelMetaClass = 'text-[10px] font-medium leading-snug text-slate-500';

/** Shared width for left Pages strip and right Layers panel (document editor). */
export const editorSidePanelWidthClass = 'w-[12.5rem]';

/** Left column root (pages): fixed width + border-r + aside chrome. */
export const editorSidePanelRootLeftClass = `flex min-h-0 flex-shrink-0 flex-col border-r ${editorSidePanelWidthClass} ${editorPanelAsideClass}`;

/** Right column root (layers): fixed width + border-l + aside chrome. */
export const editorSidePanelRootRightClass = `flex min-h-0 flex-shrink-0 flex-col border-l ${editorSidePanelWidthClass} ${editorPanelAsideClass}`;

/** Header strip shared by Pages / Layers side panels (compact). */
export const editorSidePanelHeaderClass =
  'shrink-0 border-b border-slate-200/90 bg-white px-2.5 py-2';

/** Titles in side panel headers — slightly smaller than `editorPanelTitleClass`. */
export const editorSidePanelHeadingTitleClass =
  'text-left text-[12px] font-semibold tracking-tight text-slate-900';

/** Meta line under side panel titles. */
export const editorSidePanelHeadingMetaClass =
  'mt-0.5 text-[10px] font-medium leading-tight text-slate-500';

/** Scrollable body shared by Pages / Layers lists (padding + thin scrollbar). */
export const editorSidePanelBodyClass =
  'min-h-0 flex-1 overflow-auto bg-slate-50/50 p-2 [scrollbar-width:thin]';

/**
 * Scrollable canvas bed behind the A4 page (DocumentPreview).
 * Soft neutral field; no visible grid — keeps focus on the page.
 */
export const editorCanvasScrollAreaClass =
  'bg-slate-100/90 bg-[radial-gradient(ellipse_85%_65%_at_50%_42%,rgb(255,255,255)_0%,rgb(248,250,252)_45%,rgb(241,245,249)_100%)]';

/** Ghost control surface (Change background, portaled menus, native selects in the ribbon). */
export const ribbonGhostControlClass = `${editorTransitionInteractive} rounded-lg border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 hover:border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35`;

/** Compact native `<select>` — ribbon zoom + contextual toolbar (unified height). */
const compactNativeSelectCore = `${editorTransitionInteractive} h-8 min-w-0 cursor-pointer rounded-lg border border-slate-300/95 bg-white px-2 pr-8 text-xs font-semibold text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30`;

export const ribbonGhostNativeSelectClass = compactNativeSelectCore;

/** Contextual formatting bar — alias for the same compact select control. */
export const editorContextNativeSelectClass = compactNativeSelectCore;

/** Portaled menu panel (Change background, image position, …). */
export const ribbonPortalDropdownPanelClass =
  'fixed z-[100010] rounded-xl border border-slate-200/90 bg-white p-2 shadow-2xl ring-1 ring-slate-900/5';

export function RibbonShell({ children }: { children: ReactNode }) {
  return (
    <div className="mb-0 flex-shrink-0 border-b border-slate-200/85 bg-gradient-to-b from-white via-slate-50/95 to-slate-50/90 shadow-[0_1px_0_0_rgba(15,23,42,0.05),0_6px_20px_-8px_rgba(15,23,42,0.1)]">
      {children}
    </div>
  );
}

export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[64px] shrink-0 flex-col justify-end border-r border-slate-200/75 px-2 py-1 last:border-r-0 sm:px-2.5">
      <div className="flex flex-wrap items-center gap-1">{children}</div>
      <span className={`${editorGroupLabelClass} mt-auto pt-1 text-center`}>{label}</span>
    </div>
  );
}

const largeBtnBase = `${editorTransitionInteractive} flex flex-col items-center justify-center gap-0.5 min-w-[56px] max-w-[94px] rounded-xl border px-1.5 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35`;

export function RibbonLargeButton({
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={title ?? label}
      className={`${largeBtnBase} ${
        disabled
          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 opacity-60 shadow-none'
          : 'border-slate-300/90 bg-white text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_2px_8px_-2px_rgba(15,23,42,0.08)] hover:border-slate-400 hover:bg-slate-50 hover:shadow-[0_2px_6px_rgba(15,23,42,0.08),0_4px_14px_-4px_rgba(15,23,42,0.12)] active:scale-[0.98]'
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-700 [&>svg]:h-[20px] [&>svg]:w-[20px]">
        {icon}
      </span>
      <span className="text-center text-[11px] font-semibold leading-tight text-slate-800">{label}</span>
    </button>
  );
}

type CompactVariant = 'default' | 'primary';

export function RibbonCompactButton({
  icon,
  label,
  onClick,
  disabled,
  title,
  variant = 'default',
}: {
  icon: ReactNode;
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: CompactVariant;
}) {
  const variantClasses = disabled
    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 opacity-60 shadow-none'
    : variant === 'primary'
      ? 'border-brand-red/25 bg-brand-red text-white shadow-[0_2px_8px_rgba(220,38,38,0.35)] hover:bg-brand-red/92 hover:border-brand-red/40 hover:shadow-[0_4px_14px_rgba(220,38,38,0.4)] active:scale-[0.98]'
      : 'border-slate-300/90 bg-white text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:border-slate-400 hover:bg-slate-50 hover:shadow-md active:scale-[0.98]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title ?? label}
      className={`${editorTransitionInteractive} inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35 ${variantClasses}`}
    >
      <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
