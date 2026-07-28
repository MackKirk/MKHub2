import { useState, type ReactNode } from 'react';
import {
  AppButton,
  AppEmptyState,
  AppInput,
  uiBorders,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { partitionCategoriesInUse } from './filesLibraryHomeHelpers';
import type { FilesLibraryHomeCategory, ProjectFilesHomeProps } from './filesLibraryHomeTypes';

const TILE_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2';

const TILE_BASE_CLASS = uiCx(
  'group flex aspect-square w-full flex-col items-start justify-between p-3 text-left',
  uiBorders.subtle,
  uiRadius.control,
  'bg-white transition-colors',
  'hover:bg-gray-50 hover:border-gray-300',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30',
);

function formatFileFolderCounts(
  fileCount: number,
  folderCount: number,
  supportsFolders: boolean,
): string {
  const filesLabel = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
  if (!supportsFolders || folderCount === 0) return filesLabel;
  return `${filesLabel} · ${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`;
}

function buildCategoryAriaLabel(
  name: string,
  fileCount: number,
  folderCount: number,
  supportsFolders: boolean,
): string {
  const filesPart = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
  if (!supportsFolders || folderCount === 0) {
    return `Open ${name} category, ${filesPart}`;
  }
  const foldersPart = `${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`;
  return `Open ${name} category, ${filesPart} and ${foldersPart}`;
}

function CategoryTile({
  category,
  supportsFolders,
  designSystem,
  onOpen,
}: {
  category: FilesLibraryHomeCategory;
  supportsFolders: boolean;
  designSystem: boolean;
  onOpen: () => void;
}) {
  const icon = category.icon ?? '📁';
  const counts = formatFileFolderCounts(category.fileCount, category.folderCount, supportsFolders);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={TILE_BASE_CLASS}
      aria-label={buildCategoryAriaLabel(
        category.name,
        category.fileCount,
        category.folderCount,
        supportsFolders,
      )}
    >
      <span className="text-xl leading-none" aria-hidden>
        {typeof icon === 'string' ? icon : icon}
      </span>
      <div className="min-w-0 w-full">
        <div
          className={
            designSystem
              ? uiCx(uiTypography.body, 'truncate text-sm font-medium text-gray-900')
              : 'truncate text-sm font-semibold text-gray-900'
          }
          title={category.name}
        >
          {category.name}
        </div>
        <div className={uiCx(designSystem ? uiTypography.helper : 'text-xs text-gray-500', 'truncate')}>
          {counts}
        </div>
      </div>
    </button>
  );
}

function AllFilesTile({
  totalFileCount,
  totalFolderCount,
  supportsFolders,
  designSystem,
  onOpen,
}: {
  totalFileCount: number;
  totalFolderCount: number;
  supportsFolders: boolean;
  designSystem: boolean;
  onOpen: () => void;
}) {
  const counts = formatFileFolderCounts(totalFileCount, totalFolderCount, supportsFolders);
  const ariaLabel = (() => {
    const filesPart = `${totalFileCount} ${totalFileCount === 1 ? 'file' : 'files'}`;
    if (!supportsFolders || totalFolderCount === 0) {
      return `Open All Files, ${filesPart}`;
    }
    const foldersPart = `${totalFolderCount} ${totalFolderCount === 1 ? 'folder' : 'folders'}`;
    return `Open All Files, ${filesPart} and ${foldersPart}`;
  })();

  return (
    <button
      type="button"
      onClick={onOpen}
      className={uiCx(
        TILE_BASE_CLASS,
        'border-brand-red/25 bg-brand-red/[0.03] hover:border-brand-red/40 hover:bg-brand-red/[0.06]',
      )}
      aria-label={ariaLabel}
    >
      <span className="text-xl leading-none" aria-hidden>📚</span>
      <div className="min-w-0 w-full">
        <div
          className={
            designSystem
              ? uiCx(uiTypography.body, 'truncate text-sm font-medium text-gray-900')
              : 'truncate text-sm font-semibold text-gray-900'
          }
        >
          All Files
        </div>
        <div className={uiCx(designSystem ? uiTypography.helper : 'text-xs text-gray-500', 'truncate')}>
          {counts}
        </div>
      </div>
    </button>
  );
}

export default function ProjectFilesHome({
  title,
  description,
  categories,
  totalFileCount,
  totalFolderCount,
  canWrite,
  designSystem = false,
  supportsFolders = true,
  supportsCreateFolder = true,
  uncategorizedFileCount = 0,
  showUncategorizedCard = false,
  onOpenAllFiles,
  onOpenCategory,
  onOpenUncategorized,
  onSearch,
  onUpload,
  onCreateFolder,
}: ProjectFilesHomeProps) {
  const [searchInput, setSearchInput] = useState('');

  const { inUse, empty } = partitionCategoriesInUse(categories);

  const handleSearch = () => {
    onSearch(searchInput.trim());
  };

  const uncategorizedCard: FilesLibraryHomeCategory | null = showUncategorizedCard
    ? {
        id: 'uncategorized',
        name: 'Uncategorized',
        icon: '📦',
        fileCount: uncategorizedFileCount,
        folderCount: 0,
        canWrite: canWrite,
      }
    : null;

  const inUseWithUncat = uncategorizedCard ? [...inUse, uncategorizedCard] : inUse;

  const noCategories = categories.length === 0 && !showUncategorizedCard;

  const openCategory = (cat: FilesLibraryHomeCategory) => {
    if (cat.id === 'uncategorized' && onOpenUncategorized) {
      onOpenUncategorized();
    } else {
      onOpenCategory(cat.id);
    }
  };

  const toolbarActions = designSystem ? (
    <>
      {canWrite ? (
        <>
          <AppButton type="button" size="sm" onClick={onUpload}>Upload</AppButton>
          {supportsCreateFolder ? (
            <AppButton type="button" variant="secondary" size="sm" onClick={onCreateFolder}>
              New Folder
            </AppButton>
          ) : null}
        </>
      ) : null}
    </>
  ) : (
    <>
      {canWrite ? (
        <>
          <button
            type="button"
            onClick={onUpload}
            className="rounded bg-brand-red px-2 py-1.5 text-xs font-medium text-white"
          >
            Upload
          </button>
          {supportsCreateFolder ? (
            <button
              type="button"
              onClick={onCreateFolder}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              New Folder
            </button>
          ) : null}
        </>
      ) : null}
    </>
  );

  const searchInputEl = designSystem ? (
    <AppInput
      className="min-w-0 w-full"
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSearch();
      }}
      placeholder="Search all project files..."
      aria-label="Search all project files"
    />
  ) : (
    <input
      type="search"
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSearch();
      }}
      placeholder="Search all project files..."
      aria-label="Search all project files"
      className="min-w-0 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red"
    />
  );

  const categoriesSection = (
    <section className="min-w-0">
      <h4 className={uiCx(uiTypography.sectionTitle, 'mb-2 text-sm')}>Categories</h4>
      <div className={TILE_GRID_CLASS}>
        {inUseWithUncat.map((cat) => (
          <CategoryTile
            key={cat.id}
            category={cat}
            supportsFolders={supportsFolders}
            designSystem={designSystem}
            onOpen={() => openCategory(cat)}
          />
        ))}
        {empty.map((cat) => (
          <CategoryTile
            key={cat.id}
            category={cat}
            supportsFolders={supportsFolders}
            designSystem={designSystem}
            onOpen={() => onOpenCategory(cat.id)}
          />
        ))}
        <AllFilesTile
          totalFileCount={totalFileCount}
          totalFolderCount={totalFolderCount}
          supportsFolders={supportsFolders}
          designSystem={designSystem}
          onOpen={onOpenAllFiles}
        />
      </div>
    </section>
  );

  let body: ReactNode;

  if (noCategories) {
    body = designSystem ? (
      <AppEmptyState
        className="border-0 py-12 shadow-none"
        title="No file categories are available for your account."
        description="Contact an administrator if you need access to project files."
      />
    ) : (
      <div className="py-12 text-center text-sm text-gray-500">
        No file categories are available for your account.
      </div>
    );
  } else {
    body = categoriesSection;
  }

  const wrapperClass = designSystem
    ? uiCx('flex flex-col gap-3', uiSpacing.cardPadding)
    : 'flex flex-col gap-3 p-4';

  return (
    <div className={wrapperClass}>
      <div className="flex flex-col gap-2">
        <div className="min-w-0">
          <h3 className={designSystem ? uiTypography.sectionTitle : 'text-sm font-semibold text-gray-900'}>
            {title}
          </h3>
          <p className={designSystem ? uiTypography.sectionSubtitle : 'mt-0.5 text-xs text-gray-600'}>
            {description}
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">{searchInputEl}</div>
          {canWrite ? (
            <div className="flex flex-wrap gap-2">{toolbarActions}</div>
          ) : null}
        </div>
      </div>

      {body}
    </div>
  );
}

export type { FilesLibraryHomeFile, FilesLibraryHomeCategory, ProjectFilesHomeProps } from './filesLibraryHomeTypes';
