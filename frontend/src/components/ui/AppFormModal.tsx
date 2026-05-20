import { type ReactNode, useEffect, useId, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { AppModal } from './AppModal';
import { uiBorders, uiCx, uiRadius, uiSpacing, uiTypography } from './tokens';

/** Collapsed / expanded outer width — static strings for Tailwind JIT. */
const FORM_MODAL_COLLAPSED_MAX = '!max-w-md';
const FORM_MODAL_EXPANDED_MAX = '!max-w-[calc(28rem+1rem+16rem)]';
const FORM_MODAL_FORM_INNER = 'w-full md:w-[26rem] md:max-w-[26rem]';
const BODY_WIDTH_COLLAPSED = 'md:w-[26rem]';
const BODY_WIDTH_EXPANDED = 'md:w-[calc(26rem+1rem+16rem)]';

const DETAIL_MODAL_COLLAPSED_MAX = '!max-w-4xl';
const DETAIL_MODAL_EXPANDED_MAX = '!max-w-[calc(56rem+16rem)]';

const WIDTH_TRANSITION =
  'transition-[width,max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';

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
  children,
}: AppFormModalProps) {
  const isDetailLayout = layout === 'detail';
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

  const headerActions = hasQuickInfo ? (
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
  ) : undefined;

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
          WIDTH_TRANSITION,
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

  /** Form layout: absolute aside so form column height stays stable. */
  const formQuickInfoAside =
    hasQuickInfo && !isDetailLayout ? (
      <aside
        id={quickInfoPanelId}
        aria-hidden={!quickInfoOpen}
        className={uiCx(
          'overflow-hidden bg-gray-50/50',
          WIDTH_TRANSITION,
          'border-gray-100',
          quickInfoOpen ? 'w-full border-t opacity-100' : 'max-md:hidden w-0 opacity-0',
          'md:absolute md:top-0 md:right-0 md:bottom-0 md:block md:border-l md:border-t-0',
          quickInfoOpen
            ? 'md:pointer-events-auto md:w-64 md:opacity-100'
            : 'md:pointer-events-none md:w-0 md:opacity-0',
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

  const mainScrollClass = uiCx(
    'min-h-0 overflow-y-auto',
    isDetailLayout ? 'max-h-[min(68vh,40rem)] w-full min-w-0' : 'max-h-[65vh] px-0.5 py-1',
    !isDetailLayout && FORM_MODAL_FORM_INNER,
    !isDetailLayout && uiSpacing.sectionStack,
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
      bodyClassName={isDetailLayout ? 'p-0' : undefined}
      dialogClassName={uiCx(
        WIDTH_TRANSITION,
        'will-change-[max-width]',
        isDetailLayout
          ? isExpanded
            ? DETAIL_MODAL_EXPANDED_MAX
            : DETAIL_MODAL_COLLAPSED_MAX
          : isExpanded
            ? FORM_MODAL_EXPANDED_MAX
            : FORM_MODAL_COLLAPSED_MAX,
      )}
    >
      {isDetailLayout ? (
        <div
          className={uiCx(
            'flex w-full min-h-0',
            isExpanded ? 'flex-col md:flex-row' : 'flex-col',
            WIDTH_TRANSITION,
          )}
        >
          <div className={uiCx(mainScrollClass, isExpanded && 'md:flex-1')}>{children}</div>
          {detailQuickInfoAside}
        </div>
      ) : (
        <div
          className={uiCx(
            'relative w-full',
            WIDTH_TRANSITION,
            hasQuickInfo && isExpanded ? BODY_WIDTH_EXPANDED : BODY_WIDTH_COLLAPSED,
          )}
        >
          <div className={mainScrollClass}>{children}</div>
          {formQuickInfoAside}
        </div>
      )}
    </AppModal>
  );
}
