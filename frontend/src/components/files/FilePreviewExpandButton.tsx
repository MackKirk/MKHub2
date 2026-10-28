import { CompressIcon, ExpandIcon } from '@/components/document-editor/documentEditorIcons';
import { uiBorders, uiCx, uiRadius } from '@/components/ui';

type Props = {
  expanded: boolean;
  onToggle: () => void;
};

/** Header control to expand / compress a file preview modal. */
export function FilePreviewExpandButton({ expanded, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={uiCx(
        'inline-flex h-8 w-8 items-center justify-center bg-white text-gray-600 transition-colors hover:bg-gray-100',
        uiRadius.control,
        uiBorders.input,
      )}
      title={expanded ? 'Exit full screen' : 'Expand to full screen'}
      aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
    >
      {expanded ? <CompressIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
    </button>
  );
}
