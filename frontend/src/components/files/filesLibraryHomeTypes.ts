import type { ReactNode } from 'react';

export type FilesLibraryHomeFile = {
  id: string;
  fileObjectId: string;
  name: string;
  categoryId?: string | null;
  categoryName?: string;
  folderId?: string | null;
  uploadedAt?: string | null;
  isImage?: boolean;
  contentType?: string;
  typeLabel?: string;
};

export type FilesLibraryHomeCategory = {
  id: string;
  name: string;
  icon?: ReactNode | string;
  fileCount: number;
  folderCount: number;
  latestUploadAt?: string | null;
  recentFileNames?: string[];
  canWrite: boolean;
};

export type ProjectFilesHomeProps = {
  title: string;
  description: string;
  categories: FilesLibraryHomeCategory[];
  totalFileCount: number;
  totalFolderCount: number;
  recentFiles: FilesLibraryHomeFile[];
  canWrite: boolean;
  designSystem?: boolean;
  supportsFolders?: boolean;
  supportsCreateFolder?: boolean;
  uncategorizedFileCount?: number;
  showUncategorizedCard?: boolean;
  onOpenAllFiles: () => void;
  onOpenCategory: (categoryId: string) => void;
  onOpenUncategorized?: () => void;
  onOpenRecentFile: (file: FilesLibraryHomeFile) => void;
  onSearch: (query: string) => void;
  onUpload: () => void;
  onCreateFolder: () => void;
};
