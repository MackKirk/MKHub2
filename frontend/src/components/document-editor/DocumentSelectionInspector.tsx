import type { ReactNode } from 'react';
import type { DocElement } from '@/types/documentCreator';
import { DOCUMENT_EDITOR_FONTS, TEXT_STYLE_PRESETS } from '@/types/documentCreator';
import {
  AlignBottomIcon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignMiddleIcon,
  AlignRightIcon,
  AlignTopIcon,
} from '@/components/document-editor/documentEditorIcons';
import ImagePositionDropdown from '@/components/document-editor/ImagePositionDropdown';
import DocumentEditorFontColorPicker from '@/components/document-editor/DocumentEditorFontColorPicker';
import {
  editorContextNativeSelectClass,
  editorContextToolbarGroupClass,
  editorContextToolbarRowClass,
  editorSegmentedControlTrackClass,
  editorSegmentedSegmentIdleClass,
  editorSegmentedSegmentSelectedClass,
  editorToolbarMicroLabelClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';

function Cluster({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${editorContextToolbarGroupClass} ${className ?? ''}`}>{children}</div>;
}

/** Formatting controls for the selected element; laid out for a horizontal strip below the ribbon. */
export default function DocumentSelectionInspector({
  element,
  onUpdate,
}: {
  element: DocElement | null;
  onUpdate: (id: string, updater: (el: DocElement) => DocElement) => void;
}) {
  if (!element) {
    return null;
  }

  const id = element.id;
  const isText = element.type === 'text';
  const isImage = element.type === 'image';
  const isLocked = !!element.locked;
  const hasImage = isImage && !!element.content;

  if (isText && !isLocked) {
    return (
      <div className={editorContextToolbarRowClass}>
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>Preset</span>
          <select
            value=""
            onChange={(e) => {
              const preset = TEXT_STYLE_PRESETS.find((p) => p.id === e.target.value);
              if (preset)
                onUpdate(id, (el) => ({
                  ...el,
                  fontFamily: preset.fontFamily,
                  fontWeight: preset.fontWeight,
                  fontSize: preset.fontSize,
                  color: preset.color,
                }));
              e.target.value = '';
            }}
            className={`${editorContextNativeSelectClass} w-[min(10rem,36vw)] min-w-[7.5rem]`}
            title="Apply preset"
          >
            <option value="">Choose preset…</option>
            {TEXT_STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Cluster>
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>Font</span>
          <select
            value={element.fontFamily ?? 'Montserrat'}
            onChange={(e) => onUpdate(id, (el) => ({ ...el, fontFamily: e.target.value as DocElement['fontFamily'] }))}
            className={`${editorContextNativeSelectClass} w-[min(9rem,34vw)] min-w-[6.5rem]`}
          >
            {DOCUMENT_EDITOR_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Cluster>
        <Cluster className="gap-1.5">
          <span className={`${editorToolbarMicroLabelClass} mr-0.5`}>Style</span>
          <button
            type="button"
            onClick={() => onUpdate(id, (el) => ({ ...el, fontWeight: (el.fontWeight ?? 'normal') === 'bold' ? 'normal' : 'bold' }))}
            className={`h-8 w-8 shrink-0 rounded-md border text-xs font-bold transition-[background-color,border-color,color,box-shadow] duration-150 ${
              (element.fontWeight ?? 'normal') === 'bold'
                ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                : 'border-slate-300/95 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50'
            }`}
            title="Bold"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => onUpdate(id, (el) => ({ ...el, fontStyle: (el.fontStyle ?? 'normal') === 'italic' ? 'normal' : 'italic' }))}
            className={`h-8 w-8 shrink-0 rounded-md border text-xs italic transition-[background-color,border-color,color,box-shadow] duration-150 ${
              (element.fontStyle ?? 'normal') === 'italic'
                ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                : 'border-slate-300/95 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50'
            }`}
            title="Italic"
          >
            I
          </button>
          <div className="flex h-8 items-center gap-1 rounded-md border border-slate-300/90 bg-white px-1.5 shadow-sm">
            <span className="text-[10px] font-semibold text-slate-600">Size</span>
            <input
              type="number"
              min={6}
              max={99}
              value={element.fontSize ?? 12}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) onUpdate(id, (el) => ({ ...el, fontSize: Math.max(6, Math.min(99, n)) }));
              }}
              className="h-6 w-12 rounded border-0 bg-transparent p-0 text-right text-xs font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-0"
            />
          </div>
          <DocumentEditorFontColorPicker
            key={id}
            value={element.color}
            onChange={(c) => onUpdate(id, (el) => ({ ...el, color: c }))}
          />
        </Cluster>
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>H</span>
          <div className={`${editorSegmentedControlTrackClass} w-[7.25rem]`}>
            {[
              { v: 'left' as const, title: 'Align left', icon: <AlignLeftIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
              { v: 'center' as const, title: 'Align center', icon: <AlignCenterIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
              { v: 'right' as const, title: 'Align right', icon: <AlignRightIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
            ].map(({ v, title, icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, textAlign: v }))}
                className={`flex h-full min-h-0 flex-1 items-center justify-center transition-[background-color,color,box-shadow] duration-150 ${
                  (element.textAlign ?? 'left') === v ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass
                }`}
                title={title}
              >
                {icon}
              </button>
            ))}
          </div>
        </Cluster>
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>V</span>
          <div className={`${editorSegmentedControlTrackClass} w-[7.25rem]`}>
            {[
              { v: 'top' as const, title: 'Top', icon: <AlignTopIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
              { v: 'center' as const, title: 'Center', icon: <AlignMiddleIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
              { v: 'bottom' as const, title: 'Bottom', icon: <AlignBottomIcon className="h-4 w-4 shrink-0 text-slate-800" /> },
            ].map(({ v, title, icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, verticalAlign: v }))}
                className={`flex h-full min-h-0 flex-1 items-center justify-center transition-[background-color,color,box-shadow] duration-150 ${
                  (element.verticalAlign ?? 'top') === v ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass
                }`}
                title={title}
              >
                {icon}
              </button>
            ))}
          </div>
        </Cluster>
      </div>
    );
  }

  if (isImage && hasImage && !isLocked) {
    return (
      <div className={editorContextToolbarRowClass}>
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>Fit</span>
          <div className={editorSegmentedControlTrackClass}>
            {(['contain', 'cover', 'fill', 'none'] as const).map((fit) => (
              <button
                key={fit}
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, imageFit: fit }))}
                className={`flex h-full min-h-0 min-w-[3rem] flex-1 items-center justify-center px-2 text-[11px] font-semibold capitalize transition-[background-color,color,box-shadow] duration-150 ${
                  (element.imageFit ?? 'contain') === fit ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass
                }`}
                title={fit}
              >
                {fit}
              </button>
            ))}
          </div>
        </Cluster>
        <Cluster className="gap-2">
          <span className={editorToolbarMicroLabelClass}>Pos</span>
          <ImagePositionDropdown
            key={id}
            value={element.imagePosition ?? '50% 50%'}
            onChange={(v) => onUpdate(id, (el) => ({ ...el, imagePosition: v }))}
          />
        </Cluster>
      </div>
    );
  }

  if (isText && isLocked) {
    return (
      <p className="basis-full rounded-md border border-amber-200/80 bg-amber-50/90 px-2.5 py-1.5 text-[11px] text-amber-900">
        Unlock the text element to edit formatting.
      </p>
    );
  }

  if (isImage && (!hasImage || isLocked)) {
    return (
      <p className="basis-full rounded-md border border-slate-200/90 bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-600">
        {isLocked ? 'Unlock the image to adjust fit and position.' : 'Add an image to adjust fit and position.'}
      </p>
    );
  }

  return <p className="py-0.5 text-[11px] text-slate-600">No formatting options for this selection.</p>;
}
