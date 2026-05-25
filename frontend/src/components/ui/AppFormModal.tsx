import { type ReactNode, useEffect, useId, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { AppModal } from './AppModal';
import { uiBorders, uiCx, uiLayout, uiRadius, uiSpacing, uiTypography } from './tokens';

/** Collapsed / expanded outer width — literal strings only (Tailwind JIT). */
const FORM_MODAL_COLLAPSED_MAX = '!max-w-md';
const FORM_MODAL_EXPANDED_MAX = '!w-[calc(28rem+1.5rem+16rem)] !max-w-[calc(28rem+1.5rem+16rem)]';
const FORM_MODAL_FORM_INNER = 'w-full md:w-[26rem] md:max-w-[26rem]';
/** Slightly wider than default — contact new/edit modals (photo + 2-column fields). */
export const FORM_MODAL_COMFORTABLE_DIALOG_COLLAPSED = '!max-w-lg';
export const FORM_MODAL_COMFORTABLE_DIALOG_EXPANDED =
  '!w-[calc(32rem+1.5rem+16rem)] !max-w-[calc(32rem+1.5rem+16rem)]';
const FORM_MODAL_COMFORTABLE_FORM_INNER = 'w-full md:w-[30rem] md:max-w-[30rem]';
/** Wide shell: form column + padding; expands with gap + quick-info column when ? is open. */
export const FORM_MODAL_WIDE_DIALOG_COLLAPSED =
  '!w-[calc(720px+2rem)] !max-w-[calc(720px+2rem)]';
export const FORM_MODAL_WIDE_DIALOG_EXPANDED =
  '!w-[calc(720px+1.5rem+16rem+2rem)] !max-w-[calc(720px+1.5rem+16rem+2rem)]';

/**
 * Wide wizard (e.g. New Customer): dialog `max-w` is the outer shell; form column fills body
 * (like 26rem form inside max-w-md). Expanded shell adds quick-info column beside fixed form width.
 */
/** Wide wizard shell (New Customer / New Opportunity). Dialog max-width includes AppModal body padding. */
const FORM_MODAL_WIDE_DIALOG_MAX = '720px';
/** Form column width when quick info is open (absolute aside sits beside this). */
const FORM_MODAL_WIDE_FORM_MAX = '720px';
const FORM_MODAL_WIDE_FORM_COLUMN = 'w-full min-w-0 max-w-full md:shrink-0';
/** Collapsed wide body fills padded dialog; fixed 720px lives on the form column via max-width, not forced width. */
const DETAIL_MODAL_COLLAPSED_MAX = '!max-w-4xl';
const DETAIL_MODAL_EXPANDED_MAX = '!max-w-[calc(56rem+16rem)]';

/** Dialog shell: animate width + max-width when quick info opens. */
const DIALOG_WIDTH_TRANSITION =
  'transition-[max-width,width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';

const QUICK_INFO_ASIDE_OPEN_FORM =
  'max-md:w-full max-md:border-t max-md:opacity-100 md:absolute md:inset-y-0 md:right-0 md:flex md:w-64 md:flex-col md:overflow-hidden md:border-l md:border-t-0 md:opacity-100';

const QUICK_INFO_ASIDE_OPEN_DETAIL =
  'max-md:w-full max-md:border-t max-md:opacity-100 md:flex md:w-64 md:min-h-0 md:flex-col md:self-stretch md:overflow-hidden md:border-l md:border-t-0 md:opacity-100';

/** Scrollable quick-info body; on md fills the aside column height beside the form. */
const quickInfoScrollPanelClass = uiCx(
  'min-h-0 w-full flex-1 overflow-y-auto overscroll-contain',
  uiSpacing.cardPadding,
  uiSpacing.sectionStack,
  'max-md:max-h-[min(40vh,16rem)]',
);
export type AppFormModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Optional help panel (toggle via ? in the header). Use `formModalQuickInfo()` from
   * `@/lib/formModalQuickInfo` — four short paragraphs: purpose, how to use, optional behavior, actions.
   * Write for end users; no component or prop names.
   */
  quickInfo?: ReactNode;
  quickInfoLabel?: string;
  quickInfoOpen?: boolean;
  onQuickInfoOpenChange?: (open: boolean) => void;
  /** `form` = narrow create/edit (default). `detail` = wide read/update views (e.g. task detail). */
  layout?: 'form' | 'detail';
  /** Extra controls beside the quick-info toggle (e.g. step indicators). */
  headerExtra?: ReactNode;
  /** Overrides default width classes on the dialog shell (e.g. `!max-w-[900px]`). */
  dialogClassName?: string;
  /** When set with `dialogClassName`, used while quick info is open (modal expands outward). */
  dialogClassNameExpanded?: string;
  /** `wide` = 720px dialog + quick-info aside. `comfortable` = between default and wide (contacts). */
  formWidth?: 'default' | 'wide' | 'comfortable';
  /** Overrides default body wrapper classes on AppModal. */
  bodyClassName?: string;
  /** Backdrop z-index / layout when stacked on another modal (e.g. `z-[200]`). */
  overlayClassName?: string;
  /**
   * When `false` (with a footer), children fill the body column without an inner scroll wrapper —
   * use for layouts that pin actions above the footer (e.g. filter builder).
   */
  scrollBody?: boolean;
  children: ReactNode;
};

export function AppFormModal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'sm',
  quickInfo,
  quickInfoLabel = 'Quick Info',
  quickInfoOpen: quickInfoOpenProp,
  onQuickInfoOpenChange,
  layout = 'form',
  headerExtra,
  dialogClassName: dialogClassNameProp,
  dialogClassNameExpanded: dialogClassNameExpandedProp,
  formWidth = 'default',
  bodyClassName: bodyClassNameProp,
  overlayClassName,
  scrollBody = true,
  children,
}: AppFormModalProps) {
  const isDetailLayout = layout === 'detail';
  const isWideForm = formWidth === 'wide';
  const isComfortableForm = formWidth === 'comfortable';
  const quickInfoPanelId = useId();
  const [quickInfoOpenInternal, setQuickInfoOpenInternal] = useState(false);
  const isControlled = quickInfoOpenProp !== undefined;
  const quickInfoOpen = isControlled ? quickInfoOpenProp : quickInfoOpenInternal;
  const hasQuickInfo = quickInfo != null;
  const isExpanded = hasQuickInfo && quickInfoOpen;

  const setQuickInfoOpen = (next: boolean) => {
    if (!isControlled) setQuickInfoOpenInternal(next);
    onQuickInfoOpenChange?.(next);
  };

  useEffect(() => {
    if (!open && !isControlled) setQuickInfoOpenInternal(false);
  }, [open, isControlled]);

  const quickInfoToggle = hasQuickInfo ? (
    <button
      type="button"
      onClick={() => setQuickInfoOpen(!quickInfoOpen)}
      aria-expanded={quickInfoOpen}
      aria-controls={quickInfoPanelId}
      aria-label="Quick info"
      className={uiCx(
        'inline-flex h-8 w-8 items-center justify-center transition-colors duration-200',
        quickInfoOpen ? 'bg-gray-100 text-gray-800' : 'bg-white text-gray-600 hover:bg-gray-100',
        uiRadius.control,
        uiBorders.input,
      )}
    >
      <CircleHelp className="h-4 w-4" />
    </button>
  ) : null;

  const headerActions =
    headerExtra || quickInfoToggle ? (
      <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
        {headerExtra}
        {quickInfoToggle}
      </div>
    ) : undefined;

  const defaultDialogClassName = isDetailLayout
    ? isExpanded
      ? DETAIL_MODAL_EXPANDED_MAX
      : DETAIL_MODAL_COLLAPSED_MAX
    : isExpanded
      ? FORM_MODAL_EXPANDED_MAX
      : FORM_MODAL_COLLAPSED_MAX;

  const resolvedDialogClassName = dialogClassNameProp
    ? isExpanded && dialogClassNameExpandedProp
      ? dialogClassNameExpandedProp
      : dialogClassNameProp
    : isWideForm
      ? isExpanded
        ? FORM_MODAL_WIDE_DIALOG_EXPANDED
        : FORM_MODAL_WIDE_DIALOG_COLLAPSED
      : isComfortableForm
        ? isExpanded
          ? FORM_MODAL_COMFORTABLE_DIALOG_EXPANDED
          : FORM_MODAL_COMFORTABLE_DIALOG_COLLAPSED
        : defaultDialogClassName;

  const quickInfoPanelInner = (
    <>
      <div className={uiTypography.overline}>{quickInfoLabel}</div>
      <div className={uiCx(uiTypography.helper, 'space-y-2')}>{quickInfo}</div>
    </>
  );

  /** Detail layout: flex column — quick info never overlays main content. */
  const detailQuickInfoAside =
    hasQuickInfo && isDetailLayout ? (
      <aside
        id={quickInfoPanelId}
        aria-hidden={!quickInfoOpen}
        className={uiCx(
          'shrink-0 overflow-hidden bg-gray-50/50 border-gray-100',
          !quickInfoOpen && 'hidden',
          quickInfoOpen && QUICK_INFO_ASIDE_OPEN_DETAIL,
        )}
      >
        {quickInfoOpen ? (
          <div className={quickInfoScrollPanelClass}>{quickInfoPanelInner}</div>
        ) : null}
      </aside>
    ) : null;

  /** Form layout: quick-info panel sits absolutely on the right when open, so body height stays stable. */
  const formQuickInfoAside =
    hasQuickInfo && !isDetailLayout ? (
      <aside
        id={quickInfoPanelId}
        aria-hidden={!quickInfoOpen}
        className={uiCx(
          'overflow-hidden bg-gray-50/50 border-gray-100',
          quickInfoOpen ? uiCx('w-full', QUICK_INFO_ASIDE_OPEN_FORM) : 'hidden',
        )}
      >
        {quickInfoOpen ? (
          <div className={quickInfoScrollPanelClass}>{quickInfoPanelInner}</div>
        ) : null}
      </aside>
    ) : null;

  const formInnerWidthClass = isWideForm
    ? FORM_MODAL_WIDE_FORM_COLUMN
    : isComfortableForm
      ? FORM_MODAL_COMFORTABLE_FORM_INNER
      : FORM_MODAL_FORM_INNER;

  const useFormBodySplit = !isDetailLayout && !!footer && scrollBody;
  const useFormBodyFill = !isDetailLayout && !!footer && !scrollBody;

  const wideFormScrollClass = isWideForm
    ? isExpanded
      ? 'w-full min-w-0 md:w-[720px] md:max-w-[720px] md:shrink-0'
      : 'w-full min-w-0 max-w-[720px]'
    : '';

  const mainScrollClass = uiCx(
    'min-h-0 min-w-0',
    isDetailLayout
      ? 'max-h-[min(68vh,40rem)] w-full overflow-y-auto overflow-x-visible'
      : uiCx(
          'px-0.5 py-1',
          'max-h-[min(68vh,40rem)] overflow-y-auto overflow-x-visible',
          !useFormBodySplit &&
            !useFormBodyFill &&
            'pb-4',
          !useFormBodySplit && !useFormBodyFill && uiSpacing.sectionStack,
        ),
    !isDetailLayout && !isWideForm && formInnerWidthClass,
    wideFormScrollClass,
  );

  const mainScrollInnerClass = uiCx(
    'min-h-0 flex-1 overflow-y-auto overflow-x-visible pb-4',
    uiSpacing.sectionStack,
  );

  const resolvedBodyClassName = uiCx(
    isDetailLayout ? (bodyClassNameProp ?? 'p-0') : bodyClassNameProp ?? uiSpacing.cardPadding,
    footer && !isDetailLayout && 'flex min-h-0 flex-col overflow-hidden',
  );

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={footer}
      size={isDetailLayout ? size : 'sm'}
      headerActions={headerActions}
      bodyClassName={resolvedBodyClassName}
      bodyFill={isDetailLayout}
      overlayClassName={overlayClassName}
      dialogClassName={uiCx(DIALOG_WIDTH_TRANSITION, resolvedDialogClassName)}
    >
      {isDetailLayout ? (
        <div
          className={uiCx(
            'flex w-full min-h-0 flex-col',
            hasQuickInfo && isExpanded && 'md:flex-row md:items-start md:gap-6',
          )}
        >
          <div className={uiCx(mainScrollClass, hasQuickInfo && isExpanded && 'md:min-w-0 md:flex-1')}>
            {children}
          </div>
          {detailQuickInfoAside}
        </div>
      ) : (
        <div
          className={uiCx(
            'relative flex min-h-0 min-w-0 flex-col',
            isExpanded && 'md:overflow-x-clip',
          )}
        >
          <div className={mainScrollClass}>
            {useFormBodySplit ? <div className={mainScrollInnerClass}>{children}</div> : children}
          </div>
          {formQuickInfoAside}
        </div>
      )}
    </AppModal>
  );
}
