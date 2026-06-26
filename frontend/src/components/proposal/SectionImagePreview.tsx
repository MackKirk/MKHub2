import {
  getProposalSectionImageFileUrl,
  getProposalSectionImagePreviewSize,
} from '@/constants/proposalSectionImage';

type Props = {
  fileObjectId: string;
  orientation?: string | null;
  onClick?: () => void;
  className?: string;
};

/** Section grid preview — same slot size and source file as the PDF. */
export default function SectionImagePreview({
  fileObjectId,
  orientation,
  onClick,
  className = '',
}: Props) {
  const slot = getProposalSectionImagePreviewSize(orientation);
  const frame = (
    <div
      className={`shrink-0 overflow-hidden rounded bg-white ring-1 ring-slate-900/10 ${className}`}
      style={{ width: slot.width, height: slot.height }}
    >
      <img
        src={getProposalSectionImageFileUrl(fileObjectId)}
        alt=""
        width={slot.width}
        height={slot.height}
        className="block h-full w-full"
        loading="lazy"
        draggable={false}
      />
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="cursor-zoom-in border-0 bg-transparent p-0"
        title="View larger"
        onClick={onClick}
      >
        {frame}
      </button>
    );
  }

  return frame;
}
