import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import DocumentPreview from '@/components/DocumentPreview';
import DocumentPagesStrip from '@/components/DocumentPagesStrip';
import { AddPageModal } from '@/components/AddPageModal';
import type { DocumentPage, DocElement, PageMargins } from '@/types/documentCreator';
import { DOCUMENT_EDITOR_FONTS, TEXT_STYLE_PRESETS, createTextElement, createImageElement, createImagePlaceholder, createBlockElement } from '@/types/documentCreator';

type Template = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
  areas_definition?: any;
  margins?: { left_pct?: number; right_pct?: number; top_pct?: number; bottom_pct?: number };
  default_elements?: DocElement[];
};

type UserDocument = {
  id: string;
  title: string;
  document_type_id?: string;
  project_id?: string | null;
  pages?: DocumentPage[];
  created_at?: string;
  updated_at?: string | null;
};

const defaultPage = (): DocumentPage => ({ template_id: null, elements: [] });

type EditorSnapshot = {
  title: string;
  pages: DocumentPage[];
  currentPageIndex: number;
  selectedElementIds: string[];
};

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
}: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm border transition-colors ${
        disabled
          ? 'text-gray-400 border-transparent cursor-not-allowed'
          : 'text-gray-700 hover:bg-gray-200 border-transparent hover:border-gray-300'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const CloseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const BackIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);
const TextIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />
  </svg>
);
const ImageIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
  </svg>
);
const ImageAreaIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeDasharray="2 2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
  </svg>
);
const ExportPdfIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const AlignLeftIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const AlignCenterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M7 6h10M4 12h16M9 18h6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const AlignRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M8 6h12M4 12h16M10 18h10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const AlignTopIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M6 5h12M6 9h12M6 13h8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const AlignMiddleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M6 7h12M6 11h12M6 15h8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const AlignBottomIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M6 11h8M6 15h12M6 19h12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const POSITION_ICON_COORDS: Record<string, { cx: number; cy: number }> = {
  '0% 0%': { cx: 2, cy: 2 },
  '50% 0%': { cx: 6, cy: 2 },
  '100% 0%': { cx: 10, cy: 2 },
  '0% 50%': { cx: 2, cy: 6 },
  '50% 50%': { cx: 6, cy: 6 },
  '100% 50%': { cx: 10, cy: 6 },
  '0% 100%': { cx: 2, cy: 10 },
  '50% 100%': { cx: 6, cy: 10 },
  '100% 100%': { cx: 10, cy: 10 },
};

function PositionIcon({ value }: { value: string }) {
  const { cx, cy } = POSITION_ICON_COORDS[value] ?? { cx: 6, cy: 6 };
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" className="block shrink-0">
      <rect x="0.5" y="0.5" width="11" height="11" rx="1" />
      <circle cx={cx} cy={cy} r="1.2" fill="currentColor" />
    </svg>
  );
}

function elementTypeLabel(el: DocElement): string {
  if (el.type === 'text') return 'Text';
  if (el.type === 'block') return 'Blocked area';
  return el.content ? 'Image' : 'Image area';
}

function LockIcon({ locked, className }: { locked: boolean; className?: string }) {
  return locked ? (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ) : (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  );
}

/** Pin icon: block move (position locked) but still editable */
function PinIcon({ pinned, className }: { pinned: boolean; className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

type AlignKind = 'left' | 'right' | 'centerH' | 'top' | 'bottom' | 'centerV';

function SelectedElementRibbon({
  selectedElementIds,
  elements,
  element,
  onUpdate,
  onRemove,
  onDeselect,
  onReplaceImage,
  onAlignSelected,
}: {
  selectedElementIds: string[];
  elements: DocElement[];
  element: DocElement | null;
  onUpdate: (id: string, updater: (el: DocElement) => DocElement) => void;
  onRemove: (id: string) => void;
  onDeselect: () => void;
  onReplaceImage?: (elementId: string, file: File) => Promise<void>;
  onAlignSelected?: (alignment: AlignKind) => void;
}) {
  const id = element?.id ?? '';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isImage = element?.type === 'image';
  const isText = element?.type === 'text';
  const hasImage = !!element && isImage && !!element.content;
  const isLocked = !!element?.locked;
  const isPositionLocked = !!element?.lockPosition;
  const multi = selectedElementIds.length > 1;
  const selectedEls = elements.filter((e) => selectedElementIds.includes(e.id));
  const allLocked = multi && selectedEls.every((e) => e.locked);
  const anyLocked = multi && selectedEls.some((e) => e.locked);
  const allPositionLocked = multi && selectedEls.every((e) => e.lockPosition);
  const anyPositionLocked = multi && selectedEls.some((e) => e.lockPosition);

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!element || !file || !file.type.startsWith('image/') || !onReplaceImage) return;
    await onReplaceImage(id, file);
  };

  return (
    <div className="border-t border-gray-200 bg-white px-2 py-2 min-h-[100px]">
      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
        <div className="flex items-center gap-2 mr-1 pr-2 border-r border-gray-200 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            {multi ? `${selectedElementIds.length} elements` : element ? elementTypeLabel(element) : 'No selection'}
          </span>
          {multi ? (
            <>
              <button
                type="button"
                onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, locked: true })))}
                disabled={allLocked}
                className="px-2 py-1 rounded border text-xs flex items-center gap-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                title="Lock all"
              >
                <LockIcon locked={true} className="w-3.5 h-3.5" />
                Lock all
              </button>
              <button
                type="button"
                onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, locked: false })))}
                disabled={!anyLocked}
                className="px-2 py-1 rounded border text-xs flex items-center gap-1 bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                title="Unlock all"
              >
                <LockIcon locked={false} className="w-3.5 h-3.5" />
                Unlock all
              </button>
              <button type="button" onClick={onDeselect} className="px-2 py-1 rounded border text-xs border-gray-300 text-gray-700 hover:bg-gray-50">
                Done
              </button>
              <button
                type="button"
                onClick={() => selectedEls.filter((e) => !e.locked).forEach((e) => onRemove(e.id))}
                disabled={selectedEls.filter((e) => !e.locked).length === 0}
                className="px-2 py-1 rounded border text-xs bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                title="Delete selected"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, lockPosition: true })))}
                disabled={allPositionLocked}
                className="px-2 py-1 rounded border text-xs flex items-center gap-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                title="Block move (still editable)"
              >
                <PinIcon pinned={true} className="w-3.5 h-3.5" />
                Block move
              </button>
              <button
                type="button"
                onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, lockPosition: false })))}
                disabled={!anyPositionLocked}
                className="px-2 py-1 rounded border text-xs flex items-center gap-1 text-gray-700 border-gray-300 hover:bg-gray-50"
                title="Allow move"
              >
                <PinIcon pinned={false} className="w-3.5 h-3.5" />
                Allow move
              </button>
            </>
          ) : null}
        {multi && onAlignSelected && (
          <div className="flex items-center gap-0.5 flex-shrink-0 border-r border-gray-200 pr-2 mr-1">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mr-0.5">Align</span>
            <button type="button" onClick={() => onAlignSelected('left')} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50" title="Align left">
              <AlignLeftIcon className="w-4 h-4 text-gray-700" />
            </button>
            <button type="button" onClick={() => onAlignSelected('centerH')} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50" title="Align center">
              <AlignCenterIcon className="w-4 h-4 text-gray-700" />
            </button>
            <button type="button" onClick={() => onAlignSelected('right')} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50" title="Align right">
              <AlignRightIcon className="w-4 h-4 text-gray-700" />
            </button>
            <button type="button" onClick={() => onAlignSelected('top')} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50" title="Align top">
              <AlignTopIcon className="w-4 h-4 text-gray-700" />
            </button>
            <button type="button" onClick={() => onAlignSelected('centerV')} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50" title="Align middle">
              <AlignMiddleIcon className="w-4 h-4 text-gray-700" />
            </button>
            <button type="button" onClick={() => onAlignSelected('bottom')} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50" title="Align bottom">
              <AlignBottomIcon className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        )}
          {!multi ? (
            <>
              <button
                type="button"
                onClick={() => element && onUpdate(id, (el) => ({ ...el, locked: !el.locked }))}
                disabled={!element}
                title={isLocked ? 'Unlock (allow move, resize, edit)' : 'Lock (block move, resize, edit)'}
                className={`px-2 py-1 rounded border text-xs flex items-center gap-1 ${
                  element
                    ? isLocked
                      ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <LockIcon locked={isLocked} className="w-3.5 h-3.5" />
                {isLocked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                onClick={onDeselect}
                disabled={!element}
                className={`px-2 py-1 rounded border text-xs ${
                  element ? 'border-gray-300 text-gray-700 hover:bg-gray-50' : 'border-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => element && onRemove(id)}
                disabled={!element || isLocked}
                className={`px-2 py-1 rounded border text-xs ${
                  element && !isLocked ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                }`}
                title={isLocked ? 'Unlock the element first to delete' : 'Delete'}
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => element && onUpdate(id, (el) => ({ ...el, lockPosition: !el.lockPosition }))}
                disabled={!element}
                className={`px-2 py-1 rounded border text-xs flex items-center gap-1 ${
                  element && isPositionLocked ? 'bg-sky-50 border-sky-200 text-sky-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                title={isPositionLocked ? 'Allow move' : 'Block move (still edit text/image)'}
              >
                <PinIcon pinned={isPositionLocked} className="w-3.5 h-3.5" />
                {isPositionLocked ? 'Allow move' : 'Block move'}
              </button>
            </>
          ) : null}
        </div>
        {!multi && isLocked && (
          <span className="text-xs text-amber-700 flex-shrink-0 font-medium">Locked — unlock to move, resize or edit</span>
        )}
        {!element && !multi && (
          <div className="text-sm text-gray-500 flex-shrink-0">
            Click an element on the page to edit its options. Ctrl+Click to add to selection.
          </div>
        )}
        {multi && (
          <div className="text-sm text-gray-500 flex-shrink-0">
            Drag to move all selected. Use arrow keys or Delete.
          </div>
        )}

        {element && isImage && (
          <>
            {onReplaceImage && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSelectFile} />
                <button
                  type="button"
                  onClick={() => !isLocked && fileInputRef.current?.click()}
                  disabled={isLocked}
                  className={`px-2.5 py-1.5 rounded border text-sm ${isLocked ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  {hasImage ? 'Replace image' : 'Add image'}
                </button>
              </div>
            )}

            {hasImage && !isLocked && (
              <>
                <div className="h-6 w-px bg-gray-200 mx-1" aria-hidden />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-px w-fit rounded overflow-hidden border border-gray-200 bg-gray-200">
                    {(['contain', 'cover', 'fill', 'none'] as const).map((fit) => (
                      <button
                        key={fit}
                        type="button"
                        onClick={() => onUpdate(id, (el) => ({ ...el, imageFit: fit }))}
                        className={`h-7 px-2 text-[11px] capitalize ${
                          ((element.imageFit ?? 'contain') === fit) ? 'bg-white shadow-sm text-gray-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                        title={fit}
                      >
                        {fit}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-px w-fit rounded overflow-hidden border border-gray-200 bg-gray-200">
                    {[
                      { value: '0% 0%', title: 'Top left' },
                      { value: '50% 0%', title: 'Top' },
                      { value: '100% 0%', title: 'Top right' },
                      { value: '0% 50%', title: 'Left' },
                      { value: '50% 50%', title: 'Center' },
                      { value: '100% 50%', title: 'Right' },
                      { value: '0% 100%', title: 'Bottom left' },
                      { value: '50% 100%', title: 'Bottom' },
                      { value: '100% 100%', title: 'Bottom right' },
                    ].map(({ value, title }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onUpdate(id, (el) => ({ ...el, imagePosition: value }))}
                        className={`w-7 h-7 flex items-center justify-center ${
                          ((element.imagePosition ?? '50% 50%') === value) ? 'bg-white shadow-sm text-gray-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                        title={title}
                      >
                        <PositionIcon value={value} />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {element && isText && !isLocked && (
          <>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <select
                value=""
                onChange={(e) => {
                  const preset = TEXT_STYLE_PRESETS.find((p) => p.id === e.target.value);
                  if (preset) onUpdate(id, (el) => ({ ...el, fontFamily: preset.fontFamily, fontWeight: preset.fontWeight, fontSize: preset.fontSize, color: preset.color }));
                  e.target.value = '';
                }}
                className="h-8 pl-2 pr-6 rounded border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-brand-red/40"
                title="Aplicar padrão"
              >
                <option value="">Padrão...</option>
                {TEXT_STYLE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              <select
                value={element.fontFamily ?? 'Montserrat'}
                onChange={(e) => onUpdate(id, (el) => ({ ...el, fontFamily: e.target.value as any }))}
                className="h-8 px-2 rounded border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-brand-red/40"
                title="Fonte"
              >
                {DOCUMENT_EDITOR_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdate(id, (el) => ({ ...el, fontWeight: (el.fontWeight ?? 'normal') === 'bold' ? 'normal' : 'bold' }))}
                  className={`h-8 w-8 rounded border text-sm font-bold ${
                    (element.fontWeight ?? 'normal') === 'bold' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Bold"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(id, (el) => ({ ...el, fontStyle: (el.fontStyle ?? 'normal') === 'italic' ? 'normal' : 'italic' }))}
                  className={`h-8 w-8 rounded border text-sm italic ${
                    (element.fontStyle ?? 'normal') === 'italic' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Italic"
                >
                  I
                </button>
              </div>

              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-500 whitespace-nowrap">Tamanho</label>
                <input
                  type="number"
                  min={6}
                  max={99}
                  value={element.fontSize ?? 12}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isNaN(n)) onUpdate(id, (el) => ({ ...el, fontSize: Math.max(6, Math.min(99, n)) }));
                  }}
                  className="h-8 w-14 px-2 rounded border border-gray-300 bg-white text-sm text-right focus:ring-2 focus:ring-brand-red/40"
                  title="Tamanho da fonte (px)"
                />
              </div>

              <input
                type="color"
                value={element.color ?? '#000000'}
                onChange={(e) => onUpdate(id, (el) => ({ ...el, color: e.target.value }))}
                className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0.5 bg-white"
                title="Cor do texto"
              />
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1" aria-hidden />

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-px rounded overflow-hidden border border-gray-200 bg-gray-200">
                {[
                  { v: 'left' as const, title: 'Align left', icon: <AlignLeftIcon className="w-4 h-4" /> },
                  { v: 'center' as const, title: 'Align center', icon: <AlignCenterIcon className="w-4 h-4" /> },
                  { v: 'right' as const, title: 'Align right', icon: <AlignRightIcon className="w-4 h-4" /> },
                ].map(({ v, title, icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onUpdate(id, (el) => ({ ...el, textAlign: v }))}
                    className={`h-8 w-9 flex items-center justify-center ${
                      (element.textAlign ?? 'left') === v ? 'bg-white shadow-sm text-gray-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                    title={title}
                  >
                    {icon}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-px rounded overflow-hidden border border-gray-200 bg-gray-200">
                {[
                  { v: 'top' as const, title: 'Top', icon: <AlignTopIcon className="w-4 h-4" /> },
                  { v: 'center' as const, title: 'Center', icon: <AlignMiddleIcon className="w-4 h-4" /> },
                  { v: 'bottom' as const, title: 'Bottom', icon: <AlignBottomIcon className="w-4 h-4" /> },
                ].map(({ v, title, icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onUpdate(id, (el) => ({ ...el, verticalAlign: v }))}
                    className={`h-8 w-9 flex items-center justify-center ${
                      (element.verticalAlign ?? 'top') === v ? 'bg-white shadow-sm text-gray-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                    title={title}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function legacyToElements(areas_content: Record<string, string> | undefined, areas_def: any): DocElement[] {
  if (!areas_content || typeof areas_content !== 'object') return [];
  const areas = Array.isArray(areas_def) ? areas_def : (areas_def?.areas ?? []);
  return areas.map((a: any, i: number) => ({
    id: `legacy-${i}-${a.id || a.key || i}`,
    type: 'text',
    content: areas_content[a.id || a.key] ?? '',
    x_pct: a.x_pct ?? 10,
    y_pct: a.y_pct ?? 20,
    width_pct: a.width_pct ?? 80,
    height_pct: a.height_pct ?? 8,
    fontSize: a.font_size ?? 12,
  }));
}

type DocumentEditorDocumentProps = {
  documentId: string;
  projectId?: string | null;
  onClose?: () => void;
};

type DocumentEditorTemplateProps = {
  mode: 'template';
  open: boolean;
  pageIndex: number;
  templateId: string | null;
  templates: Template[];
  initialMargins?: PageMargins | null;
  initialElements?: DocElement[];
  onClose: () => void;
  onSave: (margins: PageMargins, elements: DocElement[], templateId?: string | null) => void;
  /** Add a new page to the type with the given layout (parent adds row and may reopen for new page) */
  onDuplicatePage?: (margins: PageMargins, elements: DocElement[]) => void;
};

type DocumentEditorProps = DocumentEditorDocumentProps | DocumentEditorTemplateProps;

function isTemplateMode(props: DocumentEditorProps): props is DocumentEditorTemplateProps {
  return 'mode' in props && props.mode === 'template';
}

export default function DocumentEditor(props: DocumentEditorProps) {
  const isTemplate = isTemplateMode(props);
  const documentId = !isTemplate ? props.documentId : undefined;
  const projectId = !isTemplate ? props.projectId : undefined;
  const onClose = props.onClose;
  const templateProps = isTemplate ? props : null;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgPickerRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef<{ title: string; pagesStr: string } | null>(null);
  const id = documentId;

  const [title, setTitle] = useState('New document');
  const [pages, setPages] = useState<DocumentPage[]>([defaultPage()]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [canvasWidthPxForExport, setCanvasWidthPxForExport] = useState<number>(910);
  const [zoom, setZoom] = useState<number>(1);
  const [dragLayerIndex, setDragLayerIndex] = useState<number | null>(null);

  // Undo/Redo history (snapshots)
  const stateRef = useRef<EditorSnapshot>({
    title: 'New document',
    pages: [defaultPage()],
    currentPageIndex: 0,
    selectedElementIds: [],
  });
  const undoRef = useRef<EditorSnapshot[]>([]);
  const redoRef = useRef<EditorSnapshot[]>([]);
  const clipboardRef = useRef<DocElement | null>(null);

  const newElementId = useCallback(() => {
    return `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  const takeSnapshot = useCallback((): EditorSnapshot => {
    const cur = stateRef.current;
    // Deep-clone pages to avoid mutation issues
    const pagesClone = JSON.parse(JSON.stringify(cur.pages)) as DocumentPage[];
    return {
      title: cur.title,
      pages: pagesClone,
      currentPageIndex: cur.currentPageIndex,
      selectedElementIds: [...(cur.selectedElementIds ?? [])],
    };
  }, []);

  const pushHistory = useCallback(() => {
    undoRef.current.push(takeSnapshot());
    // cap history
    if (undoRef.current.length > 100) undoRef.current.shift();
    redoRef.current = [];
  }, [takeSnapshot]);

  const restoreSnapshot = useCallback((snap: EditorSnapshot) => {
    setTitle(snap.title);
    setPages(snap.pages);
    setCurrentPageIndex(snap.currentPageIndex);
    setSelectedElementIds(snap.selectedElementIds ?? []);
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(takeSnapshot());
    restoreSnapshot(prev);
  }, [restoreSnapshot, takeSnapshot]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(takeSnapshot());
    restoreSnapshot(next);
  }, [restoreSnapshot, takeSnapshot]);

  const { data: templatesFromApi = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
    enabled: !isTemplate,
  });
  const templates = isTemplate && templateProps ? templateProps.templates : templatesFromApi;

  const { data: doc } = useQuery({
    queryKey: ['document-creator-doc', id],
    queryFn: () => api<UserDocument>('GET', `/document-creator/documents/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (isTemplate && templateProps?.open) {
      const initialEls = (templateProps.initialElements ?? []).map((el) => ({
        ...el,
        id: el.id || `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      }));
      setPages([
        {
          template_id: templateProps.templateId,
          margins: templateProps.initialMargins ?? undefined,
          elements: initialEls,
        },
      ]);
      setCurrentPageIndex(0);
      setSelectedElementIds([]);
      stateRef.current = {
        title: '',
        pages: [
          {
            template_id: templateProps.templateId,
            margins: templateProps.initialMargins ?? undefined,
            elements: initialEls,
          },
        ],
        currentPageIndex: 0,
        selectedElementIds: [],
      };
      undoRef.current = [];
      redoRef.current = [];
    }
  }, [isTemplate, templateProps?.open, templateProps?.templateId, templateProps?.initialMargins, templateProps?.initialElements]);

  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title || 'New document');
    if (Array.isArray(doc.pages) && doc.pages.length > 0) {
      const converted = doc.pages.map((p) => {
        const hasElements = Array.isArray(p.elements) && p.elements.length > 0;
        const base = { template_id: p.template_id ?? null, margins: p.margins ?? undefined };
        if (hasElements) {
          return { ...base, elements: p.elements! };
        }
        const template = templates.find((t) => t.id === p.template_id);
        const areasDef = template?.areas_definition;
        const areas = Array.isArray(areasDef) ? areasDef : areasDef?.areas || [];
        const elements = legacyToElements(p.areas_content, areas);
        return { ...base, elements: elements.length ? elements : [] };
      });
      setPages(converted);
      lastSavedRef.current = {
        title: doc.title || 'New document',
        pagesStr: JSON.stringify(converted),
      };
      // Reset history on load
      stateRef.current = {
        title: doc.title || 'New document',
        pages: converted,
        currentPageIndex: 0,
        selectedElementIds: [],
      };
      undoRef.current = [];
      redoRef.current = [];
    }
  }, [doc, templates]);

  // Keep ref updated for history snapshots
  useEffect(() => {
    stateRef.current = {
      title,
      pages,
      currentPageIndex,
      selectedElementIds,
    };
  }, [title, pages, currentPageIndex, selectedElementIds]);

  // Keyboard shortcuts: Delete, Arrow keys, Undo/Redo, Copy/Paste/Duplicate
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (t?.isContentEditable ?? false);
      if (isTyping) return;

      const cur = stateRef.current;
      const curPage = cur.pages[cur.currentPageIndex];
      const curEls = curPage?.elements ?? [];
      const ids = cur.selectedElementIds ?? [];
      const selectedEls = curEls.filter((x) => ids.includes(x.id));
      const key = e.key.toLowerCase();

      // Delete / Backspace: remove all selected elements (unless locked)
      if (key === 'delete' || key === 'backspace') {
        const toRemove = selectedEls.filter((el) => !el.locked);
        if (toRemove.length > 0) {
          e.preventDefault();
          pushHistory();
          const removeIds = new Set(toRemove.map((el) => el.id));
          setPages((prev) => {
            const next = [...prev];
            const idx = stateRef.current.currentPageIndex;
            if (!next[idx]) return prev;
            next[idx] = {
              ...next[idx],
              elements: (next[idx].elements ?? []).filter((el) => !removeIds.has(el.id)),
            };
            return next;
          });
          setSelectedElementIds([]);
        }
        return;
      }

      // Arrow keys: move all selected elements (unless locked or position locked). Shift = move by 5%
      const step = e.shiftKey ? 1 : 0.25;
      const toMove = selectedEls.filter((el) => !el.locked && !el.lockPosition);
      if (toMove.length > 0 && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        let dx = 0;
        let dy = 0;
        if (key === 'arrowleft') dx = -step;
        if (key === 'arrowright') dx = step;
        if (key === 'arrowup') dy = -step;
        if (key === 'arrowdown') dy = step;
        e.preventDefault();
        pushHistory();
        setPages((prev) => {
          const next = [...prev];
          const idx = stateRef.current.currentPageIndex;
          if (!next[idx]) return prev;
          const moveIds = new Set(toMove.map((el) => el.id));
          next[idx] = {
            ...next[idx],
            elements: (next[idx].elements ?? []).map((el) => {
              if (!moveIds.has(el.id)) return el;
              const w = el.width_pct ?? 80;
              const h = el.height_pct ?? 8;
              const newX = Math.max(0, Math.min(100 - w, (el.x_pct ?? 10) + dx));
              const newY = Math.max(0, Math.min(100 - h, (el.y_pct ?? 20) + dy));
              return { ...el, x_pct: newX, y_pct: newY };
            }),
          };
          return next;
        });
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      // Copy/Paste/Duplicate for elements (single selection only)
      const sel = ids.length === 1 ? curEls.find((x) => x.id === ids[0]) : null;
      if (key === 'c') {
        if (sel && sel.type !== 'block') {
          clipboardRef.current = JSON.parse(JSON.stringify(sel)) as DocElement;
          toast.success('Copied.');
        }
        return;
      }
      if (key === 'd') {
        if (sel && sel.type !== 'block') {
          const src = sel;
          const clone: DocElement = {
            ...(JSON.parse(JSON.stringify(src)) as DocElement),
            id: newElementId(),
            x_pct: Math.min(100 - (src.width_pct ?? 0), (src.x_pct ?? 0) + 1),
            y_pct: Math.min(100 - (src.height_pct ?? 0), (src.y_pct ?? 0) + 1),
          };
          pushHistory();
          setPages((prev) => {
            const next = [...prev];
            const idx = stateRef.current.currentPageIndex;
            if (!next[idx]) return prev;
            const els = next[idx].elements ?? [];
            next[idx] = { ...next[idx], elements: [...els, clone] };
            return next;
          });
          setSelectedElementIds([clone.id]);
        }
        return;
      }
      if (key === 'v') {
        const src = clipboardRef.current;
        if (src && src.type !== 'block') {
          const clone: DocElement = {
            ...(JSON.parse(JSON.stringify(src)) as DocElement),
            id: newElementId(),
            x_pct: Math.min(100 - (src.width_pct ?? 0), (src.x_pct ?? 0) + 1),
            y_pct: Math.min(100 - (src.height_pct ?? 0), (src.y_pct ?? 0) + 1),
          };
          pushHistory();
          setPages((prev) => {
            const next = [...prev];
            const idx = stateRef.current.currentPageIndex;
            if (!next[idx]) return prev;
            const els = next[idx].elements ?? [];
            next[idx] = { ...next[idx], elements: [...els, clone] };
            return next;
          });
          setSelectedElementIds([clone.id]);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, newElementId, pushHistory]);

  const currentPage = pages[currentPageIndex];
  const currentTemplateId = currentPage?.template_id ?? null;
  const currentTemplate = templates.find((t) => t.id === currentTemplateId);
  const elements = currentPage?.elements ?? [];
  const selectedElement = selectedElementIds.length === 1 ? elements.find((e) => e.id === selectedElementIds[0]) : null;
  const backgroundFileId = currentTemplate?.background_file_id;
  const backgroundUrl = backgroundFileId ? `/files/${backgroundFileId}/thumbnail?w=800` : null;
  const defaultMargins: PageMargins = { left_pct: 0, right_pct: 0, top_pct: 0, bottom_pct: 0 };
  /** Margins: page overrides template overrides default */
  const effectiveMargins: PageMargins = {
    ...defaultMargins,
    ...currentTemplate?.margins,
    ...currentPage?.margins,
  };

  const setCurrentPageTemplate = useCallback((templateId: string | null) => {
    pushHistory();
    setPages((prev) => {
      const next = [...prev];
      if (!next[currentPageIndex]) return next;
      next[currentPageIndex] = {
        ...next[currentPageIndex],
        template_id: templateId,
        /* Keep existing elements and margins; template is just the background */
      };
      return next;
    });
  }, [currentPageIndex, pushHistory]);

  const setCurrentPageMargins = useCallback((m: PageMargins) => {
    setPages((prev) => {
      const next = [...prev];
      if (next[currentPageIndex]) {
        next[currentPageIndex] = { ...next[currentPageIndex], margins: { ...m } };
      }
      return next;
    });
  }, [currentPageIndex]);

  const setCurrentPageElements = useCallback((updater: (els: DocElement[]) => DocElement[]) => {
    setPages((prev) => {
      const next = [...prev];
      if (next[currentPageIndex]) {
        next[currentPageIndex] = {
          ...next[currentPageIndex],
          elements: updater(next[currentPageIndex].elements ?? []),
        };
      }
      return next;
    });
  }, [currentPageIndex]);

  const moveElement = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      pushHistory();
      setCurrentPageElements((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    [pushHistory, setCurrentPageElements]
  );

  const bringToFront = useCallback(
    (index: number) => moveElement(index, elements.length - 1),
    [moveElement, elements.length]
  );
  const sendToBack = useCallback((index: number) => moveElement(index, 0), [moveElement]);
  const moveForward = useCallback(
    (index: number) => moveElement(index, Math.min(elements.length - 1, index + 1)),
    [moveElement, elements.length]
  );
  const moveBackward = useCallback((index: number) => moveElement(index, Math.max(0, index - 1)), [moveElement]);

  const handleAddElement = useCallback((el: DocElement) => {
    pushHistory();
    setCurrentPageElements((prev) => [...prev, el]);
    setSelectedElementIds([el.id]);
  }, [setCurrentPageElements, pushHistory]);

  const handleUpdateElement = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    setCurrentPageElements((prev) =>
      prev.map((e) => (e.id === elementId ? updater(e) : e))
    );
  }, [setCurrentPageElements]);

  const handleUpdateElementWithHistory = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    pushHistory();
    handleUpdateElement(elementId, updater);
  }, [pushHistory, handleUpdateElement]);

  const handleRemoveElement = useCallback((elementId: string) => {
    pushHistory();
    setCurrentPageElements((prev) => prev.filter((e) => e.id !== elementId));
    setSelectedElementIds((prev) => prev.filter((id) => id !== elementId));
  }, [setCurrentPageElements, pushHistory]);

  const handleAlignSelected = useCallback(
    (alignment: AlignKind) => {
      const ids = selectedElementIds.filter((id) => {
        const el = elements.find((e) => e.id === id);
        return el && !el.locked && !el.lockPosition;
      });
      if (ids.length < 2) return;
      const sel = elements.filter((e) => ids.includes(e.id));
      let left = 100,
        right = 0,
        top = 100,
        bottom = 0;
      sel.forEach((el) => {
        const x = el.x_pct ?? 10;
        const y = el.y_pct ?? 20;
        const w = el.width_pct ?? 80;
        const h = el.height_pct ?? 8;
        left = Math.min(left, x);
        right = Math.max(right, x + w);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + h);
      });
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      const L = effectiveMargins?.left_pct ?? 0;
      const R = effectiveMargins?.right_pct ?? 0;
      const T = effectiveMargins?.top_pct ?? 0;
      const B = effectiveMargins?.bottom_pct ?? 0;
      pushHistory();
      setCurrentPageElements((prev) =>
        prev.map((el) => {
          if (!ids.includes(el.id)) return el;
          const w = el.width_pct ?? 80;
          const h = el.height_pct ?? 8;
          let newX = el.x_pct ?? 10;
          let newY = el.y_pct ?? 20;
          switch (alignment) {
            case 'left':
              newX = left;
              break;
            case 'right':
              newX = right - w;
              break;
            case 'centerH':
              newX = centerX - w / 2;
              break;
            case 'top':
              newY = top;
              break;
            case 'bottom':
              newY = bottom - h;
              break;
            case 'centerV':
              newY = centerY - h / 2;
              break;
          }
          newX = Math.max(L, Math.min(100 - R - w, newX));
          newY = Math.max(T, Math.min(100 - B - h, newY));
          return { ...el, x_pct: newX, y_pct: newY };
        })
      );
    },
    [selectedElementIds, elements, effectiveMargins, pushHistory, setCurrentPageElements]
  );

  const newPageWithTemplate = useCallback((templateId: string | null): DocumentPage => {
    return { template_id: templateId, elements: [] };
  }, []);

  const handleAddPageWithTemplate = useCallback(
    (templateId: string | null) => {
      pushHistory();
      setPages((prev) => [...prev, newPageWithTemplate(templateId)]);
      setCurrentPageIndex(pages.length);
      setSelectedElementIds([]);
      setShowAddPageModal(false);
    },
    [newPageWithTemplate, pages.length, pushHistory]
  );

  const handleAddPages = useCallback(
    (newPages: DocumentPage[]) => {
      if (newPages.length === 0) return;
      pushHistory();
      setPages((prev) => [...prev, ...newPages]);
      setCurrentPageIndex((prev) => prev + newPages.length - 1);
      setSelectedElementIds([]);
      setShowAddPageModal(false);
    },
    [pushHistory]
  );

  const handleDeletePage = useCallback((index: number) => {
    pushHistory();
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
    setCurrentPageIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
    setSelectedElementIds([]);
  }, [pushHistory]);

  const handleDuplicatePage = useCallback(
    (index: number) => {
      const page = pages[index];
      if (!page) return;
      const clonedElements = (page.elements ?? []).map((el) => ({
        ...(JSON.parse(JSON.stringify(el)) as DocElement),
        id: newElementId(),
      }));
      const newPage: DocumentPage = {
        template_id: page.template_id,
        margins: page.margins ? { ...page.margins } : undefined,
        elements: clonedElements,
      };
      pushHistory();
      setPages((prev) => {
        const next = [...prev];
        next.splice(index + 1, 0, newPage);
        return next;
      });
      setCurrentPageIndex(index + 1);
      setSelectedElementIds([]);
    },
    [pages, newElementId, pushHistory]
  );

  const handleReorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      pushHistory();
      setPages((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
      setCurrentPageIndex((prev) => {
        if (prev === fromIndex) return toIndex;
        if (fromIndex < prev && toIndex >= prev) return prev - 1;
        if (fromIndex > prev && toIndex <= prev) return prev + 1;
        return prev;
      });
    },
    [pushHistory]
  );

  const handleAddText = useCallback(() => {
    handleAddElement(createTextElement());
  }, [handleAddElement]);

  const handleAddImagePlaceholder = useCallback(() => {
    handleAddElement(createImagePlaceholder());
  }, [handleAddElement]);


  const handleAddImage = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    try {
      const up: any = await api('POST', '/files/upload', {
        original_name: file.name,
        content_type: file.type,
        client_id: null,
        project_id: null,
        employee_id: null,
        category_id: isTemplate ? 'document-creator-template' : 'document-creator',
      });
      const res = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' },
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type,
      });
      handleAddElement(createImageElement(conf.id));
      toast.success('Image added.');
    } catch (err) {
      toast.error('Failed to upload image.');
    }
  }, [handleAddElement]);

  const handleReplaceImage = useCallback(
    async (elementId: string, file: File) => {
      try {
        const up: any = await api('POST', '/files/upload', {
          original_name: file.name,
          content_type: file.type,
          client_id: null,
          project_id: null,
          employee_id: null,
          category_id: isTemplate ? 'document-creator-template' : 'document-creator',
        });
        const res = await fetch(up.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' },
          body: file,
        });
        if (!res.ok) throw new Error('Upload failed');
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: file.size,
          checksum_sha256: 'na',
          content_type: file.type,
        });
        pushHistory();
        handleUpdateElement(elementId, (el) => ({ ...el, content: conf.id }));
        toast.success('Image updated.');
      } catch {
        toast.error('Failed to upload image.');
      }
    },
    [handleUpdateElement, pushHistory]
  );

  const saveDocument = useCallback(async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      const payload = {
        title,
        pages: pages.map((p) => ({
          template_id: p.template_id,
          margins: p.margins ?? undefined,
          elements: p.elements ?? [],
        })),
      };
      await api('PATCH', `/document-creator/documents/${id}`, payload);
      lastSavedRef.current = { title, pagesStr: JSON.stringify(pages) };
      queryClient.invalidateQueries({ queryKey: ['document-creator-doc', id] });
      queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  }, [id, title, pages, projectId, queryClient]);

  useEffect(() => {
    if (!id) return;
    const pagesStr = JSON.stringify(pages);
    if (
      lastSavedRef.current &&
      lastSavedRef.current.title === title &&
      lastSavedRef.current.pagesStr === pagesStr
    )
      return;
    const t = setTimeout(saveDocument, 1500);
    return () => clearTimeout(t);
  }, [id, title, pages, saveDocument]);

  const handleExportPdf = useCallback(async () => {
    if (!id) return;
    try {
      setIsExportingPdf(true);
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(`/document-creator/documents/${id}/export-pdf`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ canvas_width_px: Math.round(canvasWidthPxForExport) }),
      });
      if (!r.ok) throw new Error(r.statusText || 'Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url, filename: `${title || 'document'}.pdf` };
      });
      toast.success('PDF ready for preview.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to export PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [id, title, canvasWidthPxForExport]);

  const closePdfPreview = useCallback(() => {
    setPdfPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const handleSaveTemplatePage = useCallback(() => {
    if (!isTemplate || !templateProps) return;
    const page = pages[0];
    if (!page) return;
    const margins: PageMargins = {
      left_pct: page.margins?.left_pct ?? 0,
      right_pct: page.margins?.right_pct ?? 0,
      top_pct: page.margins?.top_pct ?? 0,
      bottom_pct: page.margins?.bottom_pct ?? 0,
    };
    templateProps.onSave(margins, page.elements ?? [], page.template_id ?? null);
    templateProps.onClose();
  }, [isTemplate, templateProps, pages]);

  useEffect(() => {
    if (!bgPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (bgPickerRef.current && t && !bgPickerRef.current.contains(t)) {
        setBgPickerOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [bgPickerOpen]);

  if (isTemplate && templateProps && !templateProps.open) return null;

  return (
    <div className="flex flex-col h-full min-h-0 max-w-full">
      {/* Toolbar: Word/Excel style with icons + labels */}
      <div className="mb-2 flex-shrink-0 border-b border-gray-200 bg-gray-50/80">
        <div className="flex flex-wrap items-center gap-1 px-2 py-2">
          <div className="flex items-center gap-2 mr-2 pr-2 border-r border-gray-200">
            {onClose ? (
              <button type="button" onClick={onClose} className="p-1.5 rounded text-gray-600 hover:bg-gray-200 hover:text-gray-900" aria-label="Close">
                <CloseIcon className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" onClick={() => navigate('/documents/create')} className="p-1.5 rounded text-gray-600 hover:bg-gray-200 hover:text-gray-900" aria-label="Back">
                <BackIcon className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-800 truncate max-w-[180px]">
              {isTemplate && templateProps ? `Page ${templateProps.pageIndex + 1} layout` : onClose ? 'Edit document' : 'Document'}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {!isTemplate && (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-44 px-2.5 py-1.5 rounded border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red"
                placeholder="Document title"
              />
            )}
            <div className="relative" ref={bgPickerRef}>
              <button
                type="button"
                onClick={() => setBgPickerOpen((v) => !v)}
                className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
                title="Change background"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Change background</span>
                <span className="text-gray-400 ml-1">▾</span>
              </button>
              {bgPickerOpen && (
                <div className="absolute z-40 mt-1 w-[340px] max-h-[60vh] overflow-auto rounded-xl border border-gray-200 bg-white shadow-xl p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPageTemplate(null);
                      setBgPickerOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-50 ${
                      !currentTemplateId ? 'bg-gray-50' : ''
                    }`}
                  >
                    <div className="w-16 h-10 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-500">
                      None
                    </div>
                    <div className="min-w-0 text-sm text-gray-700 truncate">No background</div>
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {templates.map((t) => {
                      const thumb = t.background_file_id ? `/files/${t.background_file_id}/thumbnail?w=260` : null;
                      const selected = currentTemplateId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setCurrentPageTemplate(t.id);
                            setBgPickerOpen(false);
                          }}
                          className={`text-left rounded-lg border p-2 hover:bg-gray-50 ${
                            selected ? 'border-brand-red bg-brand-red/5' : 'border-gray-200'
                          }`}
                          title={t.name}
                        >
                          <div className="w-full aspect-[210/297] rounded bg-gray-100 overflow-hidden border border-gray-200">
                            {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="h-6 w-px bg-gray-300 mx-1" aria-hidden />
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<TextIcon className="w-4 h-4" />} label="Text" onClick={handleAddText} />
            <ToolbarButton icon={<ImageIcon className="w-4 h-4" />} label="Image" onClick={() => fileInputRef.current?.click()} />
            <ToolbarButton icon={<ImageAreaIcon className="w-4 h-4" />} label="Image area" onClick={handleAddImagePlaceholder} />
            {isTemplate && (
              <ToolbarButton
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
                  </svg>
                }
                label="Block"
                onClick={() => handleAddElement(createBlockElement())}
              />
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddImage} />
          <div className="h-6 w-px bg-gray-300 mx-1" aria-hidden />
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-xs text-gray-500">Zoom</span>
            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-8 pl-2 pr-7 rounded border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-brand-red/40"
              title="Zoom"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)}%
                </option>
              ))}
            </select>
          </div>
          {isTemplate && currentPage && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Margins %</span>
              {(['left_pct', 'right_pct', 'top_pct', 'bottom_pct'] as const).map((key) => (
                <input
                  key={key}
                  type="number"
                  min={0}
                  max={50}
                  value={currentPage.margins?.[key] ?? 0}
                  onChange={(e) =>
                    setCurrentPageMargins({
                      left_pct: currentPage.margins?.left_pct ?? 0,
                      right_pct: currentPage.margins?.right_pct ?? 0,
                      top_pct: currentPage.margins?.top_pct ?? 0,
                      bottom_pct: currentPage.margins?.bottom_pct ?? 0,
                      [key]: Number(e.target.value),
                    })
                  }
                  className="w-10 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
                  title={key.replace('_pct', '')}
                />
              ))}
            </div>
          )}
          {!isTemplate && isSaving && <span className="text-xs text-gray-500 px-2">Saving...</span>}
          {isTemplate && templateProps && (
            <>
              <button
                type="button"
                onClick={handleSaveTemplatePage}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium bg-brand-red text-white hover:bg-brand-red/90 border border-transparent"
              >
                Save page layout
              </button>
            </>
          )}
          {!isTemplate && (
          <ToolbarButton
            icon={<ExportPdfIcon className="w-4 h-4" />}
            label={isExportingPdf ? 'Exporting…' : 'Export PDF'}
            onClick={handleExportPdf}
            disabled={isExportingPdf}
          />
          )}
        </div>

        <SelectedElementRibbon
          selectedElementIds={selectedElementIds}
          elements={elements}
          element={selectedElement && selectedElement.type !== 'block' ? selectedElement : null}
          onUpdate={handleUpdateElementWithHistory}
          onRemove={handleRemoveElement}
          onDeselect={() => setSelectedElementIds([])}
          onReplaceImage={handleReplaceImage}
          onAlignSelected={handleAlignSelected}
        />
      </div>
      {pdfPreview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-5xl bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">PDF Preview</div>
                <div className="text-xs text-gray-500 truncate">{pdfPreview.filename}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className={`px-3 py-1.5 rounded border text-sm ${
                    isExportingPdf ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                  title="Regenerate preview"
                >
                  Refresh
                </button>
                <a
                  href={pdfPreview.url}
                  download={pdfPreview.filename}
                  className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={closePdfPreview}
                  className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm hover:bg-gray-900"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="bg-gray-200">
              <iframe
                title="PDF Preview"
                src={pdfPreview.url}
                className="w-full h-[78vh] bg-white"
              />
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        <DocumentPagesStrip
          pages={pages}
          templates={templates}
          currentPageIndex={currentPageIndex}
          onPageSelect={setCurrentPageIndex}
          onAddPage={isTemplate ? () => {} : () => setShowAddPageModal(true)}
          onReorderPages={isTemplate ? undefined : handleReorderPages}
          onDeletePage={isTemplate ? undefined : handleDeletePage}
          onDuplicatePage={
            isTemplate
              ? templateProps?.onDuplicatePage
                ? () => templateProps.onDuplicatePage?.(pages[0]?.margins ?? {}, pages[0]?.elements ?? [])
                : undefined
              : handleDuplicatePage
          }
        />
        <DocumentPreview
          backgroundUrl={backgroundUrl}
          elements={elements}
          margins={effectiveMargins}
          blockAreasVisible={true}
          lockBlockElements={!isTemplate}
          showElementOptionsPopover={false}
          onCanvasWidthPxChange={setCanvasWidthPxForExport}
          onBeginUserAction={pushHistory}
          zoom={zoom}
          onElementClick={(elementId, e) => {
            if (e?.ctrlKey || e?.metaKey) {
              setSelectedElementIds((prev) =>
                prev.includes(elementId) ? prev.filter((id) => id !== elementId) : [...prev, elementId]
              );
            } else {
              setSelectedElementIds([elementId]);
            }
          }}
          onCanvasClick={() => setSelectedElementIds([])}
          selectedElementIds={selectedElementIds}
          onUpdateElement={handleUpdateElement}
          onRemoveElement={handleRemoveElement}
          onReplaceImage={handleReplaceImage}
        />
        <div className="w-56 flex-shrink-0 border-l border-gray-200 bg-gray-50/80 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-gray-200 text-sm font-semibold text-gray-700">
            Layers
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1">
            {elements.length === 0 && (
              <div className="text-xs text-gray-500 px-2 py-2">No elements on this page.</div>
            )}
            {elements.map((el, idx) => {
              const isSel = selectedElementIds.includes(el.id);
              const label =
                el.type === 'text'
                  ? (el.content || 'Text').split('\n')[0].slice(0, 24)
                  : el.type === 'image'
                    ? (el.content ? 'Image' : 'Image area')
                    : 'Blocked area';
              return (
                <div
                  key={el.id}
                  className={`group rounded border ${isSel ? 'border-brand-red bg-white' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  draggable={el.type !== 'block'}
                  onDragStart={() => setDragLayerIndex(idx)}
                  onDragOver={(e) => {
                    if (dragLayerIndex === null) return;
                    e.preventDefault();
                  }}
                  onDrop={() => {
                    if (dragLayerIndex === null) return;
                    moveElement(dragLayerIndex, idx);
                    setDragLayerIndex(null);
                  }}
                >
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateElementWithHistory(el.id, (prev) => ({ ...prev, locked: !prev.locked }));
                      }}
                      className={`flex-shrink-0 p-0.5 rounded transition-colors ${
                        el.locked ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                      }`}
                      title={el.locked ? 'Unlock' : 'Lock'}
                      aria-label={el.locked ? 'Unlock' : 'Lock'}
                    >
                      <LockIcon locked={!!el.locked} className="w-3.5 h-3.5" />
                    </button>
                    {el.type !== 'block' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateElementWithHistory(el.id, (prev) => ({ ...prev, lockPosition: !prev.lockPosition }));
                        }}
                        className={`flex-shrink-0 p-0.5 rounded transition-colors ${
                          el.lockPosition ? 'text-sky-600 hover:bg-sky-50' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                        }`}
                        title={el.lockPosition ? 'Allow move' : 'Block move'}
                        aria-label={el.lockPosition ? 'Allow move' : 'Block move'}
                      >
                        <PinIcon pinned={!!el.lockPosition} className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          setSelectedElementIds((prev) =>
                            prev.includes(el.id) ? prev.filter((id) => id !== el.id) : [...prev, el.id]
                          );
                        } else {
                          setSelectedElementIds([el.id]);
                        }
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left"
                      title={label}
                    >
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 w-10 flex-shrink-0">
                        {el.type === 'text' ? 'Text' : el.type === 'image' ? 'Img' : 'Block'}
                      </span>
                      <span className="text-xs font-medium text-gray-700 truncate flex-1">{label}</span>
                    </button>
                  </div>
                  {isSel && selectedElementIds.length === 1 && el.type !== 'block' && (
                    <div className="px-2 pb-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveBackward(idx)}
                        className="px-2 py-1 rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        title="Send backward"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => moveForward(idx)}
                        className="px-2 py-1 rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        title="Bring forward"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => sendToBack(idx)}
                        className="px-2 py-1 rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        title="Send to back"
                      >
                        ⏮
                      </button>
                      <button
                        type="button"
                        onClick={() => bringToFront(idx)}
                        className="px-2 py-1 rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        title="Bring to front"
                      >
                        ⏭
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!isTemplate && (
      <AddPageModal
        open={showAddPageModal}
        templates={templates}
        onClose={() => setShowAddPageModal(false)}
        onAddPage={handleAddPageWithTemplate}
        onAddPages={handleAddPages}
      />
      )}
    </div>
  );
}
