import { useState } from 'react';
import { ChevronRight, ListTree } from 'lucide-react';
import { AppButton, AppFormModal, uiCx } from '@/components/ui';
import FieldworkPhraseLibraryPanel from '@/components/fieldwork/FieldworkPhraseLibraryPanel';

type Props = {
  disabled?: boolean;
  onInsert: (phraseText: string) => void;
  className?: string;
  /** Full-width primary CTA (default) vs compact header control. */
  emphasis?: 'primary' | 'compact';
};

export default function FieldworkPhraseInsertButton({
  disabled,
  onInsert,
  className,
  emphasis = 'primary',
}: Props) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      {emphasis === 'compact' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={uiCx(
            'inline-flex items-center gap-1.5 rounded-lg border border-brand-red/30 bg-red-50 px-3 py-1.5 text-xs font-semibold text-brand-red',
            'hover:bg-red-100 disabled:opacity-50 disabled:pointer-events-none',
            className
          )}
        >
          <ListTree className="h-3.5 w-3.5" aria-hidden />
          Phrase library
        </button>
      ) : (
        <AppButton
          type="button"
          variant="primary"
          size="lg"
          disabled={disabled}
          leftIcon={<ListTree className="h-4 w-4" />}
          rightIcon={<ChevronRight className="h-4 w-4 opacity-90" />}
          onClick={() => setOpen(true)}
          className={uiCx('w-full justify-between shadow-sm', className)}
        >
          Choose from phrase library
        </AppButton>
      )}

      <AppFormModal
        open={open}
        onClose={close}
        title="Phrase library"
        description="Select one or more R&M phrases, then insert them into the comment."
        layout="detail"
        size="lg"
        scrollBody={false}
        dialogClassName="!w-[min(96vw,84rem)] !max-w-[min(96vw,84rem)] !h-[min(94vh,58rem)] !max-h-[min(94vh,58rem)]"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-4"
        footer={
          <div className="flex w-full justify-end">
            <AppButton type="button" variant="secondary" size="sm" onClick={close}>
              Close
            </AppButton>
          </div>
        }
      >
        <FieldworkPhraseLibraryPanel
          active={open}
          disabled={disabled}
          onInsert={(text) => {
            onInsert(text);
            close();
          }}
        />
      </AppFormModal>
    </>
  );
}
