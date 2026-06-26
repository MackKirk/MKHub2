import {
  getProposalSectionImageFileUrl,
  getProposalSectionImagePreviewSize,
} from '@/constants/proposalSectionImage';

type Props = {
  fileObjectId: string;
  orientation?: string | null;
  onClose: () => void;
};

/** Lightbox — same aspect slot as PDF, showing the exact stored JPEG. */
export default function SectionImageLightbox({ fileObjectId, orientation, onClose }: Props) {
  const slot = getProposalSectionImagePreviewSize(orientation);
  const maxScale = Math.min(
    (typeof window !== 'undefined' ? window.innerWidth : 1200) * 0.92 / slot.width,
    (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.88 / slot.height,
    4,
  );
  const w = Math.round(slot.width * maxScale);
  const h = Math.round(slot.height * maxScale);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <button
        type="button"
        className="absolute top-4 right-4 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        onClick={onClose}
      >
        Close
      </button>
      <div
        className="overflow-hidden rounded bg-white shadow-2xl"
        style={{ width: w, height: h }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={getProposalSectionImageFileUrl(fileObjectId)}
          alt=""
          width={w}
          height={h}
          className="block h-full w-full"
        />
      </div>
    </div>
  );
}
