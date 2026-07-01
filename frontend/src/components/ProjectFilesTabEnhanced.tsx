import { useLocation } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import {
  readAllDirectoryEntries,
  getWebkitRelativePath,
  dropLooksLikeFolderTree,
  dataTransferMayContainDirectory,
} from '@/lib/projectFolderDrop';
import { formatDateTimeVancouver } from '@/lib/dateUtils';
import OverlayPortal from '@/components/OverlayPortal';
import {
  FileImagePreviewModal,
  useFileImageGallery,
} from '@/components/files';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  hasProjectFeatureWritePermission,
  isAdminRole,
  resolveProjectBusinessLine,
} from '@/lib/projectLinePermissionKeys';
import {
  projectFilesUploadQuickInfo,
  projectFilesNewFolderQuickInfo,
  projectFilesMoveCategoryQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppHeroEditButton,
  AppInput,
  AppListRowIconButton,
  AppModal,
  AppSectionHeader,
  AppSelect,
  AppTabs,
  AppTextarea,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type ProjectFile = {
  id: string;
  file_object_id: string;
  is_image?: boolean;
  content_type?: string;
  category?: string;
  folder_id?: string | null;
  original_name?: string;
  notes?: string | null;
  uploaded_at?: string;
};

export type ProjectFilesTabEnhancedProps = {
  projectId: string;
  businessLine?: string;
  files: ProjectFile[];
  onRefresh: () => any;
  designSystem?: boolean;
};

export default function ProjectFilesTabEnhanced({
  projectId,
  businessLine,
  files,
  onRefresh,
  designSystem = false,
}: ProjectFilesTabEnhancedProps) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{id:string, file:File, progress:number, status:'pending'|'uploading'|'success'|'error', error?:string}>>([]);
  const imageGallery = useFileImageGallery();
  const [previewPdf, setPreviewPdf] = useState<{ url:string, name:string }|null>(null);
  const [previewExcel, setPreviewExcel] = useState<{ url:string, name:string }|null>(null);
  const [sortBy, setSortBy] = useState<'uploaded_at' | 'name' | 'type'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderCategory, setNewFolderCategory] = useState<string>('');
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null);
  const [editingFileNameValue, setEditingFileNameValue] = useState('');
  const [moveModalFileId, setMoveModalFileId] = useState<string | null>(null);
  const [moveModalCategory, setMoveModalCategory] = useState<string>('uncategorized');
  const [notesModalFileId, setNotesModalFileId] = useState<string | null>(null);
  const [notesModalValue, setNotesModalValue] = useState('');
  const [notesModalEditing, setNotesModalEditing] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  /** Admin-only: library vs soft-deleted files pending purge */
  const [filesSection, setFilesSection] = useState<'active' | 'deleted'>('active');
  
  // Check permissions for files
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = isAdminRole(me?.roles);
  const permissions = new Set<string>(me?.permissions || []);
  const resolvedBusinessLine = useMemo(
    () => resolveProjectBusinessLine(businessLine, location.pathname),
    [businessLine, location.pathname]
  );

  const canWriteFiles = hasProjectFeatureWritePermission(
    permissions,
    resolvedBusinessLine,
    'files',
    isAdmin
  );

  const { data: categories } = useQuery({
    queryKey: ['file-categories'],
    queryFn: ()=>api<any[]>('GET', '/clients/file-categories')
  });

  const { data: categoryPerms } = useQuery({
    queryKey: ['project-files-category-perms', resolvedBusinessLine],
    queryFn: () =>
      api<any>(
        'GET',
        `/auth/me/project-files-category-permissions?business_line=${encodeURIComponent(resolvedBusinessLine)}`
      ),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  type ProjectDeletedFile = ProjectFile & { deleted_at?: string | null; deleted_by_id?: string | null };
  const { data: deletedFiles = [], refetch: refetchDeletedFiles } = useQuery({
    queryKey: ['projectDeletedFiles', projectId],
    queryFn: () => api<ProjectDeletedFile[]>('GET', `/projects/${encodeURIComponent(projectId)}/files/deleted`),
    enabled: !!projectId && isAdmin && filesSection === 'deleted',
  });

  useEffect(() => {
    if (!isAdmin && filesSection === 'deleted') setFilesSection('active');
  }, [isAdmin, filesSection]);

  const readAllowList: string[] | null = Array.isArray(categoryPerms?.read_categories) ? categoryPerms.read_categories : null;
  const writeAllowList: string[] | null = Array.isArray(categoryPerms?.write_categories) ? categoryPerms.write_categories : null;

  const isReadCategoryAllowed = useCallback(
    (categoryId: string) => {
      if (isAdmin) return true;
      return readAllowList === null ? true : readAllowList.includes(categoryId);
    },
    [readAllowList, isAdmin]
  );

  const isWriteCategoryAllowed = useCallback(
    (categoryId: string) => {
      if (isAdmin) return true;
      if (!canWriteFiles) return false;
      return writeAllowList === null ? true : writeAllowList.includes(categoryId);
    },
    [writeAllowList, canWriteFiles, isAdmin]
  );

  // Hide legacy/duplicate category "photos" (Pictures already covers this use-case)
  const visibleCategories = useMemo(() => {
    const base = (categories || []).filter((c: any) => String(c?.id || '') !== 'photos');
    // If a read allow-list is configured, only show allowed categories
    if (readAllowList !== null) {
      return base.filter((c: any) => readAllowList.includes(String(c?.id || '')));
    }
    return base;
  }, [categories, readAllowList]);
  
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: ()=>api<any>('GET', `/projects/${projectId}`)
  });

  type ProjectFolderItem = { id: string; name: string; category: string; parent_id: string | null; sort_index: number };
  const { data: projectFoldersRaw } = useQuery({
    queryKey: ['project-folders', projectId, selectedCategory],
    queryFn: () => api<ProjectFolderItem[]>('GET', `/projects/${projectId}/folders${selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'uncategorized' ? `?category=${encodeURIComponent(selectedCategory)}` : ''}`),
    enabled: !!projectId,
  });
  const projectFolders = projectFoldersRaw || [];

  // When switching category, clear folder selection if the folder is not in this category
  useEffect(() => {
    if (!selectedFolderId) return;
    const inCategory = projectFolders.some((f: ProjectFolderItem) => f.id === selectedFolderId);
    if (!inCategory) setSelectedFolderId(null);
  }, [selectedCategory, projectFolders, selectedFolderId]);

  // Organize files by category
  const filesByCategory = useMemo(() => {
    const grouped: Record<string, ProjectFile[]> = { 'all': [], 'uncategorized': [] };
    files.forEach(f => {
      const cat = f.category || 'uncategorized';
      if (!isReadCategoryAllowed(cat)) return;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
      grouped['all'].push(f);
    });
    return grouped;
  }, [files, isReadCategoryAllowed]);

  // If the currently selected category becomes unavailable due to permission filtering, reset to All.
  useEffect(() => {
    if (selectedCategory === 'all' || selectedCategory === 'uncategorized') return;
    if (!visibleCategories.find((c: any) => c.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [selectedCategory, visibleCategories]);

  const getFileTypeLabel = (f: ProjectFile): string => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    if (f.is_image || ct.startsWith('image/')) return 'Image';
    if (ct.includes('pdf') || ext === 'pdf') return 'PDF';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'Excel';
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return 'Word';
    if (['ppt', 'pptx'].includes(ext) || ct.includes('powerpoint')) return 'PowerPoint';
    return ext.toUpperCase() || 'File';
  };

  const currentFiles = useMemo(() => {
    let files = filesByCategory[selectedCategory] || [];
    // When a category is selected, filter by folder: root (folder_id null) or selected folder
    if (selectedCategory !== 'all' && selectedCategory !== 'uncategorized') {
      if (selectedFolderId) {
        files = files.filter((f: ProjectFile) => (f.folder_id || null) === selectedFolderId);
      } else {
        files = files.filter((f: ProjectFile) => !f.folder_id || f.folder_id === '' || f.folder_id === null);
      }
    }
    const q = fileSearchQuery.trim().toLowerCase();
    const filtered = q
      ? files.filter((f: ProjectFile) => (f.original_name || f.file_object_id || '').toLowerCase().includes(q))
      : files;
    const sorted = [...filtered].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      
      if (sortBy === 'uploaded_at') {
        aVal = a.uploaded_at || '';
        bVal = b.uploaded_at || '';
      } else if (sortBy === 'name') {
        aVal = (a.original_name || a.file_object_id || '').toLowerCase();
        bVal = (b.original_name || b.file_object_id || '').toLowerCase();
      } else if (sortBy === 'type') {
        aVal = getFileTypeLabel(a).toLowerCase();
        bVal = getFileTypeLabel(b).toLowerCase();
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [filesByCategory, selectedCategory, selectedFolderId, sortBy, sortOrder, fileSearchQuery]);

  // Folders at current level (Windows-style: show in category, click to enter). Root level = parent_id null; inside folder = parent_id = selectedFolderId
  const currentFolderChildren = useMemo(() => {
    if (selectedCategory === 'all' || selectedCategory === 'uncategorized') return [];
    const parentId = selectedFolderId || null;
    return projectFolders
      .filter((f: ProjectFolderItem) => (f.parent_id || null) === parentId)
      .sort((a: ProjectFolderItem, b: ProjectFolderItem) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  }, [projectFolders, selectedCategory, selectedFolderId]);

  // Parent folder id when we're inside a folder (for "Up" navigation)
  const currentParentFolderId = useMemo(() => {
    if (!selectedFolderId) return null;
    const folder = projectFolders.find((f: ProjectFolderItem) => f.id === selectedFolderId);
    return folder?.parent_id || null;
  }, [projectFolders, selectedFolderId]);

  // Breadcrumb path from root to current folder (for Location bar: "Root > Pasta A > Pasta B")
  const locationBreadcrumb = useMemo(() => {
    if (selectedCategory === 'all' || selectedCategory === 'uncategorized') return [];
    const path: { id: string | null; name: string }[] = [{ id: null, name: 'Root' }];
    if (!selectedFolderId) return path;
    let currentId: string | null = selectedFolderId;
    const chain: ProjectFolderItem[] = [];
    while (currentId) {
      const folder = projectFolders.find((f: ProjectFolderItem) => f.id === currentId);
      if (!folder) break;
      chain.unshift(folder);
      currentId = folder.parent_id || null;
    }
    chain.forEach((f: ProjectFolderItem) => path.push({ id: f.id, name: f.name }));
    return path;
  }, [selectedCategory, selectedFolderId, projectFolders]);
  
  const handleSort = (column: 'uploaded_at' | 'name' | 'type') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const iconFor = (f:ProjectFile)=>{
    const name = String(f.original_name||'');
    const ext = (name.includes('.')? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type||'').toLowerCase();
    const is = (x:string)=> ct.includes(x) || ext===x;
    if (is('pdf')) return { label:'PDF', color:'bg-red-500' };
    if (['xlsx','xls','csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return { label:'XLS', color:'bg-green-600' };
    if (['doc','docx'].includes(ext) || ct.includes('word')) return { label:'DOC', color:'bg-blue-600' };
    if (['ppt','pptx'].includes(ext) || ct.includes('powerpoint')) return { label:'PPT', color:'bg-orange-500' };
    if (['zip','rar','7z'].includes(ext) || ct.includes('zip')) return { label:'ZIP', color:'bg-gray-700' };
    if (is('txt')) return { label:'TXT', color:'bg-gray-500' };
    return { label: (ext||'FILE').toUpperCase().slice(0,4), color:'bg-gray-600' };
  };

  const getFileType = (f: ProjectFile): 'image' | 'pdf' | 'excel' | 'other' => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    
    if (f.is_image || ct.startsWith('image/')) return 'image';
    if (is('pdf')) return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'excel';
    return 'other';
  };

  const handleFilePreview = async (f: ProjectFile) => {
    const fileType = getFileType(f);
    const name = f.original_name || f.file_object_id;
    
    try {
      // Prefer /preview (inline SAS / local-inline) so PDFs open in the viewer instead of forcing download.
      const r: any = await api('GET', withFileAccessToken(`/files/${f.file_object_id}/preview`));
      const url = String(r.preview_url || r.download_url || '');
      
      if (!url) {
        toast.error('Preview not available');
        return;
      }

      if (fileType === 'image') {
        await imageGallery.openImage(
          f,
          currentFiles,
          (file) => getFileType(file) === 'image',
          (file) => file.file_object_id,
          (file) => file.original_name || file.file_object_id,
        );
        return;
      } else if (fileType === 'pdf') {
        setPreviewPdf({ url, name });
      } else if (fileType === 'excel') {
        // For Excel files, open in Office Online editor
        setPreviewExcel({ url, name });
      } else {
        // For other files, try to open in new tab
        window.open(url, '_blank');
      }
    } catch (_e) {
      toast.error('Preview not available');
    }
  };

  const fetchDownloadUrl = async (fid:string)=>{
    try{ const r:any = await api('GET', withFileAccessToken(`/files/${fid}/download`)); return String(r.download_url||''); }catch(_e){ toast.error('Download link unavailable'); return ''; }
  };

  const resolveUploadContext = useCallback(
    (targetCategory?: string | null, targetFolderId?: string | null) => {
      const category =
        targetCategory !== undefined
          ? targetCategory === 'uncategorized'
            ? null
            : targetCategory
          : selectedCategory === 'all' || selectedCategory === 'uncategorized'
            ? undefined
            : selectedCategory;

      const folderId =
        targetFolderId !== undefined
          ? targetFolderId
          : selectedCategory !== 'all' && selectedCategory !== 'uncategorized'
            ? selectedFolderId
            : null;

      return { category, folderId };
    },
    [selectedCategory, selectedFolderId]
  );

  const runQueuedUploads = async (
    pairs: { file: File; folder_id: string | null }[],
    category: string | null | undefined
  ) => {
    if (pairs.length === 0) return;

    const categoryIdForCheck =
      category === null || category === undefined || category === ''
        ? 'uncategorized'
        : String(category);
    if (!canWriteFiles || !isWriteCategoryAllowed(categoryIdForCheck)) {
      toast.error('You do not have permission to upload files to this category');
      return;
    }

    const newQueue = pairs.map((pair, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}`,
      file: pair.file,
      progress: 0,
      status: 'pending' as const,
    }));
    setUploadQueue((prev) => [...prev, ...newQueue]);

    for (let i = 0; i < newQueue.length; i++) {
      const item = newQueue[i];
      const folderId = pairs[i].folder_id;
      try {
        setUploadQueue((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: 'uploading' } : u))
        );

        const up: any = await api('POST', '/files/upload', {
          project_id: projectId,
          client_id: project?.client_id || null,
          employee_id: null,
          category_id: 'project-files',
          original_name: item.file.name,
          content_type: item.file.type || 'application/octet-stream',
        });

        await fetch(up.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': item.file.type || 'application/octet-stream',
            'x-ms-blob-type': 'BlockBlob',
          },
          body: item.file,
        });

        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: item.file.size,
          checksum_sha256: 'na',
          content_type: item.file.type || 'application/octet-stream',
        });

        const params = new URLSearchParams({
          file_object_id: conf.id,
          category: category || '',
          original_name: item.file.name,
        });
        if (folderId) params.set('folder_id', folderId);
        await api('POST', `/projects/${projectId}/files?${params.toString()}`);

        setUploadQueue((prev) =>
          prev.map((u) =>
            u.id === item.id ? { ...u, status: 'success', progress: 100 } : u
          )
        );
      } catch (e: any) {
        setUploadQueue((prev) =>
          prev.map((u) =>
            u.id === item.id
              ? { ...u, status: 'error', error: e.message || 'Upload failed' }
              : u
          )
        );
      }
    }

    await onRefresh();
    setTimeout(() => {
      setUploadQueue((prev) => prev.filter((u) => !newQueue.find((nq) => nq.id === u.id)));
    }, 2000);
  };

  const uploadMultiple = async (
    fileList: File[],
    targetCategory?: string | null,
    targetFolderId?: string | null
  ) => {
    const { category, folderId } = resolveUploadContext(targetCategory, targetFolderId);

    const categoryIdForCheck =
      category === null || category === undefined || category === ''
        ? 'uncategorized'
        : String(category);
    if (!canWriteFiles || !isWriteCategoryAllowed(categoryIdForCheck)) {
      toast.error('You do not have permission to upload files to this category');
      return;
    }

    const pairs = fileList.map((file) => ({ file, folder_id: folderId }));
    await runQueuedUploads(pairs, category);
  };

  const uploadFolderTreeFromDrop = async (
    dt: DataTransfer,
    targetCategory?: string | null,
    targetFolderId?: string | null
  ) => {
    const { category, folderId: baseFolderId } = resolveUploadContext(targetCategory, targetFolderId);

    const categoryIdForCheck =
      category === null || category === undefined || category === ''
        ? 'uncategorized'
        : String(category);
    if (!canWriteFiles || !isWriteCategoryAllowed(categoryIdForCheck)) {
      toast.error('You do not have permission to upload files to this category');
      return;
    }

    if (!category || category === 'uncategorized') {
      toast.error('Choose a single file category (not "All files") to import folders');
      return;
    }

    const folderCache = new Map<string, string>();
    const cacheKey = (parentId: string | null, name: string) =>
      `${parentId ?? '__root__'}\n${name.trim()}`;

    for (const f of projectFolders) {
      if (f.category !== category) continue;
      folderCache.set(cacheKey(f.parent_id || null, f.name), f.id);
    }

    let createdDirCount = 0;

    const ensureFolder = async (rawName: string, parentId: string | null): Promise<string> => {
      const trimmed = rawName.trim();
      if (!trimmed) throw new Error('Invalid folder name');
      const key = cacheKey(parentId, trimmed);
      const existing = folderCache.get(key);
      if (existing) return existing;

      const res = await api<{ id: string }>('POST', `/projects/${projectId}/folders`, {
        name: trimmed,
        category,
        ...(parentId ? { parent_id: parentId } : {}),
      });
      createdDirCount++;
      folderCache.set(key, res.id);
      return res.id;
    };

    const pairs: { file: File; folder_id: string | null }[] = [];

    const walkDirectory = async (
      dir: FileSystemDirectoryEntry,
      parentFolderId: string | null
    ) => {
      const myId = await ensureFolder(dir.name, parentFolderId);
      const reader = dir.createReader();
      const entries = await readAllDirectoryEntries(reader);
      for (const ent of entries) {
        if (ent.isFile) {
          await new Promise<void>((resolve, reject) => {
            (ent as FileSystemFileEntry).file(
              (file) => {
                pairs.push({ file, folder_id: myId });
                resolve();
              },
              reject
            );
          });
        } else if (ent.isDirectory) {
          await walkDirectory(ent as FileSystemDirectoryEntry, myId);
        }
      }
    };

    const items = Array.from(dt.items || []);
    const hasWebkitEntry =
      items.length > 0 &&
      typeof (items[0] as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry ===
        'function';

    if (hasWebkitEntry) {
      try {
        for (const item of items) {
          const entry = (
            item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }
          ).webkitGetAsEntry?.();
          if (!entry) continue;
          if (entry.isFile) {
            await new Promise<void>((resolve, reject) => {
              (entry as FileSystemFileEntry).file(
                (file) => {
                  pairs.push({ file, folder_id: baseFolderId });
                  resolve();
                },
                reject
              );
            });
          } else if (entry.isDirectory) {
            await walkDirectory(entry as FileSystemDirectoryEntry, baseFolderId);
          }
        }
      } catch (e) {
        console.warn('Folder entry walk failed, falling back to path list if available', e);
      }
    }

    if (pairs.length === 0) {
      const files = Array.from(dt.files || []);
      const sorted = [...files].sort((a, b) => {
        const pa = getWebkitRelativePath(a).split('/').filter(Boolean).length;
        const pb = getWebkitRelativePath(b).split('/').filter(Boolean).length;
        return pa - pb;
      });
      for (const file of sorted) {
        const rel = getWebkitRelativePath(file);
        if (!rel.includes('/')) {
          pairs.push({ file, folder_id: baseFolderId });
          continue;
        }
        const segments = rel.split('/').filter(Boolean);
        const fileName = segments.pop()!;
        let pid = baseFolderId;
        for (const seg of segments) {
          pid = await ensureFolder(seg, pid);
        }
        pairs.push({ file, folder_id: pid });
      }
    }

    if (pairs.length === 0 && createdDirCount === 0) {
      toast.error('Nothing to import');
      return;
    }

    if (pairs.length === 0 && createdDirCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      await onRefresh();
      toast.success(createdDirCount === 1 ? 'Folder created' : `${createdDirCount} folders created`);
      return;
    }

    await runQueuedUploads(pairs, category);
    queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
    const n = pairs.length;
    toast.success(n === 1 ? '1 file imported' : `${n} files imported`);
  };

  const uploadFromDrop = async (
    dt: DataTransfer,
    targetCategory?: string | null,
    targetFolderId?: string | null
  ) => {
    const tree = dropLooksLikeFolderTree(dt);
    const hasFiles = (dt.files?.length || 0) > 0;
    const emptyDirOnly = dataTransferMayContainDirectory(dt) && !hasFiles;

    if (tree || emptyDirOnly) {
      await uploadFolderTreeFromDrop(dt, targetCategory, targetFolderId);
      return;
    }

    if (hasFiles) {
      await uploadMultiple(Array.from(dt.files || []), targetCategory, targetFolderId);
    }
  };

  const handleMoveFile = async (fileId: string, newCategory: string) => {
    try {
      if (!canWriteFiles || !isWriteCategoryAllowed(newCategory)) {
        toast.error('You do not have permission to move files to this category');
        return;
      }
      await api('PUT', `/projects/${projectId}/files/${fileId}`, {
        category: newCategory === 'uncategorized' ? null : newCategory,
        folder_id: null, // move to root of the target category
      });
      await onRefresh();
      toast.success('File moved');
    } catch (_e) {
      toast.error('Failed to move file');
    }
  };

  const handleMoveFileToFolder = async (fileId: string, folderId: string | null) => {
    try {
      const file = files.find(f => f.id === fileId);
      const cat = file?.category || selectedCategory;
      if (cat === 'all' || cat === 'uncategorized') return;
      if (!canWriteFiles || !isWriteCategoryAllowed(cat)) {
        toast.error('You do not have permission to move files');
        return;
      }
      await api('PUT', `/projects/${projectId}/files/${fileId}`, {
        folder_id: folderId,
        ...(folderId ? {} : { category: cat })
      });
      await onRefresh();
      toast.success('File moved');
    } catch (_e) {
      toast.error('Failed to move file');
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    const category = newFolderCategory || selectedCategory;
    if (!name) return;
    if (category === 'all' || category === 'uncategorized' || !category) {
      toast.error('Select a category for the folder');
      return;
    }
    if (!canWriteFiles || !isWriteCategoryAllowed(category)) {
      toast.error('No permission to create folder in this category');
      return;
    }
    try {
      await api('POST', `/projects/${projectId}/folders`, {
        name,
        category,
        ...(selectedFolderId ? { parent_id: selectedFolderId } : {}),
      });
      setNewFolderName('');
      setNewFolderCategory('');
      setShowNewFolderModal(false);
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      await onRefresh();
      toast.success('Folder created');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create folder');
    }
  };

  const openNewFolderModal = () => {
    setNewFolderName('');
    setNewFolderCategory(selectedCategory === 'all' || selectedCategory === 'uncategorized' ? '' : selectedCategory);
    setShowNewFolderModal(true);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const result = await confirm({
      title: 'Delete folder',
      message: 'Delete this folder? It must be empty.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/projects/${projectId}/folders/${folderId}`);
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      await onRefresh();
      toast.success('Folder deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete folder');
    }
  };

  const handleMoveFolder = async (folderId: string, newParentId: string | null) => {
    if (!canWriteFiles) return;
    try {
      await api('PUT', `/projects/${projectId}/folders/${folderId}`, { parent_id: newParentId });
      setDraggedFolderId(null);
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      await onRefresh();
      toast.success('Folder moved');
    } catch (e: any) {
      setDraggedFolderId(null);
      toast.error(e?.message || 'Failed to move folder');
    }
  };

  const handleMoveFolderToCategory = async (folderId: string, categoryId: string) => {
    if (!canWriteFiles || !isWriteCategoryAllowed(categoryId)) {
      toast.error('You do not have permission to move folders to this category');
      return;
    }
    try {
      await api('PUT', `/projects/${projectId}/folders/${folderId}`, { category: categoryId });
      setDraggedFolderId(null);
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      await onRefresh();
      toast.success('Folder and its contents moved to category');
    } catch (e: any) {
      setDraggedFolderId(null);
      toast.error(e?.message || 'Failed to move folder');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    const result = await confirm({
      title: 'Delete file',
      message: 'Are you sure you want to remove this file from the project library?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      const file = files.find(f => f.id === fileId);
      const cat = (file?.category || 'uncategorized');
      if (!canWriteFiles || !isWriteCategoryAllowed(cat)) {
        toast.error('You do not have permission to delete files in this category');
        return;
      }
      await api('DELETE', `/projects/${projectId}/files/${fileId}`);
      await queryClient.invalidateQueries({ queryKey: ['projectDeletedFiles', projectId] });
      await onRefresh();
      toast.success('Removed from project');
    } catch (_e) {
      toast.error('Failed to delete file');
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      toast.error('File name cannot be empty');
      return;
    }
    if (trimmed.length > 255) {
      toast.error('File name is too long');
      return;
    }
    const file = files.find(f => f.id === fileId);
    const cat = (file?.category || 'uncategorized');
    if (!canWriteFiles || !isWriteCategoryAllowed(cat)) {
      toast.error('You do not have permission to rename files in this category');
      return;
    }
    try {
      await api('PUT', `/projects/${projectId}/files/${fileId}`, { original_name: trimmed });
      setEditingFileNameId(null);
      setEditingFileNameValue('');
      await onRefresh();
      toast.success('File renamed');
    } catch (_e) {
      toast.error('Failed to rename file');
    }
  };

  const startEditingFileName = (f: ProjectFile) => {
    setEditingFileNameId(f.id);
    setEditingFileNameValue(f.original_name || f.file_object_id || '');
  };

  const canEditFileInCategory = (f: ProjectFile) => {
    const cat = f.category || 'uncategorized';
    return canWriteFiles && isWriteCategoryAllowed(cat);
  };

  const openNotesModal = (f: ProjectFile) => {
    setNotesModalFileId(f.id);
    setNotesModalValue(f.notes ?? '');
    setNotesModalEditing(false);
  };

  const closeNotesModal = () => {
    setNotesModalFileId(null);
    setNotesModalValue('');
    setNotesModalEditing(false);
  };

  const startNotesEditing = () => {
    setNotesModalValue(notesModalFile?.notes ?? '');
    setNotesModalEditing(true);
  };

  const cancelNotesEditing = () => {
    setNotesModalValue(notesModalFile?.notes ?? '');
    setNotesModalEditing(false);
  };

  const handleSaveNotes = async () => {
    if (!notesModalFileId || savingNotes) return;
    const file = files.find(f => f.id === notesModalFileId);
    if (!file) return;
    if (!canEditFileInCategory(file)) {
      toast.error('You do not have permission to edit notes in this category');
      return;
    }
    const trimmed = notesModalValue.trim();
    if (trimmed.length > 1000) {
      toast.error('Notes must be 1000 characters or fewer');
      return;
    }
    setSavingNotes(true);
    try {
      await api('PUT', `/projects/${projectId}/files/${notesModalFileId}`, {
        notes: trimmed || null,
      });
      queryClient.setQueryData<ProjectFile[]>(['projectFiles', projectId], (old) =>
        (old ?? []).map(f =>
          f.id === notesModalFileId ? { ...f, notes: trimmed || null } : f,
        ),
      );
      setNotesModalEditing(false);
      toast.success('Notes saved');
    } catch (_e) {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const notesModalFile = useMemo(
    () => (notesModalFileId ? files.find(f => f.id === notesModalFileId) : undefined),
    [files, notesModalFileId],
  );
  const notesModalCanEdit = notesModalFile ? canEditFileInCategory(notesModalFile) : false;
  const notesModalSavedText = (notesModalFile?.notes ?? '').trim();

  const renderNotesModalBody = () => {
    if (notesModalEditing) {
      if (designSystem) {
        return (
          <AppTextarea
            label="Notes"
            value={notesModalValue}
            onChange={(e) => setNotesModalValue(e.target.value)}
            rows={6}
            maxLength={1000}
            autoFocus
            fieldHint="Notes\n\nOptional note about this file (max 1000 characters)."
          />
        );
      }
      return (
        <textarea
          value={notesModalValue}
          onChange={(e) => setNotesModalValue(e.target.value)}
          maxLength={1000}
          rows={6}
          autoFocus
          className="w-full text-xs border rounded px-2 py-1.5 resize-y"
          placeholder="Optional note about this file..."
        />
      );
    }

    if (!notesModalSavedText) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <p className="text-xs text-gray-500">No notes yet for this file.</p>
          {notesModalCanEdit && (
            <AppHeroEditButton title="Add note" onClick={startNotesEditing} />
          )}
        </div>
      );
    }

    return (
      <div className="flex items-start gap-2">
        <p className="flex-1 whitespace-pre-wrap text-xs text-gray-800">{notesModalFile?.notes}</p>
        {notesModalCanEdit && (
          <AppHeroEditButton title="Edit note" onClick={startNotesEditing} className="shrink-0" />
        )}
      </div>
    );
  };

  const renderNotesModalFooter = () => {
    if (notesModalEditing) {
      return (
        <>
          <AppButton variant="secondary" size="sm" type="button" onClick={cancelNotesEditing} disabled={savingNotes}>
            Cancel
          </AppButton>
          <AppButton size="sm" type="button" onClick={handleSaveNotes} loading={savingNotes}>
            Save
          </AppButton>
        </>
      );
    }
    return (
      <AppButton variant="secondary" size="sm" type="button" onClick={closeNotesModal}>
        Close
      </AppButton>
    );
  };

  const openMoveCategoryModal = (fileId: string) => {
    const f = files.find((x) => x.id === fileId);
    const cat = f?.category;
    if (!cat || cat === 'uncategorized') {
      setMoveModalCategory('uncategorized');
    } else if (visibleCategories.some((c: any) => c.id === cat)) {
      setMoveModalCategory(cat);
    } else {
      setMoveModalCategory('uncategorized');
    }
    setMoveModalFileId(fileId);
  };

  const handlePermanentDeleteFile = async (fileId: string) => {
    const result = await confirm({
      title: 'Delete permanently',
      message: 'Permanently delete this file from storage? This cannot be undone.',
      confirmText: 'Delete permanently',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/projects/${encodeURIComponent(projectId)}/files/deleted/${encodeURIComponent(fileId)}`);
      await refetchDeletedFiles();
      await onRefresh();
      toast.success('File permanently deleted');
    } catch (_e) {
      toast.error('Failed to delete file');
    }
  };

  const handleRestoreDeletedFile = async (fileId: string) => {
    try {
      await api('POST', `/projects/${encodeURIComponent(projectId)}/files/deleted/${encodeURIComponent(fileId)}/restore`);
      await refetchDeletedFiles();
      await onRefresh();
      toast.success('File restored to library');
    } catch (_e) {
      toast.error('Failed to restore file');
    }
  };


  const filesSectionTabs = isAdmin ? (
    <AppTabs
      tabs={[
        { key: 'active', label: 'Library' },
        { key: 'deleted', label: 'Deleted files' },
      ]}
      value={filesSection}
      onChange={(key) => setFilesSection(key as 'active' | 'deleted')}
    />
  ) : undefined;

  const moveCategoryOptions = useMemo(
    () => [
      { value: 'uncategorized', label: 'Uncategorized' },
      ...visibleCategories.map((cat: any) => ({ value: String(cat.id), label: String(cat.name) })),
    ],
    [visibleCategories],
  );

  const newFolderCategoryOptions = useMemo(
    () => [
      { value: '', label: 'Select category...' },
      ...visibleCategories.map((cat: any) => ({ value: String(cat.id), label: String(cat.name) })),
    ],
    [visibleCategories],
  );

  const folderSelectOptions = useMemo(
    () => [
      { value: '', label: 'Root' },
      ...projectFolders.map((folder: ProjectFolderItem) => ({
        value: folder.id,
        label: folder.name,
      })),
    ],
    [projectFolders],
  );

  const filesBrowserBody = (
        <>
        {isAdmin && filesSection === 'deleted' ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 overflow-hidden">
            <p className="text-xs text-amber-900 px-3 py-2 border-b border-amber-100/80">
              Same previews and downloads as the library. Restore returns the file to the project, or delete permanently to remove it from storage.
            </p>
            <div className="flex h-[calc(100vh-400px)] bg-white">
              <div className="flex-1 overflow-y-auto p-4">
                {Array.isArray(deletedFiles) && deletedFiles.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-12" aria-hidden />
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Name</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Type</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Category</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Removed</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-52">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {deletedFiles.map((df) => {
                          const icon = iconFor(df);
                          const isImg = df.is_image || String(df.content_type || '').startsWith('image/');
                          const name = df.original_name || df.file_object_id;
                          const pf = df as ProjectFile;
                          return (
                            <tr key={df.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                {isImg ? (
                                  <button
                                    type="button"
                                    className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 block"
                                    onClick={() => handleFilePreview(pf)}
                                    title="Preview"
                                  >
                                    <img
                                      src={withFileAccessToken(`/files/${df.file_object_id}/thumbnail?w=64`)}
                                      alt={name}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={`w-8 h-10 rounded-lg ${icon.color} text-white flex items-center justify-center text-[10px] font-extrabold`}
                                    onClick={() => handleFilePreview(pf)}
                                    title="Open / preview"
                                  >
                                    {icon.label}
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-left text-gray-900 truncate max-w-xs hover:text-brand-red"
                                  onClick={() => handleFilePreview(pf)}
                                >
                                  {name}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{getFileTypeLabel(df)}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">{df.category || '—'}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {df.deleted_at ? new Date(df.deleted_at).toLocaleString() : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const url = await fetchDownloadUrl(df.file_object_id);
                                      if (url) window.open(url, '_blank');
                                    }}
                                    title="Download"
                                    className="p-1 rounded hover:bg-gray-100 text-xs"
                                  >
                                    ⬇️
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreDeletedFile(df.id)}
                                    title="Restore to library"
                                    className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700"
                                  >
                                    Restore
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePermanentDeleteFile(df.id)}
                                    title="Delete permanently"
                                    className="px-2 py-1 rounded border border-red-200 text-red-700 text-[10px] font-medium hover:bg-red-50"
                                  >
                                    Purge
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : designSystem ? (
                  <AppEmptyState
                    className="border-0 py-16 shadow-none"
                    title="No deleted files for this project."
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-sm">
                    <div className="text-2xl mb-2">📁</div>
                    <div>No deleted files for this project.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
        
        {!(isAdmin && filesSection === 'deleted') && (
        <div
          className={
            designSystem
              ? 'overflow-hidden bg-white'
              : 'overflow-hidden rounded-xl border bg-white'
          }
        >
          <div className="flex h-[calc(100vh-400px)]">
            {/* Left Sidebar - Categories */}
            <div className="w-64 border-r bg-gray-50 flex flex-col">
              <div className="p-3 border-b">
                <div className="text-xs font-semibold text-gray-700">File Categories</div>
              </div>
            <div className="flex-1 overflow-y-auto">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${
                  selectedCategory === 'all' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">📁</span>
                  <span className="text-xs">All Files</span>
                  <span className="ml-auto text-[10px] text-gray-500">({filesByCategory['all']?.length || 0})</span>
                </div>
              </button>
              {visibleCategories.map((cat: any) => {
                const count = filesByCategory[cat.id]?.length || 0;
                const canEditCategory = canWriteFiles && isWriteCategoryAllowed(String(cat.id));
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    onDragOver={canEditCategory ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(true);
                    } : undefined}
                    onDragLeave={canEditCategory ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                    } : undefined}
                    onDrop={canEditCategory ? async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                      
                      // OS file / folder drop (folder tree → create project folders + upload)
                      const dtCat = e.dataTransfer;
                      if (dropLooksLikeFolderTree(dtCat) || (dtCat.files?.length || 0) > 0) {
                        await uploadFromDrop(dtCat, cat.id, undefined);
                        return;
                      }
                      
                      // Check if moving a folder to this category
                      const folderId = e.dataTransfer.getData('application/x-project-folder-id');
                      if (folderId) {
                        await handleMoveFolderToCategory(folderId, cat.id);
                        return;
                      }
                      
                      // Check if moving existing file to this category
                      if (draggedFileId) {
                        await handleMoveFile(draggedFileId, cat.id);
                        setDraggedFileId(null);
                      }
                    } : undefined}
                    className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${
                      selectedCategory === cat.id ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                    } ${isDragging && canEditCategory ? 'bg-blue-50' : ''} ${!canEditCategory ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{cat.icon || '📁'}</span>
                      <span className="text-xs">{cat.name}</span>
                      <span className="ml-auto text-[10px] text-gray-500">({count})</span>
                    </div>
                  </button>
                );
              })}
              {filesByCategory['uncategorized']?.length > 0 && (
                <button
                  onClick={() => setSelectedCategory('uncategorized')}
                  onDragOver={canWriteFiles ? (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); } : undefined}
                  onDragLeave={canWriteFiles ? (e) => { e.preventDefault(); setIsDragging(false); } : undefined}
                  onDrop={canWriteFiles ? async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    const dtUnc = e.dataTransfer;
                    if (dropLooksLikeFolderTree(dtUnc) || (dtUnc.files?.length || 0) > 0) {
                      await uploadFromDrop(dtUnc, 'uncategorized', undefined);
                      return;
                    }
                    const folderId = e.dataTransfer.getData('application/x-project-folder-id');
                    if (folderId) {
                      toast('Folders must stay in a category; drop on a category instead.');
                      return;
                    }
                    if (draggedFileId) {
                      await handleMoveFile(draggedFileId, 'uncategorized');
                      setDraggedFileId(null);
                    }
                  } : undefined}
                  className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${
                    selectedCategory === 'uncategorized' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                  } ${isDragging && canWriteFiles ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">📦</span>
                    <span className="text-xs">Uncategorized</span>
                    <span className="ml-auto text-[10px] text-gray-500">({filesByCategory['uncategorized']?.length || 0})</span>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Right Content Area */}
          <div 
            className={`flex-1 overflow-y-auto p-4 ${isDragging && canWriteFiles ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}
            onDragOver={canWriteFiles ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            } : undefined}
            onDragLeave={canWriteFiles ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            } : undefined}
            onDrop={canWriteFiles ? async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              
              const dtMain = e.dataTransfer;
              if (dropLooksLikeFolderTree(dtMain) || (dtMain.files?.length || 0) > 0) {
                const category =
                  selectedCategory === 'all'
                    ? undefined
                    : selectedCategory === 'uncategorized'
                      ? null
                      : selectedCategory;
                await uploadFromDrop(dtMain, category, undefined);
                return;
              }
              
              // Check if moving existing file
              if (draggedFileId && selectedCategory !== 'all' && selectedCategory !== 'uncategorized') {
                await handleMoveFile(draggedFileId, selectedCategory);
                setDraggedFileId(null);
              }
            } : undefined}
          >
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {designSystem ? (
                  <AppInput
                    className="flex-1 max-w-sm"
                    value={fileSearchQuery}
                    onChange={(e) => setFileSearchQuery(e.target.value)}
                    placeholder="Search by file name..."
                    fieldHint="Search\n\nFilter the file list by name in the current category or folder."
                  />
                ) : (
                <div className="relative flex-1 max-w-sm">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </span>
                  <input
                    type="text"
                    value={fileSearchQuery}
                    onChange={(e) => setFileSearchQuery(e.target.value)}
                    placeholder="Search by file name..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red"
                  />
                  {fileSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setFileSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Clear search"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                )}
                <div className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                  {selectedCategory === 'all' ? 'All Files' : 
                   selectedCategory === 'uncategorized' ? 'Uncategorized' :
                   visibleCategories.find((c: any) => c.id === selectedCategory)?.name || 'Files'}
                  <span className="ml-1 text-gray-500">({currentFiles.length})</span>
                </div>
              </div>
              {canWriteFiles && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {designSystem ? (
                    <>
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={openNewFolderModal}
                        title={selectedCategory !== 'all' && selectedCategory !== 'uncategorized' ? (selectedFolderId ? 'Create a subfolder inside the current folder' : 'Create a folder at the category root') : 'Create subfolder (choose category in modal)'}
                      >
                        {selectedFolderId ? 'Add subfolder' : 'Add folder'}
                      </AppButton>
                      <AppButton type="button" size="sm" onClick={() => setShowUpload(true)}>
                        + Upload File
                      </AppButton>
                    </>
                  ) : (
                    <>
                  <button
                    onClick={openNewFolderModal}
                    className="px-2 py-1.5 rounded border border-gray-300 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 flex items-center gap-1"
                    title={selectedCategory !== 'all' && selectedCategory !== 'uncategorized' ? (selectedFolderId ? 'Create a subfolder inside the current folder' : 'Create a folder at the category root') : 'Create subfolder (choose category in modal)'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-10 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                    {selectedFolderId ? 'Add subfolder' : 'Add folder'}
                  </button>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="px-2 py-1.5 rounded bg-brand-red text-white text-xs font-medium"
                  >
                    + Upload File
                  </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Location: breadcrumb only (hierarchy of current path) */}
            {selectedCategory !== 'all' && selectedCategory !== 'uncategorized' && (
              <div className="mb-3 flex flex-wrap items-center gap-1">
                <span className="text-xs text-gray-500">Location:</span>
                {locationBreadcrumb.map((item, index) => (
                  <span key={item.id ?? 'root'} className="inline-flex items-center gap-1">
                    {index > 0 && <span className="text-gray-400 text-xs">/</span>}
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(item.id)}
                      className={`px-2 py-1 rounded text-xs font-medium truncate max-w-[140px] ${item.id === selectedFolderId ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {item.name}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {showNewFolderModal && !designSystem && (
              <OverlayPortal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNewFolderModal(false)}>
                <div className="bg-white rounded-lg shadow-xl p-4 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-semibold mb-2">{selectedFolderId ? 'New subfolder' : 'New folder'}</h3>
                  {selectedFolderId && selectedCategory !== 'all' && selectedCategory !== 'uncategorized' && (
                    <p className="text-xs text-gray-600 mb-3">
                      Creating inside{' '}
                      <span className="font-medium text-gray-900">
                        {projectFolders.find((f: ProjectFolderItem) => f.id === selectedFolderId)?.name ?? 'folder'}
                      </span>
                    </p>
                  )}
                  {(selectedCategory === 'all' || selectedCategory === 'uncategorized') && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                      <select
                        value={newFolderCategory}
                        onChange={e => setNewFolderCategory(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                      >
                        <option value="">Select category...</option>
                        {visibleCategories.map((cat: any) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Folder name</label>
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      className="w-full border rounded px-3 py-2 text-sm"
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolderModal(false); }}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowNewFolderModal(false)} className="px-3 py-1.5 text-sm rounded border">Cancel</button>
                    <button
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim() || ((selectedCategory === 'all' || selectedCategory === 'uncategorized') && !newFolderCategory)}
                      className="px-3 py-1.5 text-sm rounded bg-brand-red text-white disabled:opacity-50"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div></OverlayPortal>
            )}

            <div className="rounded-lg border overflow-hidden bg-white">
              {(selectedCategory !== 'all' && selectedCategory !== 'uncategorized' && (currentParentFolderId !== null || currentFolderChildren.length > 0 || currentFiles.length > 0)) || (selectedCategory === 'all' || selectedCategory === 'uncategorized') && currentFiles.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-12"></th>
                        <th 
                          className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            Name
                            {sortBy === 'name' && (
                              <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('type')}
                        >
                          <div className="flex items-center gap-1">
                            Type
                            {sortBy === 'type' && (
                              <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('uploaded_at')}
                        >
                          <div className="flex items-center gap-1">
                            Upload Date
                            {sortBy === 'uploaded_at' && (
                              <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {/* Up one level - when inside a folder */}
                      {selectedCategory !== 'all' && selectedCategory !== 'uncategorized' && currentParentFolderId !== null && (
                        <tr
                          className="hover:bg-gray-50 cursor-pointer bg-gray-50/50"
                          onClick={() => setSelectedFolderId(currentParentFolderId)}
                        >
                          <td className="px-3 py-2">
                            <div className="w-8 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs font-semibold text-gray-600">..</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">—</td>
                          <td className="px-3 py-2 text-xs text-gray-500">—</td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      )}
                      {/* Folders first (Windows-style) */}
                      {selectedCategory !== 'all' && selectedCategory !== 'uncategorized' && currentFolderChildren.map((folder: ProjectFolderItem) => (
                        <tr
                          key={folder.id}
                          draggable={canWriteFiles}
                          onDragStart={canWriteFiles ? (e) => {
                            e.dataTransfer.setData('application/x-project-folder-id', folder.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggedFolderId(folder.id);
                          } : undefined}
                          onDragEnd={() => setDraggedFolderId(null)}
                          className={`hover:bg-gray-50 ${canWriteFiles ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${draggedFolderId === folder.id ? 'opacity-50' : ''}`}
                          onClick={() => setSelectedFolderId(folder.id)}
                        >
                          <td className="px-3 py-2">
                            <div className="w-8 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs font-semibold truncate max-w-xs">{folder.name}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">Folder</td>
                          <td className="px-3 py-2 text-xs text-gray-500">—</td>
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            {canWriteFiles && (
                              designSystem ? (
                                <AppListRowIconButton
                                  preset="delete"
                                  label="Delete folder"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                                />
                              ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                                className="p-1 rounded hover:bg-red-50 text-red-600 text-xs"
                                title="Delete folder"
                              >
                                🗑️
                              </button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                      {/* Files */}
                      {currentFiles.map((f) => {
                        const icon = iconFor(f);
                        const isImg = f.is_image || String(f.content_type || '').startsWith('image/');
                        const name = f.original_name || f.file_object_id;
                        
                        return (
                          <tr
                            key={f.id}
                            draggable={canWriteFiles}
                            onDragStart={() => canWriteFiles && setDraggedFileId(f.id)}
                            onDragEnd={() => setDraggedFileId(null)}
                            className={`hover:bg-gray-50 ${canWriteFiles ? 'cursor-move' : ''}`}
                          >
                            <td className="px-3 py-2">
                              {isImg ? (
                                <div 
                                  className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 cursor-pointer flex-shrink-0"
                                  onClick={() => handleFilePreview(f)}
                                >
                                  <img 
                                    src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=64`)}
                                    alt={name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div 
                                  className={`w-8 h-10 rounded-lg ${icon.color} text-white flex items-center justify-center text-[10px] font-extrabold select-none flex-shrink-0 cursor-pointer`}
                                  onClick={() => handleFilePreview(f)}
                                >
                                  {icon.label}
                                </div>
                              )}
                            </td>
                            <td 
                              className="px-3 py-2"
                              onClick={(e) => { if (editingFileNameId !== f.id) { e.stopPropagation(); handleFilePreview(f); } }}
                            >
                              {editingFileNameId === f.id ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  {designSystem ? (
                                    <>
                                      <AppInput
                                        className="max-w-xs flex-1"
                                        value={editingFileNameValue}
                                        onChange={e => setEditingFileNameValue(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleRenameFile(f.id, editingFileNameValue);
                                          if (e.key === 'Escape') { setEditingFileNameId(null); setEditingFileNameValue(''); }
                                        }}
                                        autoFocus
                                      />
                                      <AppButton variant="ghost" size="sm" type="button" onClick={() => handleRenameFile(f.id, editingFileNameValue)}>
                                        Save
                                      </AppButton>
                                      <AppButton variant="ghost" size="sm" type="button" onClick={() => { setEditingFileNameId(null); setEditingFileNameValue(''); }}>
                                        Cancel
                                      </AppButton>
                                    </>
                                  ) : (
                                    <>
                                  <input
                                    type="text"
                                    value={editingFileNameValue}
                                    onChange={e => setEditingFileNameValue(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleRenameFile(f.id, editingFileNameValue);
                                      if (e.key === 'Escape') { setEditingFileNameId(null); setEditingFileNameValue(''); }
                                    }}
                                    className="text-xs font-semibold border rounded px-2 py-1 max-w-xs flex-1"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleRenameFile(f.id, editingFileNameValue)}
                                    title="Save"
                                    className="p-1 rounded hover:bg-green-100 text-green-700 text-xs"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => { setEditingFileNameId(null); setEditingFileNameValue(''); }}
                                    title="Cancel"
                                    className="p-1 rounded hover:bg-gray-100 text-xs"
                                  >
                                    Cancel
                                  </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <div className="text-xs font-semibold truncate max-w-xs cursor-pointer">{name}</div>
                                  {canWriteFiles && (
                                    designSystem ? (
                                      <AppListRowIconButton
                                        preset="edit"
                                        label="Rename"
                                        onClick={(e) => { e.stopPropagation(); startEditingFileName(f); }}
                                      />
                                    ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); startEditingFileName(f); }}
                                      title="Rename"
                                      className="p-1 rounded hover:bg-gray-100 text-xs flex-shrink-0"
                                    >
                                      Edit
                                    </button>
                                    )
                                  )}
                                  {designSystem ? (
                                    <AppListRowIconButton
                                      icon="🗒️"
                                      label="Notes"
                                      onClick={(e) => { e.stopPropagation(); openNotesModal(f); }}
                                    />
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openNotesModal(f); }}
                                      title="Notes"
                                      className="p-1 rounded hover:bg-gray-100 text-xs flex-shrink-0"
                                    >
                                      Notes
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td 
                              className="px-3 py-2 cursor-pointer"
                              onClick={() => handleFilePreview(f)}
                            >
                              <div className="text-xs text-gray-600">{getFileTypeLabel(f)}</div>
                            </td>
                            <td 
                              className="px-3 py-2 cursor-pointer"
                              onClick={() => handleFilePreview(f)}
                            >
                              <div className="text-xs text-gray-600 whitespace-nowrap">
                                {f.uploaded_at ? formatDateTimeVancouver(f.uploaded_at) : '-'}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const url = await fetchDownloadUrl(f.file_object_id);
                                    if (url) window.open(url, '_blank');
                                  }}
                                  title="Download"
                                  className="p-1 rounded hover:bg-gray-100 text-xs"
                                >
                                  ⬇️
                                </button>
                                {canWriteFiles && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMoveCategoryModal(f.id);
                                      }}
                                      title="Move to category"
                                      className="p-1 rounded hover:bg-gray-100 text-xs"
                                    >
                                      📦
                                    </button>
                                    {selectedCategory !== 'all' && selectedCategory !== 'uncategorized' && (
                                      designSystem ? (
                                        <AppSelect
                                          className="max-w-[100px]"
                                          value={f.folder_id || ''}
                                          options={folderSelectOptions}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            handleMoveFileToFolder(f.id, v === '' ? null : v);
                                          }}
                                          fieldHint={'Folder\n\nMove this file to another folder in the category.'}
                                        />
                                      ) : (
                                      <select
                                        title="Move to folder"
                                        value={f.folder_id || ''}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          handleMoveFileToFolder(f.id, v === '' ? null : v);
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        className="p-1 rounded border text-xs max-w-[100px]"
                                      >
                                        <option value="">Root</option>
                                        {projectFolders.map((folder: ProjectFolderItem) => (
                                          <option key={folder.id} value={folder.id}>{folder.name}</option>
                                        ))}
                                      </select>
                                      )
                                    )}
                                    {designSystem ? (
                                    <AppListRowIconButton
                                      preset="delete"
                                      label="Delete"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id); }}
                                    />
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteFile(f.id);
                                      }}
                                      title="Delete"
                                      className="p-1 rounded hover:bg-red-50 text-red-600 text-xs"
                                    >
                                      Delete
                                    </button>
                                  )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : designSystem ? (
                <AppEmptyState
                  className="border-0 py-6 shadow-none"
                  title="No files in this category"
                  description={canWriteFiles ? 'Drag and drop files here or click Upload File.' : undefined}
                />
              ) : (
                <div className="px-3 py-6 text-center text-gray-500">
                  <div className="text-2xl mb-2">📁</div>
                  <div className="text-xs">No files in this category</div>
                  {canWriteFiles && (
                    <div className="text-[10px] mt-1">Drag and drop files here or click "Upload File"</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
        )}

        </>
  );

  return (
    <>
      {designSystem ? (
        <AppCard className="!rounded-2xl" bodyClassName="p-0">
          <div className={uiSpacing.cardPadding}>
            <AppSectionHeader
              title="Files"
              description="Document library for this project. Upload and organize by category and folder."
              {...appSectionPresetProps('files')}
              action={filesSectionTabs}
            />
          </div>
          <div className="border-t border-gray-100">{filesBrowserBody}</div>
        </AppCard>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <h2 className="text-sm font-semibold text-gray-900">Files</h2>
              </div>
              {filesSectionTabs}
            </div>
            {filesBrowserBody}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && designSystem && (
        <AppFormModal
          open
          onClose={() => setShowUpload(false)}
          title="Upload Files"
          quickInfo={projectFilesUploadQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={() => setShowUpload(false)}>
                Cancel
              </AppButton>
            </div>
          }
        >
          <AppFileUpload
            mode="multiple"
            value={[]}
            onChange={() => {}}
            onFilesSelected={async (added) => {
              if (added.length > 0) {
                setShowUpload(false);
                await uploadMultiple(added);
              }
            }}
            fieldHint="Files\n\nPick one or more files to add to the current category and folder. You can also drag files onto the file list."
          />
        </AppFormModal>
      )}
      {showUpload && !designSystem && (
        <OverlayPortal><div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3">Upload Files</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1.5">Files (multiple files supported)</div>
                <input
                  type="file"
                  multiple
                  onChange={async (e) => {
                    const fileList = e.target.files;
                    if (fileList && fileList.length > 0) {
                      setShowUpload(false);
                      await uploadMultiple(Array.from(fileList));
                    }
                  }}
                  className="w-full text-xs"
                />
              </div>
              <div className="text-[10px] text-gray-500">
                You can also drag and drop files directly onto the category area
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowUpload(false)}
                className="px-3 py-1.5 rounded border text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div></OverlayPortal>
      )}

      {moveModalFileId && designSystem && (
        <AppFormModal
          open
          onClose={() => setMoveModalFileId(null)}
          title="Move to category"
          quickInfo={projectFilesMoveCategoryQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={() => setMoveModalFileId(null)}>
                Cancel
              </AppButton>
              <AppButton
                size="sm"
                type="button"
                onClick={async () => {
                  if (!moveModalFileId) return;
                  await handleMoveFile(moveModalFileId, moveModalCategory);
                  setMoveModalFileId(null);
                }}
              >
                Move
              </AppButton>
            </div>
          }
        >
          <AppSelect
            label="Category"
            value={moveModalCategory}
            options={moveCategoryOptions}
            onChange={(e) => setMoveModalCategory(e.target.value)}
            fieldHint="Category\n\nChoose where this file should live. The file moves to the root of that category."
          />
        </AppFormModal>
      )}
      {notesModalFileId && designSystem && (
        <AppFormModal
          open
          onClose={closeNotesModal}
          title="File notes"
          description={notesModalFile?.original_name || notesModalFile?.file_object_id || undefined}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              {renderNotesModalFooter()}
            </div>
          }
        >
          {renderNotesModalBody()}
        </AppFormModal>
      )}
      {notesModalFileId && !designSystem && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={(e) => e.target === e.currentTarget && closeNotesModal()}
            role="presentation"
          >
            <div
              className="w-[480px] max-w-[95vw] bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="project-file-notes-title"
            >
              <div className="px-4 py-3 border-b">
                <h3 id="project-file-notes-title" className="text-sm font-semibold">File notes</h3>
                {notesModalFile && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {notesModalFile.original_name || notesModalFile.file_object_id}
                  </p>
                )}
              </div>
              <div className="p-4">
                {renderNotesModalBody()}
              </div>
              <div className="px-4 py-3 border-t flex justify-end gap-2">
                {notesModalEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelNotesEditing}
                      disabled={savingNotes}
                      className="px-3 py-1.5 rounded border text-xs disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      className="px-3 py-1.5 rounded bg-brand-red text-white text-xs disabled:opacity-50"
                    >
                      {savingNotes ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={closeNotesModal}
                    className="px-3 py-1.5 rounded border text-xs"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
      {moveModalFileId && !designSystem && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={(e) => e.target === e.currentTarget && setMoveModalFileId(null)}
            role="presentation"
          >
            <div
              className="w-[480px] max-w-[95vw] bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="project-move-category-title"
            >
              <div id="project-move-category-title" className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">
                Move to category
              </div>
              <div className="p-4 text-xs text-gray-700">
                <label htmlFor="project-move-category-select" className="block mb-2 font-medium text-gray-800">
                  Category
                </label>
                <select
                  id="project-move-category-select"
                  value={moveModalCategory}
                  onChange={(e) => setMoveModalCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                >
                  <option value="uncategorized">Uncategorized</option>
                  {visibleCategories.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="p-4 flex items-center justify-end gap-2 border-t border-gray-200">
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all"
                  onClick={() => setMoveModalFileId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 bg-brand-red text-white text-xs font-medium hover:opacity-90 transition-all"
                  onClick={async () => {
                    if (!moveModalFileId) return;
                    await handleMoveFile(moveModalFileId, moveModalCategory);
                    setMoveModalFileId(null);
                  }}
                >
                  Move
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {/* Upload Progress */}
      {uploadQueue.length > 0 && (designSystem ? (
        <AppCard
          className={uiCx('fixed bottom-4 right-4 z-50 w-80 max-h-96 overflow-hidden shadow-2xl', uiBorders.subtle, uiRadius.card)}
          bodyClassName="p-0"
        >
          <div className={uiCx('flex items-center justify-between border-b px-2.5 py-2', uiBorders.subtle, uiColors.surfaceSubtle)}>
            <div className={uiCx(uiTypography.sectionTitle, 'text-xs')}>Upload Progress</div>
            <AppButton variant="ghost" size="sm" type="button" onClick={() => setUploadQueue([])}>
              Clear
            </AppButton>
          </div>
          <div className="overflow-y-auto max-h-80">
            {uploadQueue.map((u) => (
              <div key={u.id} className={uiCx('border-b px-2.5 py-2', uiBorders.subtle)}>
                <div className="mb-1 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={uiCx(uiTypography.body, 'truncate text-xs font-medium')} title={u.file.name}>{u.file.name}</div>
                    <div className={uiTypography.helper}>{(u.file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                  <div className="text-xs">
                    {u.status === 'pending' && '…'}
                    {u.status === 'uploading' && '…'}
                    {u.status === 'success' && '✓'}
                    {u.status === 'error' && '✕'}
                  </div>
                </div>
                {u.status === 'uploading' && (
                  <div className={uiCx('mt-1 h-1.5 w-full overflow-hidden', uiRadius.badge, uiColors.surfaceSubtle)}>
                    <div
                      className={uiCx('h-full bg-blue-600 transition-all', uiRadius.badge)}
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
                {u.status === 'error' && (
                  <div className={uiCx(uiTypography.helper, 'mt-1 text-red-600')} title={u.error}>{u.error || 'Upload failed'}</div>
                )}
              </div>
            ))}
          </div>
        </AppCard>
      ) : (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border w-80 max-h-96 overflow-hidden z-50">
          <div className="p-2.5 border-b bg-gray-50 flex items-center justify-between">
            <div className="font-semibold text-xs">Upload Progress</div>
            <button
              onClick={() => setUploadQueue([])}
              className="text-gray-500 hover:text-gray-700 text-[10px]"
            >
              Clear
            </button>
          </div>
          <div className="overflow-y-auto max-h-80">
            {uploadQueue.map((u) => (
              <div key={u.id} className="p-2.5 border-b">
                <div className="flex items-start gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" title={u.file.name}>{u.file.name}</div>
                    <div className="text-[10px] text-gray-500">
                      {(u.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <div className="text-xs">
                    {u.status === 'pending' && '…'}
                    {u.status === 'uploading' && '…'}
                    {u.status === 'success' && '✓'}
                    {u.status === 'error' && '✕'}
                  </div>
                </div>
                {u.status === 'uploading' && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
                {u.status === 'error' && (
                  <div className="text-[10px] text-red-600 mt-1" title={u.error}>{u.error || 'Upload failed'}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {showNewFolderModal && designSystem && (
        <AppFormModal
          open
          onClose={() => setShowNewFolderModal(false)}
          title={selectedFolderId ? 'New subfolder' : 'New folder'}
          quickInfo={projectFilesNewFolderQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={() => setShowNewFolderModal(false)}>
                Cancel
              </AppButton>
              <AppButton
                size="sm"
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || ((selectedCategory === 'all' || selectedCategory === 'uncategorized') && !newFolderCategory)}
              >
                Create
              </AppButton>
            </div>
          }
        >
          <div className={uiSpacing.sectionStack}>
            {selectedFolderId && selectedCategory !== 'all' && selectedCategory !== 'uncategorized' && (
              <p className={uiTypography.helper}>
                Creating inside{' '}
                <span className="font-medium text-gray-900">
                  {projectFolders.find((f: ProjectFolderItem) => f.id === selectedFolderId)?.name ?? 'folder'}
                </span>
              </p>
            )}
            {(selectedCategory === 'all' || selectedCategory === 'uncategorized') && (
              <AppSelect
                label="Category"
                value={newFolderCategory}
                options={newFolderCategoryOptions}
                onChange={(e) => setNewFolderCategory(e.target.value)}
                fieldHint="Category\n\nFolders must belong to a file category."
              />
            )}
            <AppInput
              label="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowNewFolderModal(false);
              }}
              fieldHint="Folder name\n\nUse a short label your team will recognize in the breadcrumb."
            />
          </div>
        </AppFormModal>
      )}

      {/* Image Preview Modal */}
      <FileImagePreviewModal
        open={imageGallery.open}
        items={imageGallery.items}
        index={imageGallery.index}
        loading={imageGallery.loading}
        onClose={imageGallery.close}
        onPrev={imageGallery.goPrev}
        onNext={imageGallery.goNext}
        variant={designSystem ? 'modal' : 'legacy'}
        legacyActions={
          designSystem
            ? undefined
            : (item) =>
                item.url ? (
                  <button
                    type="button"
                    onClick={() => {
                      const printWindow = window.open();
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head><title>${item.name}</title></head>
                            <body style="margin:0; text-align:center;">
                              <img src="${item.url}" style="max-width:100%; height:auto;" onload="window.print();" />
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    title="Print"
                  >
                    🖨️
                  </button>
                ) : null
        }
      />

      {/* PDF Preview Modal */}
      {previewPdf && designSystem && (
        <AppModal
          open
          onClose={() => setPreviewPdf(null)}
          title={previewPdf.name}
          size="lg"
          bodyClassName="p-0"
          bodyFill
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end gap-2')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={() => setPreviewPdf(null)}>
                Close
              </AppButton>
              <AppButton
                size="sm"
                type="button"
                onClick={() => window.open(previewPdf.url, '_blank')}
              >
                Download
              </AppButton>
            </div>
          }
        >
          <iframe src={previewPdf.url} className="h-full w-full border-0" title={previewPdf.name} />
        </AppModal>
      )}
      {previewPdf && !designSystem && (
        <OverlayPortal><div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewPdf(null)}>
          <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold">{previewPdf.name}</h3>
              <div className="flex items-center gap-2">
                <a
                  href={previewPdf.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Open in new tab"
                >
                  🔗
                </a>
                <button
                  onClick={() => setPreviewPdf(null)}
                  className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe
                src={previewPdf.url}
                className="w-full h-full border-0"
                title={previewPdf.name}
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}

      {/* Excel Preview/Edit Modal */}
      {previewExcel && designSystem && (
        <AppModal
          open
          onClose={() => setPreviewExcel(null)}
          title={previewExcel.name}
          size="lg"
          bodyClassName="p-0"
          bodyFill
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end gap-2')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={() => setPreviewExcel(null)}>
                Close
              </AppButton>
              <AppButton
                size="sm"
                type="button"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = previewExcel.url;
                  a.download = previewExcel.name;
                  a.click();
                }}
              >
                Download
              </AppButton>
            </div>
          }
        >
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewExcel.url)}`}
            className="h-full w-full border-0"
            title={previewExcel.name}
            allow="fullscreen"
          />
        </AppModal>
      )}
      {previewExcel && !designSystem && (
        <OverlayPortal><div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewExcel(null)}>
          <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold">{previewExcel.name}</h3>
              <div className="flex items-center gap-2">
                <a
                  href={previewExcel.url}
                  download={previewExcel.name}
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Download"
                >
                  ⬇️
                </a>
                <a
                  href={previewExcel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Open in new tab"
                >
                  🔗
                </a>
                <button
                  onClick={() => setPreviewExcel(null)}
                  className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewExcel.url)}`}
                className="w-full h-full border-0"
                title={previewExcel.name}
                allow="fullscreen"
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </>
  );
}