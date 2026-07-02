import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppButton, AppFormModal, AppSelect, uiCx, uiLayout } from '@/components/ui';
import {
  buildFolderOptionsForCategory,
  resolveInitialFolderValue,
  type FileLocationFolder,
  type FileLocationOption,
} from './fileLocationOptions';

export type FileMoveDestination = {
  category: string;
  folderId: string | null;
};

type FileMoveLocationModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  quickInfo?: ReactNode;
  categoryLabel?: string;
  folderLabel?: string;
  showFolderSelect?: boolean;
  categoryOptions: FileLocationOption[];
  folders: FileLocationFolder[];
  initialCategory: string;
  initialFolderId?: string | null;
  /** When set, empty folder selection maps to this id (Company Files root). */
  rootFolderId?: string | null;
  excludeFolderIds?: string[];
  selectedFileCount?: number;
  onCategoryChange?: (categoryId: string) => void;
  onMove: (destination: FileMoveDestination) => Promise<void>;
};

export function FileMoveLocationModal({
  open,
  onClose,
  title = 'Move files',
  description,
  quickInfo,
  categoryLabel = 'Category',
  folderLabel = 'Folder',
  showFolderSelect = true,
  categoryOptions,
  folders,
  initialCategory,
  initialFolderId,
  rootFolderId,
  excludeFolderIds,
  selectedFileCount = 1,
  onCategoryChange,
  onMove,
}: FileMoveLocationModalProps) {
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedFolder, setSelectedFolder] = useState(() =>
    resolveInitialFolderValue(initialFolderId, rootFolderId),
  );
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedCategory(initialCategory);
    setSelectedFolder(resolveInitialFolderValue(initialFolderId, rootFolderId));
  }, [open, initialCategory, initialFolderId, rootFolderId]);

  const folderOptions = useMemo(
    () =>
      showFolderSelect
        ? buildFolderOptionsForCategory(folders, selectedCategory, { excludeIds: excludeFolderIds })
        : [{ value: '', label: 'Root' }],
    [folders, selectedCategory, showFolderSelect, excludeFolderIds],
  );

  useEffect(() => {
    if (!open || !showFolderSelect) return;
    const valid = folderOptions.some((o) => o.value === selectedFolder);
    if (!valid) setSelectedFolder('');
  }, [open, showFolderSelect, folderOptions, selectedFolder]);

  const modalDescription =
    description ??
    (selectedFileCount > 1
      ? `Moving ${selectedFileCount} selected files.`
      : 'Choose where the file should live.');

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedFolder('');
    onCategoryChange?.(categoryId);
  };

  const handleMove = async () => {
    setMoving(true);
    try {
      const folderId =
        selectedFolder === ''
          ? rootFolderId ?? null
          : selectedFolder;
      await onMove({
        category: selectedCategory,
        folderId: showFolderSelect ? folderId : null,
      });
      onClose();
    } finally {
      setMoving(false);
    }
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description={modalDescription}
      quickInfo={quickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose} disabled={moving}>
            Cancel
          </AppButton>
          <AppButton size="sm" type="button" onClick={handleMove} loading={moving}>
            Move
          </AppButton>
        </div>
      }
    >
      <div className="space-y-4">
        <AppSelect
          label={categoryLabel}
          value={selectedCategory}
          options={categoryOptions}
          onChange={(e) => handleCategoryChange(e.target.value)}
          fieldHint={`${categoryLabel}\n\nChoose the file category or library section.`}
        />
        {showFolderSelect ? (
          <AppSelect
            label={folderLabel}
            value={selectedFolder}
            options={folderOptions}
            menuWidth={280}
            onChange={(e) => setSelectedFolder(e.target.value)}
            fieldHint={`${folderLabel}\n\nChoose Root or a folder inside the selected ${categoryLabel.toLowerCase()}.`}
          />
        ) : null}
      </div>
    </AppFormModal>
  );
}
