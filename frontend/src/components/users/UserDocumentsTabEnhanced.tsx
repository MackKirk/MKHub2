import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import { useConfirm } from '@/components/ConfirmProvider';
import { FileImagePreviewModal, useFileImageGallery } from '@/components/files';
import {
  projectFilesMoveCategoryQuickInfo,
  projectFilesNewFolderQuickInfo,
  projectFilesUploadQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppListRowIconButton,
  AppModal,
  AppSectionHeader,
  AppSelect,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type UserDoc = {
  id: string;
  title?: string;
  file_id?: string;
  folder_id?: string | null;
  created_at?: string;
  content_type?: string;
  is_image?: boolean;
};

type UserFolder = {
  id: string;
  name: string;
  parent_id?: string | null;
};

type UploadQueueItem = {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
};

export default function UserDocumentsTabEnhanced({
  userId,
  canEdit,
  variant = 'user',
}: {
  userId: string;
  canEdit: boolean;
  /** `profile` = self-service /profile; `user` = HR user record (/users/:id). */
  variant?: 'profile' | 'user';
}) {
  const confirm = useConfirm();
  const { data: folders, refetch: refetchFolders } = useQuery({
    queryKey: ['user-folders', userId],
    queryFn: () => api<UserFolder[]>('GET', `/auth/users/${encodeURIComponent(userId)}/folders`),
  });
  const { data: allDocsRaw, refetch, isLoading: docsLoading, isError: docsError } = useQuery({
    queryKey: ['user-docs', userId],
    queryFn: () => api<UserDoc[]>('GET', `/auth/users/${encodeURIComponent(userId)}/documents`),
  });
  const allDocs = useMemo(() => {
    if (Array.isArray(allDocsRaw)) return allDocsRaw;
    if (allDocsRaw && typeof allDocsRaw === 'object' && Array.isArray((allDocsRaw as { data?: UserDoc[] }).data)) {
      return (allDocsRaw as { data: UserDoc[] }).data;
    }
    return [];
  }, [allDocsRaw]);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderCategory, setNewFolderCategory] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'uploaded_at' | 'name' | 'type'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const imageGallery = useFileImageGallery();
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [previewExcel, setPreviewExcel] = useState<{ url: string; name: string } | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null);
  const [editingFileNameValue, setEditingFileNameValue] = useState('');
  const [moveModalFileId, setMoveModalFileId] = useState<string | null>(null);
  const [moveModalCategory, setMoveModalCategory] = useState('');
  const defaultFoldersCreatedRef = useRef(false);

  useEffect(() => {
    if (!canEdit || !folders || folders.length > 0 || defaultFoldersCreatedRef.current) return;
    defaultFoldersCreatedRef.current = true;
    const names = ['HR Documents', 'Contracts', 'Training', 'Training certificates', 'Other'];
    (async () => {
      for (const name of names) {
        try {
          await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, { name });
        } catch {
          /* ignore */
        }
      }
      refetchFolders();
    })();
  }, [userId, canEdit, folders, refetchFolders]);

  const docs = allDocs;
  const topFolders = useMemo(() => (folders || []).filter((f) => !f.parent_id), [folders]);
  const folderDocCount = useCallback(
    (folderId: string) => docs.filter((d) => d.folder_id === folderId).length,
    [docs],
  );

  const foldersInCategory = useMemo(() => {
    if (selectedCategory === 'all') return [];
    return (folders || []).filter((f) => {
      const map = new Map<string, UserFolder>();
      (folders || []).forEach((x) => map.set(x.id, x));
      let cur: UserFolder | undefined = f;
      while (cur?.parent_id) cur = map.get(cur.parent_id);
      return cur?.id === selectedCategory;
    });
  }, [folders, selectedCategory]);

  const currentDocs = useMemo(() => {
    if (selectedCategory === 'all') return docs;
    const containerId = selectedFolderId || selectedCategory;
    return docs.filter((d) => d.folder_id === containerId);
  }, [docs, selectedCategory, selectedFolderId]);

  const childFolders = useMemo(() => {
    if (selectedCategory === 'all') return [];
    const parentId = selectedFolderId || selectedCategory;
    return (folders || [])
      .filter((f) => f.parent_id === parentId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  }, [folders, selectedCategory, selectedFolderId]);

  const currentParentFolderId = useMemo(() => {
    if (!selectedFolderId) return null;
    const f = (folders || []).find((x) => x.id === selectedFolderId);
    return f?.parent_id ?? null;
  }, [folders, selectedFolderId]);

  const locationBreadcrumb = useMemo(() => {
    if (selectedCategory === 'all') return [] as { id: string | null; name: string }[];
    const path: { id: string | null; name: string }[] = [{ id: null, name: 'Root' }];
    if (!selectedFolderId) return path;
    const map = new Map<string, UserFolder>();
    (folders || []).forEach((f) => map.set(f.id, f));
    let cur: UserFolder | undefined = map.get(selectedFolderId);
    const chain: UserFolder[] = [];
    while (cur) {
      chain.unshift(cur);
      cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
    }
    chain.forEach((f) => path.push({ id: f.id, name: f.name }));
    return path;
  }, [folders, selectedCategory, selectedFolderId]);

  const getDocTypeLabel = (d: UserDoc): string => {
    const name = String(d?.title || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(d.content_type || '').toLowerCase();
    if (d.is_image || ct.startsWith('image/')) return 'Image';
    if (['pdf'].includes(ext) || ct.includes('pdf')) return 'PDF';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'Excel';
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return 'Word';
    if (['ppt', 'pptx'].includes(ext) || ct.includes('powerpoint')) return 'PowerPoint';
    return ext ? ext.toUpperCase() : 'File';
  };

  const iconFor = (d: UserDoc) => {
    const name = String(d.title || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(d.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (is('pdf')) return { label: 'PDF', color: 'bg-red-500' };
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) {
      return { label: 'XLS', color: 'bg-green-600' };
    }
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return { label: 'DOC', color: 'bg-blue-600' };
    if (['ppt', 'pptx'].includes(ext) || ct.includes('powerpoint')) return { label: 'PPT', color: 'bg-orange-500' };
    if (['zip', 'rar', '7z'].includes(ext) || ct.includes('zip')) return { label: 'ZIP', color: 'bg-gray-700' };
    if (is('txt')) return { label: 'TXT', color: 'bg-gray-500' };
    return { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: 'bg-gray-600' };
  };

  const getFileType = (d: UserDoc): 'image' | 'pdf' | 'excel' | 'other' => {
    const name = String(d.title || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase() || '';
    const ct = String(d.content_type || '').toLowerCase();
    if (d.is_image || ct.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
      return 'image';
    }
    if (ext === 'pdf' || ct.includes('pdf')) return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'excel';
    return 'other';
  };

  const handleSort = (column: 'uploaded_at' | 'name' | 'type') => {
    if (sortBy === column) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const currentFiles = useMemo(() => {
    const q = fileSearchQuery.trim().toLowerCase();
    const list = q ? currentDocs.filter((d) => (d.title || '').toLowerCase().includes(q)) : currentDocs;
    return [...list].sort((a, b) => {
      let av: string;
      let bv: string;
      if (sortBy === 'uploaded_at') {
        av = a.created_at || '';
        bv = b.created_at || '';
      } else if (sortBy === 'name') {
        av = (a.title || '').toLowerCase();
        bv = (b.title || '').toLowerCase();
      } else {
        av = getDocTypeLabel(a).toLowerCase();
        bv = getDocTypeLabel(b).toLowerCase();
      }
      if (av < bv) return sortOrder === 'asc' ? -1 : 1;
      if (av > bv) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [currentDocs, fileSearchQuery, sortBy, sortOrder]);

  const moveCategoryOptions = useMemo(
    () => [
      { value: '', label: 'Uncategorized' },
      ...sortByLabel(topFolders, (f) => f.name || '').map((f) => ({
        value: String(f.id),
        label: String(f.name),
      })),
    ],
    [topFolders],
  );

  const newFolderCategoryOptions = useMemo(
    () => [
      { value: '', label: 'Select category...' },
      ...sortByLabel(topFolders, (f) => f.name || '').map((f) => ({
        value: String(f.id),
        label: String(f.name),
      })),
    ],
    [topFolders],
  );

  const folderSelectOptions = useMemo(() => {
    if (selectedCategory === 'all') return [];
    return [
      { value: selectedCategory, label: 'Root' },
      ...foldersInCategory
        .filter((f) => f.id !== selectedCategory)
        .map((f) => ({ value: f.id, label: f.name })),
    ];
  }, [selectedCategory, foldersInCategory]);

  const resolveUploadFolderId = () =>
    selectedCategory === 'all' ? null : selectedFolderId || selectedCategory;

  const runQueuedUploads = async (pairs: { file: File; folder_id: string | null }[]) => {
    if (!pairs.length || !canEdit) return;

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
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'uploading' } : u)));
        const type = item.file.type || 'application/octet-stream';
        const up = await api<{ upload_url: string; key: string }>('POST', '/files/upload', {
          original_name: item.file.name,
          content_type: type,
          employee_id: userId,
          project_id: null,
          client_id: null,
          category_id: userId,
        });
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
          body: item.file,
        });
        const conf = await api<{ id: string }>('POST', '/files/confirm', {
          key: up.key,
          size_bytes: item.file.size,
          checksum_sha256: 'na',
          content_type: type,
        });
        const payload: { title: string; file_id: string; folder_id?: string } = {
          title: item.file.name,
          file_id: conf.id,
        };
        if (folderId) payload.folder_id = folderId;
        await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, payload);
        setUploadQueue((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: 'success', progress: 100 } : u)),
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Upload failed';
        setUploadQueue((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: 'error', error: message } : u)),
        );
      }
    }

    await refetch();
    setTimeout(() => {
      setUploadQueue((prev) => prev.filter((u) => !newQueue.find((nq) => nq.id === u.id)));
    }, 2000);
  };

  const uploadMultiple = async (fileList: File[]) => {
    const folderId = resolveUploadFolderId();
    const pairs = fileList.map((file) => ({ file, folder_id: folderId }));
    await runQueuedUploads(pairs);
  };

  const fetchDownloadUrl = async (fileId: string) => {
    try {
      const r = await api<{ download_url?: string }>(
        'GET',
        withFileAccessToken(`/files/${encodeURIComponent(fileId)}/download`),
      );
      return String(r.download_url || '');
    } catch {
      toast.error('Download link unavailable');
      return '';
    }
  };

  const handleFilePreview = async (d: UserDoc) => {
    if (!d.file_id) return;
    const name = d.title || 'Document';
    try {
      const r = await api<{ preview_url?: string; download_url?: string }>(
        'GET',
        withFileAccessToken(`/files/${encodeURIComponent(d.file_id)}/preview`),
      );
      const url = String(r.preview_url || r.download_url || '');
      if (!url) {
        toast.error('Preview not available');
        return;
      }
      const ft = getFileType(d);
      if (ft === 'image') {
        await imageGallery.openImage(
          d,
          currentFiles,
          (doc) => getFileType(doc) === 'image',
          (doc) => doc.file_id || '',
          (doc) => doc.title || 'Document',
        );
        return;
      }
      if (ft === 'pdf') setPreviewPdf({ url, name });
      else if (ft === 'excel') setPreviewExcel({ url, name });
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Preview not available');
    }
  };

  const handleDeleteFile = async (docId: string) => {
    const doc = docs.find((d) => d.id === docId);
    const result = await confirm({
      title: 'Delete file',
      message: `Are you sure you want to remove "${doc?.title || 'file'}" from the library?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(docId)}`);
      await refetch();
      toast.success('Removed from library');
    } catch {
      toast.error('Failed to delete file');
    }
  };

  const handleRenameFile = async (docId: string, newName: string) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      toast.error('File name cannot be empty');
      return;
    }
    try {
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(docId)}`, {
        title: trimmed,
      });
      setEditingFileNameId(null);
      setEditingFileNameValue('');
      await refetch();
      toast.success('File renamed');
    } catch {
      toast.error('Failed to rename');
    }
  };

  const startEditingFileName = (d: UserDoc) => {
    setEditingFileNameId(d.id);
    setEditingFileNameValue(d.title || '');
  };

  const handleMoveFileToFolder = async (docId: string, folderId: string) => {
    if (selectedCategory === 'all') return;
    try {
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(docId)}`, {
        folder_id: folderId,
      });
      await refetch();
      toast.success('File moved');
    } catch {
      toast.error('Failed to move file');
    }
  };

  const openMoveCategoryModal = (docId: string) => {
    const doc = docs.find((d) => d.id === docId);
    if (!doc?.folder_id) {
      setMoveModalCategory('');
    } else {
      const map = new Map<string, UserFolder>();
      (folders || []).forEach((f) => map.set(f.id, f));
      let cur = map.get(doc.folder_id);
      while (cur?.parent_id) cur = map.get(cur.parent_id);
      setMoveModalCategory(cur?.id || doc.folder_id);
    }
    setMoveModalFileId(docId);
  };

  const handleMoveToCategory = async () => {
    if (!moveModalFileId) return;
    try {
      const payload: { folder_id?: string | null } = {};
      payload.folder_id = moveModalCategory || null;
      await api(
        'PUT',
        `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(moveModalFileId)}`,
        payload,
      );
      setMoveModalFileId(null);
      await refetch();
      toast.success('File moved');
    } catch {
      toast.error('Failed to move');
    }
  };

  const openNewFolderModal = () => {
    setNewFolderName('');
    setNewFolderCategory(selectedCategory === 'all' ? '' : selectedCategory);
    setShowNewFolderModal(true);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (selectedCategory === 'all' && !newFolderCategory) {
      toast.error('Select a category for the folder');
      return;
    }
    try {
      const body: { name: string; parent_id?: string } = { name };
      if (selectedCategory === 'all') body.parent_id = newFolderCategory;
      else body.parent_id = selectedFolderId || selectedCategory;
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, body);
      setNewFolderName('');
      setNewFolderCategory('');
      setShowNewFolderModal(false);
      await refetchFolders();
      toast.success('Folder created');
    } catch {
      toast.error('Failed to create folder');
    }
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
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(folderId)}`);
      if (selectedCategory === folderId) {
        setSelectedCategory('all');
        setSelectedFolderId(null);
      } else if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      await refetchFolders();
      toast.success('Folder deleted');
    } catch (e: unknown) {
      const detail = e && typeof e === 'object' && 'detail' in e ? String((e as { detail?: string }).detail) : '';
      toast.error(detail || 'Cannot delete folder');
    }
  };

  const showTable =
    (selectedCategory !== 'all' &&
      (currentParentFolderId !== null || childFolders.length > 0 || currentFiles.length > 0)) ||
    (selectedCategory === 'all' && currentFiles.length > 0);

  const activeFolderLabel =
    selectedCategory === 'all'
      ? 'All Files'
      : selectedFolderId
        ? (folders || []).find((x) => x.id === selectedFolderId)?.name || 'Files'
        : (folders || []).find((x) => x.id === selectedCategory)?.name || 'Files';

  const sectionTitle = 'Documents';
  const sectionDescription =
    variant === 'profile'
      ? 'Your document library. Upload and organize by category and folder.'
      : 'Employee document library. Upload and organize by category and folder.';

  const emptyStateTitle =
    selectedCategory === 'all' ? 'No documents yet' : 'No files in this category';
  const emptyStateDescription =
    selectedCategory === 'all'
      ? canEdit
        ? 'Select a category on the left, then upload files or create folders.'
        : undefined
      : canEdit
        ? 'Drag and drop files here or click Upload File.'
        : undefined;

  const filesBrowserBody = (
    <div className="overflow-hidden bg-white">
      <div className="flex h-[calc(100vh-400px)]">
        <div className="flex w-64 flex-col border-r bg-gray-50">
          <div className="border-b p-3">
            <div className="text-xs font-semibold text-gray-700">File Categories</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSelectedFolderId(null);
              }}
              className={`w-full border-b px-3 py-2 text-left transition-colors hover:bg-white ${
                selectedCategory === 'all'
                  ? 'border-l-4 border-l-brand-red bg-white font-semibold'
                  : 'text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">📁</span>
                <span className="text-xs">All Files</span>
                <span className="ml-auto text-[10px] text-gray-500">({docs.length})</span>
              </div>
            </button>
            {topFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(f.id);
                  setSelectedFolderId(null);
                }}
                className={`w-full border-b px-3 py-2 text-left transition-colors hover:bg-white ${
                  selectedCategory === f.id
                    ? 'border-l-4 border-l-brand-red bg-white font-semibold'
                    : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">📁</span>
                  <span className="truncate text-xs">{f.name}</span>
                  <span className="ml-auto text-[10px] text-gray-500">({folderDocCount(f.id)})</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div
          className={`flex-1 overflow-y-auto p-4 ${isDragging && canEdit ? 'border-2 border-dashed border-blue-400 bg-blue-50' : ''}`}
          onDragOver={
            canEdit
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }
              : undefined
          }
          onDragLeave={
            canEdit
              ? (e) => {
                  e.preventDefault();
                  setIsDragging(false);
                }
              : undefined
          }
          onDrop={
            canEdit
              ? async (e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.length) {
                    await uploadMultiple(Array.from(e.dataTransfer.files));
                    toast.success('Uploaded');
                  }
                  if (draggedFileId && selectedCategory !== 'all') {
                    try {
                      await api(
                        'PUT',
                        `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(draggedFileId)}`,
                        { folder_id: selectedFolderId || selectedCategory },
                      );
                      toast.success('Moved');
                      await refetch();
                    } catch {
                      toast.error('Failed to move');
                    }
                    setDraggedFileId(null);
                  }
                }
              : undefined
          }
        >
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <AppInput
                className="max-w-sm flex-1"
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                placeholder="Search by file name..."
                fieldHint="Search\n\nFilter the file list by name in the current category or folder."
              />
              <div className="whitespace-nowrap text-xs font-semibold text-gray-700">
                {activeFolderLabel}
                <span className="ml-1 text-gray-500">({currentFiles.length})</span>
              </div>
            </div>
            {canEdit && (
              <div className="flex flex-shrink-0 items-center gap-2">
                <AppButton type="button" variant="secondary" size="sm" onClick={openNewFolderModal}>
                  {selectedFolderId ? 'Add subfolder' : 'Add folder'}
                </AppButton>
                <AppButton type="button" size="sm" onClick={() => setShowUpload(true)}>
                  + Upload File
                </AppButton>
              </div>
            )}
          </div>

          {selectedCategory !== 'all' && (
            <div className="mb-3 flex flex-wrap items-center gap-1">
              <span className="text-xs text-gray-500">Location:</span>
              {locationBreadcrumb.map((item, index) => (
                <span key={item.id ?? 'root'} className="inline-flex items-center gap-1">
                  {index > 0 && <span className="text-xs text-gray-400">/</span>}
                  <button
                    type="button"
                    onClick={() => setSelectedFolderId(item.id)}
                    className={`max-w-[140px] truncate rounded px-2 py-1 text-xs font-medium ${
                      item.id === selectedFolderId || (item.id === null && selectedFolderId === null)
                        ? 'bg-brand-red text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {item.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          {docsLoading && (
            <div className="rounded-lg border bg-white p-6 text-center text-sm text-gray-500">Loading documents…</div>
          )}
          {docsError && (
            <AppEmptyState
              className="border-0 py-6 shadow-none"
              title="Failed to load documents"
              action={
                <AppButton type="button" size="sm" onClick={() => refetch()}>
                  Retry
                </AppButton>
              }
            />
          )}

          {!docsLoading && !docsError && (
            <div className="overflow-hidden rounded-lg border bg-white">
              {showTable ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="w-12 px-3 py-2 text-left text-[10px] font-semibold text-gray-700" aria-hidden />
                        <th
                          className="cursor-pointer select-none px-3 py-2 text-left text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
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
                          className="cursor-pointer select-none px-3 py-2 text-left text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
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
                          className="cursor-pointer select-none px-3 py-2 text-left text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
                          onClick={() => handleSort('uploaded_at')}
                        >
                          <div className="flex items-center gap-1">
                            Upload Date
                            {sortBy === 'uploaded_at' && (
                              <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                        <th className="w-24 px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedCategory !== 'all' && currentParentFolderId !== null && (
                        <tr
                          className="cursor-pointer bg-gray-50/50 hover:bg-gray-50"
                          onClick={() => setSelectedFolderId(currentParentFolderId)}
                        >
                          <td className="px-3 py-2">
                            <div className="flex h-10 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                />
                              </svg>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-gray-600">..</td>
                          <td className="px-3 py-2 text-xs text-gray-500">—</td>
                          <td className="px-3 py-2 text-xs text-gray-500">—</td>
                          <td className="px-3 py-2" />
                        </tr>
                      )}
                      {selectedCategory !== 'all' &&
                        childFolders.map((f) => (
                          <tr
                            key={f.id}
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => setSelectedFolderId(f.id)}
                          >
                            <td className="px-3 py-2">
                              <div className="flex h-10 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                  />
                                </svg>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="max-w-xs truncate text-xs font-semibold">{f.name}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">Folder</td>
                            <td className="px-3 py-2 text-xs text-gray-500">—</td>
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              {canEdit && (
                                <AppListRowIconButton
                                  preset="delete"
                                  label="Delete folder"
                                  onClick={() => handleDeleteFolder(f.id)}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      {currentFiles.map((d) => {
                        const icon = iconFor(d);
                        const isImg = getFileType(d) === 'image';
                        const name = d.title || 'Document';
                        return (
                          <tr
                            key={d.id}
                            draggable={canEdit}
                            onDragStart={() => canEdit && setDraggedFileId(d.id)}
                            onDragEnd={() => setDraggedFileId(null)}
                            className={`hover:bg-gray-50 ${canEdit ? 'cursor-move' : ''}`}
                          >
                            <td className="px-3 py-2">
                              {isImg && d.file_id ? (
                                <div
                                  className="h-10 w-10 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg bg-gray-100"
                                  onClick={() => handleFilePreview(d)}
                                >
                                  <img
                                    src={withFileAccessToken(`/files/${d.file_id}/thumbnail?w=64`)}
                                    alt={name}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div
                                  className={`flex h-10 w-8 flex-shrink-0 cursor-pointer select-none items-center justify-center rounded-lg ${icon.color} text-[10px] font-extrabold text-white`}
                                  onClick={() => handleFilePreview(d)}
                                >
                                  {icon.label}
                                </div>
                              )}
                            </td>
                            <td
                              className="px-3 py-2"
                              onClick={(e) => {
                                if (editingFileNameId !== d.id) {
                                  e.stopPropagation();
                                  handleFilePreview(d);
                                }
                              }}
                            >
                              {editingFileNameId === d.id ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <AppInput
                                    className="max-w-xs flex-1"
                                    value={editingFileNameValue}
                                    onChange={(e) => setEditingFileNameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRenameFile(d.id, editingFileNameValue);
                                      if (e.key === 'Escape') {
                                        setEditingFileNameId(null);
                                        setEditingFileNameValue('');
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <AppButton
                                    variant="ghost"
                                    size="sm"
                                    type="button"
                                    onClick={() => handleRenameFile(d.id, editingFileNameValue)}
                                  >
                                    Save
                                  </AppButton>
                                  <AppButton
                                    variant="ghost"
                                    size="sm"
                                    type="button"
                                    onClick={() => {
                                      setEditingFileNameId(null);
                                      setEditingFileNameValue('');
                                    }}
                                  >
                                    Cancel
                                  </AppButton>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <div className="max-w-xs cursor-pointer truncate text-xs font-semibold">{name}</div>
                                  {canEdit && (
                                    <AppListRowIconButton
                                      preset="edit"
                                      label="Rename"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditingFileName(d);
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="cursor-pointer px-3 py-2" onClick={() => handleFilePreview(d)}>
                              <div className="text-xs text-gray-600">{getDocTypeLabel(d)}</div>
                            </td>
                            <td className="cursor-pointer px-3 py-2" onClick={() => handleFilePreview(d)}>
                              <div className="text-xs text-gray-600">
                                {d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '-'}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-0.5">
                                {d.file_id && (
                                  <AppListRowIconButton
                                    icon={'\u{2B07}\u{FE0F}'}
                                    label="Download"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const url = await fetchDownloadUrl(d.file_id!);
                                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                  />
                                )}
                                {canEdit && (
                                  <>
                                    <AppListRowIconButton
                                      icon={'\u{1F4E6}'}
                                      label="Move to category"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMoveCategoryModal(d.id);
                                      }}
                                    />
                                    {selectedCategory !== 'all' && (
                                      <AppSelect
                                        className="max-w-[100px]"
                                        value={d.folder_id || selectedCategory}
                                        options={folderSelectOptions}
                                        onChange={(e) => handleMoveFileToFolder(d.id, e.target.value)}
                                        fieldHint="Folder\n\nMove this file to another folder in the category."
                                      />
                                    )}
                                    <AppListRowIconButton
                                      preset="delete"
                                      label="Delete"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteFile(d.id);
                                      }}
                                    />
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
              ) : (
                <AppEmptyState
                  className="border-0 py-6 shadow-none"
                  title={emptyStateTitle}
                  description={emptyStateDescription}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <AppCard className="!rounded-2xl" bodyClassName="p-0">
        <div className={uiSpacing.cardPadding}>
          <AppSectionHeader
            title={sectionTitle}
            description={sectionDescription}
            {...appSectionPresetProps('documents')}
          />
        </div>
        <div className="border-t border-gray-100">{filesBrowserBody}</div>
      </AppCard>

      {showUpload && (
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

      {moveModalFileId && (
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
              <AppButton size="sm" type="button" onClick={handleMoveToCategory}>
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

      {showNewFolderModal && (
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
                disabled={!newFolderName.trim() || (selectedCategory === 'all' && !newFolderCategory)}
              >
                Create
              </AppButton>
            </div>
          }
        >
          <div className={uiSpacing.sectionStack}>
            {selectedFolderId && selectedCategory !== 'all' && (
              <p className={uiTypography.helper}>
                Creating inside{' '}
                <span className="font-medium text-gray-900">
                  {(folders || []).find((f) => f.id === selectedFolderId)?.name ?? 'folder'}
                </span>
              </p>
            )}
            {selectedCategory === 'all' && (
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

      {uploadQueue.length > 0 && (
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
          <div className="max-h-80 overflow-y-auto">
            {uploadQueue.map((u) => (
              <div key={u.id} className={uiCx('border-b px-2.5 py-2', uiBorders.subtle)}>
                <div className="mb-1 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={uiCx(uiTypography.body, 'truncate text-xs font-medium')} title={u.file.name}>
                      {u.file.name}
                    </div>
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
                  <div className={uiCx(uiTypography.helper, 'mt-1 text-red-600')} title={u.error}>
                    {u.error || 'Upload failed'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </AppCard>
      )}

      <FileImagePreviewModal
        open={imageGallery.open}
        items={imageGallery.items}
        index={imageGallery.index}
        loading={imageGallery.loading}
        onClose={imageGallery.close}
        onPrev={imageGallery.goPrev}
        onNext={imageGallery.goNext}
      />

      {previewPdf && (
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
              <AppButton size="sm" type="button" onClick={() => window.open(previewPdf.url, '_blank')}>
                Download
              </AppButton>
            </div>
          }
        >
          <iframe src={previewPdf.url} className="h-full w-full border-0" title={previewPdf.name} />
        </AppModal>
      )}

      {previewExcel && (
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
    </>
  );
}
