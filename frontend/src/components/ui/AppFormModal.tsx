import { type ReactNode, useEffect, useId, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { AppModal } from './AppModal';
import { uiBorders, uiCx, uiLayout, uiRadius, uiSpacing, uiTypography } from './tokens';

/** Collapsed / expanded outer width — static strings for Tailwind JIT. */
const FORM_MODAL_COLLAPSED_MAX = '!max-w-md';
const FORM_MODAL_EXPANDED_MAX = '!max-w-[calc(28rem+1rem+16rem)]';
const FORM_MODAL_FORM_INNER = 'w-full md:w-[26rem] md:max-w-[26rem]';
const BODY_WIDTH_COLLAPSED = 'md:w-[26rem]';
const BODY_WIDTH_EXPANDED = 'md:w-[calc(26rem+1rem+16rem)]';

/**
 * Wide wizard (e.g. New Customer): dialog `max-w` is the outer shell; form column fills body
 * (like 26rem form inside max-w-md). Expanded shell adds quick-info column beside fixed form width.
 */
/** Wide wizard shell (New Customer / New Opportunity). Dialog max-width includes AppModal body padding. */
const FORM_MODAL_WIDE_DIALOG_MAX = '720px';
/** Form column width when quick info is open (absolute aside sits beside this). */
const FORM_MODAL_WIDE_FORM_MAX = '720px';
const FORM_MODAL_WIDE_FORM_COLUMN = 'w-full min-w-0 max-w-full md:shrink-0';
const BODY_WIDTH_COLLAPSED_WIDE = 'w-full min-w-0';
const BODY_WIDTH_EXPANDED_WIDE = 'md:w-[calc(720px+1rem+16rem)]';
/** Extra horizontal space for AppModal body padding (p-4 × 2), matching narrow 28rem dialog / 26rem form. */
const FORM_MODAL_WIDE_DIALOG_PADDING = '2rem';

const DETAIL_MODAL_COLLAPSED_MAX = '!max-w-4xl';
const DETAIL_MODAL_EXPANDED_MAX = '!max-w-[calc(56rem+16rem)]';

/** Dialog shell: animate max-width only. */
const DIALOG_WIDTH_TRANSITION =
  'transition-[max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';
/** Body wrapper beside quick info: width only (form column width is fixed separately). */
const BODY_WIDTH_TRANSITION =
  'transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';

export type AppFormModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
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
  /** `wide` = 720px dialog + quick-info aside pattern (default constants above). */
  formWidth?: 'default' | 'wide';
  /** Overrides default body wrapper classes on AppModal. */
  bodyClassName?: string;
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
  children,
}: AppFormModalProps) {
  const isDetailLayout = layout === 'detail';
  const isWideForm = formWidth === 'wide';
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
        ? defaultWideDialogExpanded
        : defaultWideDialogCollapsed
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
          'shrink-0 overflow-hidden bg-gray-50/50',
          BODY_WIDTH_TRANSITION,
          'border-gray-100',
          quickInfoOpen
            ? 'w-full border-t opacity-100 md:w-64 md:border-l md:border-t-0'
            : 'hidden w-0 border-0 opacity-0',
        )}
      >
        <div
          className={uiCx(
            'w-full max-w-full md:w-64',
            uiSpacing.cardPadding,
            uiSpacing.sectionStack,
            'max-h-[min(68vh,40rem)] overflow-y-auto md:max-h-none',
          )}
        >
          {quickInfoPanelInner}
        </div>
      </aside>
    ) : null;

  /** Form layout (default + wide): absolute aside; inner shell grows, form column width stays fixed. */
  const formQuickInfoAside =
    hasQuickInfo && !isDetailLayout ? (
      <aside
        id={quickInfoPanelId}
        aria-hidden={!quickInfoOpen}
        className={uiCx(
          'overflow-hidden bg-gray-50/50',
          'border-gray-100 transition-opacity duration-300',
          quickInfoOpen ? 'w-full border-t opacity-100' : 'max-md:hidden w-0 border-0 opacity-0',
          'md:absolute md:top-0 md:right-0 md:bottom-0 md:block md:border-l md:border-t-0',
          quickInfoOpen
            ? 'md:pointer-events-auto md:w-64 md:opacity-100'
            : 'md:pointer-events-none md:w-0 md:border-0 md:opacity-0',
        )}
      >
        <div
          className={uiCx(
            'w-64 max-w-full',
            uiSpacing.cardPadding,
            uiSpacing.sectionStack,
            'md:h-full md:overflow-y-auto',
          )}
        >
          {quickInfoPanelInner}
        </div>
      </aside>
    ) : null;

  const formInnerWidthClass = isWideForm ? FORM_MODAL_WIDE_FORM_COLUMN : FORM_MODAL_FORM_INNER;
  const bodyWidthCollapsed = isWideForm ? BODY_WIDTH_COLLAPSED_WIDE : BODY_WIDTH_COLLAPSED;
  const bodyWidthExpanded = isWideForm ? BODY_WIDTH_EXPANDED_WIDE : BODY_WIDTH_EXPANDED;

  const mainScrollClass = uiCx(
    'min-h-0 overflow-y-auto overflow-x-visible',
    isDetailLayout ? 'max-h-[min(68vh,40rem)] w-full min-w-0' : 'max-h-[65vh] px-0.5 py-1',
    !isDetailLayout && formInnerWidthClass,
    isWideForm && isExpanded && 'md:w-[720px] md:max-w-[720px]',
    !isDetailLayout && uiSpacing.sectionStack,
  );

  const formBodyWidthClass =
    !isDetailLayout && (hasQuickInfo && isExpanded ? bodyWidthExpanded : bodyWidthCollapsed);

  const defaultWideDialogCollapsed = '!max-w-[720px]';
  const defaultWideDialogExpanded = `!max-w-[calc(720px+1rem+16rem+${FORM_MODAL_WIDE_DIALOG_PADDING})]`;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={footer}
      size={isDetailLayout ? size : 'sm'}
      headerActions={headerActions}
      bodyClassName={bodyClassNameProp ?? (isDetailLayout ? 'p-0' : undefined)}
      dialogClassName={uiCx(DIALOG_WIDTH_TRANSITION, 'will-change-[max-width]', resolvedDialogClassName)}
    >
      {isDetailLayout ? (
        <div
          className={uiCx(
            'flex w-full min-h-0',
            isExpanded ? 'flex-col md:flex-row' : 'flex-col',
            BODY_WIDTH_TRANSITION,
          )}
        >
          <div className={uiCx(mainScrollClass, isExpanded && 'md:flex-1')}>{children}</div>
          {detailQuickInfoAside}
        </div>
      ) : (
        <div
          className={uiCx(
            'relative w-full min-w-0',
            BODY_WIDTH_TRANSITION,
            formBodyWidthClass,
            isExpanded && 'md:overflow-x-clip',
          )}
        >
          <div className={mainScrollClass}>{children}</div>
          {formQuickInfoAside}
        </div>
      )}
    </AppModal>
  );
}
