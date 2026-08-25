import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { withFileAccessToken } from '@/lib/api';
import { DocumentPagePreviewThumbnails } from '@/components/DocumentPagePreviewThumbnails';
import { AppInput, uiCx, uiSpacing, uiTypography } from '@/components/ui';
import { GRID_CARD_CLASS, GRID_CLASS, GRID_THUMB_WIDTH_PX, PICKER_BODY_HEIGHT_CLASS } from '@/components/DocumentTypePicker';

export type BackgroundPageTemplate = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
};

type BackgroundPagePickerProps = {
  templates: BackgroundPageTemplate[];
  onSelect: (templateId: string | null) => void;
  designSystem?: boolean;
};

function BackgroundGridCard({
  name,
  subtitle,
  backgroundFileId,
  onClick,
}: {
  name: string;
  subtitle?: string;
  backgroundFileId?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={GRID_CARD_CLASS} title={name}>
      <div className="w-full bg-gray-50 flex items-center justify-center py-4 px-2 min-h-[200px]">
        {backgroundFileId ? (
          <img
            src={withFileAccessToken(`/files/${backgroundFileId}/thumbnail?w=320`)}
            alt=""
            className="max-h-[180px] w-auto object-contain rounded border border-gray-200 shadow-sm"
          />
        ) : (
          <DocumentPagePreviewThumbnails pages={[]} templates={[]} maxPages={1} thumbWidthPx={GRID_THUMB_WIDTH_PX} />
        )}
      </div>
      <div className="px-2 pb-2 pt-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 truncate block leading-tight">{name}</span>
        {subtitle ? (
          <span className="text-[11px] text-gray-500 truncate block leading-tight mt-0.5">{subtitle}</span>
        ) : null}
      </div>
    </button>
  );
}

export function BackgroundPagePicker({
  templates,
  onSelect,
  designSystem = true,
}: BackgroundPagePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const q = searchQuery.trim().toLowerCase();

  const filteredTemplates = useMemo(() => {
    if (!q) return templates;
    return templates.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [templates, q]);

  return (
    <div className={uiCx(PICKER_BODY_HEIGHT_CLASS, 'flex flex-col gap-3')}>
      <div className="shrink-0">
        <AppInput
          label="Search"
          placeholder="Search backgrounds..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          aria-label="Search backgrounds"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
        {filteredTemplates.length === 0 ? (
          <div className={designSystem ? uiSpacing.sectionStack : 'space-y-4'}>
            <div className={GRID_CLASS}>
              <BackgroundGridCard
                name="Blank (single page)"
                subtitle="No background, one empty page"
                onClick={() => onSelect(null)}
              />
            </div>
            <p
              className={
                designSystem
                  ? uiCx(uiTypography.helper, 'py-2 text-center')
                  : 'text-sm text-gray-500 py-2 text-center'
              }
            >
              No backgrounds match your search.
            </p>
          </div>
        ) : (
          <div className={GRID_CLASS}>
            <BackgroundGridCard
              name="Blank (single page)"
              subtitle="No background, one empty page"
              onClick={() => onSelect(null)}
            />
            {filteredTemplates.map((t) => (
              <BackgroundGridCard
                key={t.id}
                name={t.name}
                subtitle={t.description}
                backgroundFileId={t.background_file_id}
                onClick={() => onSelect(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
