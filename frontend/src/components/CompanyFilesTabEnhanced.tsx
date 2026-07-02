import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  FileImagePreviewModal,
  FileListSelectionBar,
  FileMoveLocationModal,
  FileListDropHint,
  dropTargetClass,
  buildFolderFileCounts,
  fileDropTargetProps,
  invalidateQueriesInBackground,
  isOverNestedFileDropTarget,
  leaveContainerDragLeave,
  removeFilesFromQueryCache,
  restoreQueryCache,
  getDraggedFileIds,
  isInternalFileDrag,
  setDraggedFileIds,
  useFileDropTarget,
  useFileImageGallery,
  useFileListSelection,
} from '@/components/files';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
import {
  companyFilesNewFolderQuickInfo,
  companyFilesPermissionsQuickInfo,
  companyFilesUploadQuickInfo,
  companyFilesMoveDocQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppCheckboxControl,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppListRowIconButton,
  AppModal,
  AppSectionHeader,
  AppSelect,
  AppTabs,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type FolderItem = {
  id: string;
  name: string;
  parent_id?: string | null;
  sort_index?: number;
  access_permissions?: unknown;
  created_at?: string;
};

type CompanyDocument = {
  id: string;
  folder_id?: string | null;
  title?: string;
  notes?: string;
  file_id?: string;
  created_at?: string;
  content_type?: string;
  is_image?: boolean;
  original_name?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  department_label?: string | null;
};

type Department = { id: string; label: string; sort_index?: number };
type UserOption = { id: string; username: string; email?: string };
type DivisionOption = { id: string; label: string };

export default function CompanyFilesTabEnhanced() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileSelection = useFileListSelection();
  const { dropTarget, setDropTarget, clearDropTarget, makeDropHandlers, isDropActive } = useFileDropTarget();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<Record<string, unknown>>('GET', '/auth/me') });
  const isAdmin = isAdminRole(me?.roles as string[] | undefined);
  const canRead =
    isAdmin ||
    (me?.permissions as string[] | undefined)?.includes('documents:read') ||
    (me?.permissions as string[] | undefined)?.includes('documents:access') ||
    (me?.permissions as string[] | undefined)?.includes('clients:read');
  const canWrite =
    isAdmin ||
    (me?.permissions as string[] | undefined)?.includes('documents:write') ||
    (me?.permissions as string[] | undefined)?.includes('documents:access') ||
    (me?.permissions as string[] | undefined)?.includes('clients:write');
  const canDelete =
    isAdmin ||
    (me?.permissions as string[] | undefined)?.includes('documents:delete') ||
    (me?.permissions as string[] | undefined)?.includes('documents:access') ||
    (me?.permissions as string[] | undefined)?.includes('clients:write');
  const canMove =
    isAdmin ||
    (me?.permissions as string[] | undefined)?.includes('documents:move') ||
    (me?.permissions as string[] | undefined)?.includes('documents:access') ||
    (me?.permissions as string[] | undefined)?.includes('clients:write');

  const [selectedDept, setSelectedDept] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [filesSection, setFilesSection] = useState<'active' | 'deleted'>('active');
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'uploaded_at' | 'name' | 'type'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isDragging, setIsDragging] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadQueue, setUploadQueue] = useState<
    Array<{ id: string; file: File; progress: number; status: 'pending' | 'uploading' | 'success' | 'error'; error?: string }>
  >([]);
  const imageGallery = useFileImageGallery();
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [previewExcel, setPreviewExcel] = useState<{ url: string; name: string } | null>(null);
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null);
  const [editingFileNameValue, setEditingFileNameValue] = useState('');
  const [renameFolder, setRenameFolder] = useState<{ id: string; name: string } | null>(null);
  const [moveLocationDocId, setMoveLocationDocId] = useState<string | null>(null);
  const [moveModalDept, setMoveModalDept] = useState('');
  const [moveModalFolders, setMoveModalFolders] = useState<FolderItem[]>([]);
  const [moveModalRootFolderId, setMoveModalRootFolderId] = useState<string | null>(null);
  const [permissionsFolder, setPermissionsFolder] = useState<{ id: string; name: string } | null>(null);
  const [permissionsData, setPermissionsData] = useState<Record<string, unknown> | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api<Department[]>('GET', '/settings/departments'),
  });

  const deptCountQueries = useQueries({
    queries: (departments || []).map((d) => ({
      queryKey: ['company-docs-count', d.id],
      queryFn: () => api<CompanyDocument[]>('GET', `/company/files/documents?department_id=${encodeURIComponent(d.id)}`),
      staleTime: 60_000,
    })),
  });

  const deptDocCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (departments || []).forEach((d, i) => {
      counts[d.id] = deptCountQueries[i]?.data?.length ?? 0;
    });
    return counts;
  }, [departments, deptCountQueries]);

  const { data: folderTree, refetch: refetchFolderTree } = useQuery({
    queryKey: ['company-folder-tree', selectedDept],
    queryFn: () =>
      api<{ root_folder_id: string; folders: FolderItem[] }>(
        'GET',
        `/company/files/folders/tree?department_id=${encodeURIComponent(selectedDept)}`
      ),
    enabled: !!selectedDept && filesSection === 'active',
  });

  const rootFolderId = folderTree?.root_folder_id ?? null;
  const allFolders = folderTree?.folders ?? [];

  const effectiveFolderId = selectedFolderId ?? rootFolderId;

  const { data: docs = [], refetch: refetchDocs } = useQuery({
    queryKey: ['company-docs', selectedDept, effectiveFolderId],
    queryFn: () =>
      api<CompanyDocument[]>(
        'GET',
        `/company/files/documents?folder_id=${encodeURIComponent(effectiveFolderId || '')}`
      ),
    enabled: !!selectedDept && !!effectiveFolderId && filesSection === 'active',
  });

  const { data: deletedFiles = [], refetch: refetchDeletedFiles } = useQuery({
    queryKey: ['company-deleted-docs', selectedDept],
    queryFn: () => {
      const qs = selectedDept ? `?department_id=${encodeURIComponent(selectedDept)}` : '';
      return api<CompanyDocument[]>('GET', `/company/files/documents/deleted${qs}`);
    },
    enabled: isAdmin && filesSection === 'deleted',
  });

  const { data: usersOptions } = useQuery({
    queryKey: ['company-users-options'],
    queryFn: () => api<UserOption[]>('GET', '/company/files/users-options'),
  });

  const { data: divisionsOptions } = useQuery({
    queryKey: ['company-divisions-options'],
    queryFn: () => api<DivisionOption[]>('GET', '/company/files/divisions-options'),
  });

  const { data: permissionsRaw, isLoading: loadingPermissions } = useQuery({
    queryKey: ['folder-permissions', permissionsFolder?.id],
    queryFn: () => api<Record<string, unknown>>('GET', `/company/files/folders/${permissionsFolder?.id}/permissions`),
    enabled: !!permissionsFolder?.id,
  });

  useEffect(() => {
    if (!permissionsRaw) return;
    setPermissionsData(permissionsRaw);
    setIsPublic((permissionsRaw.is_public as boolean) ?? true);
    setSelectedUserIds((permissionsRaw.allowed_user_ids as string[]) || []);
    setSelectedDivisions((permissionsRaw.allowed_divisions as string[]) || []);
  }, [permissionsRaw]);

  useEffect(() => {
    if (!isAdmin && filesSection === 'deleted') setFilesSection('active');
  }, [isAdmin, filesSection]);

  useEffect(() => {
    setSelectedFolderId(null);
    setFileSearchQuery('');
  }, [selectedDept]);

  useEffect(() => {
    if (!previewPdf && !imageGallery.open && !previewExcel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewPdf(null);
        imageGallery.close();
        setPreviewExcel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewPdf, imageGallery.open, imageGallery.close, previewExcel]);

  const selectedDeptLabel = useMemo(
    () => (departments || []).find((d) => d.id === selectedDept)?.label || 'Category',
    [departments, selectedDept]
  );

  const listParentId = effectiveFolderId;

  const currentFolderChildren = useMemo(() => {
    if (!listParentId) return [];
    return allFolders
      .filter((f) => (f.parent_id || null) === listParentId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  }, [allFolders, listParentId]);

  const allDeptDocsForCounts = useMemo(() => {
    if (!selectedDept || !departments?.length) return [];
    const deptIndex = departments.findIndex((dept) => dept.id === selectedDept);
    if (deptIndex < 0) return [];
    return deptCountQueries[deptIndex]?.data ?? [];
  }, [selectedDept, departments, deptCountQueries]);

  const folderFileCounts = useMemo(
    () => buildFolderFileCounts(allDeptDocsForCounts, allFolders),
    [allDeptDocsForCounts, allFolders],
  );

  const currentParentFolderId = useMemo(() => {
    if (!selectedFolderId) return null;
    const folder = allFolders.find((f) => f.id === selectedFolderId);
    if (!folder) return null;
    const parentId = folder.parent_id || null;
    if (parentId === rootFolderId) return null;
    return parentId;
  }, [allFolders, selectedFolderId, rootFolderId]);

  const locationBreadcrumb = useMemo(() => {
    if (!selectedDept) return [];
    const path: { id: string | null; name: string }[] = [{ id: null, name: selectedDeptLabel }];
    if (!selectedFolderId) return path;
    let currentId: string | null = selectedFolderId;
    const chain: FolderItem[] = [];
    while (currentId) {
      const folder = allFolders.find((f) => f.id === currentId);
      if (!folder) break;
      chain.unshift(folder);
      const parentId = folder.parent_id || null;
      if (parentId === rootFolderId) break;
      currentId = parentId;
    }
    chain.forEach((f) => path.push({ id: f.id, name: f.name }));
    return path;
  }, [selectedDept, selectedDeptLabel, selectedFolderId, allFolders, rootFolderId]);

  const getFileTypeLabel = (d: CompanyDocument): string => {
    const name = String(d.original_name || d.title || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(d.content_type || '').toLowerCase();
    if (d.is_image || ct.startsWith('image/')) return 'Image';
    if (ct.includes('pdf') || ext === 'pdf') return 'PDF';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'Excel';
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return 'Word';
    if (['ppt', 'pptx'].includes(ext) || ct.includes('powerpoint')) return 'PowerPoint';
    return ext.toUpperCase() || 'File';
  };

  const currentFiles = useMemo(() => {
    const q = fileSearchQuery.trim().toLowerCase();
    const filtered = q
      ? docs.filter((d) => (d.original_name || d.title || '').toLowerCase().includes(q))
      : docs;
    return [...filtered].sort((a, b) => {
      let aVal: string = '';
      let bVal: string = '';
      if (sortBy === 'uploaded_at') {
        aVal = a.created_at || '';
        bVal = b.created_at || '';
      } else if (sortBy === 'name') {
        aVal = (a.original_name || a.title || '').toLowerCase();
        bVal = (b.original_name || b.title || '').toLowerCase();
      } else if (sortBy === 'type') {
        aVal = getFileTypeLabel(a).toLowerCase();
        bVal = getFileTypeLabel(b).toLowerCase();
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [docs, fileSearchQuery, sortBy, sortOrder]);

  const visibleFileIds = useMemo(() => currentFiles.map(d => d.id), [currentFiles]);
  const { allSelected: allVisibleSelected } = fileSelection.getSelectionState(visibleFileIds);
  const canSelectInCurrentView = canMove && filesSection === 'active';

  useEffect(() => {
    fileSelection.clear();
  }, [selectedDept, selectedFolderId, filesSection]);

  const startFileDrag = (e: DragEvent, docId: string) => {
    if (!canMove) return;
    setDraggedFileIds(e.dataTransfer, fileSelection.resolveDragIds(docId));
    setIsDragging(true);
  };

  const endFileDrag = () => {
    setIsDragging(false);
    clearDropTarget();
  };

  const moveDocsToLocation = async (docIds: string[], folderId: string | null, label?: string) => {
    const unique = [...new Set(docIds.filter(Boolean))];
    if (unique.length === 0 || !canMove) return;
    const targetFolder = folderId;
    if (!targetFolder) {
      toast.error('Select a destination folder');
      return;
    }
    const docsQueryKey = ['company-docs', selectedDept, effectiveFolderId] as const;
    const snapshot = removeFilesFromQueryCache(queryClient, docsQueryKey, unique);
    fileSelection.clear();
    const results = await Promise.allSettled(
      unique.map((docId) =>
        api('PUT', `/company/files/documents/${encodeURIComponent(docId)}`, {
          folder_id: targetFolder,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === 0) {
      restoreQueryCache(queryClient, docsQueryKey, snapshot);
    } else {
      invalidateQueriesInBackground(queryClient, [
        ['company-docs'],
        ['company-docs-count'],
      ]);
    }
    if (ok === unique.length) {
      toast.success(unique.length === 1 ? 'Moved' : `Moved ${ok} files${label ? ` to ${label}` : ''}`);
    } else {
      toast.error(`Moved ${ok} of ${unique.length} files`);
    }
  };

  const moveDocsToFolder = async (docIds: string[], folderId: string | null, label?: string) => {
    await moveDocsToLocation(docIds, folderId || rootFolderId, label);
  };

  const handleDropDocIds = async (e: DragEvent, action: (ids: string[]) => void | Promise<void>) => {
    if ((e.dataTransfer.files?.length || 0) > 0) return false;
    if (!isInternalFileDrag(e.dataTransfer)) return false;
    const ids = getDraggedFileIds(e.dataTransfer);
    if (ids.length === 0) return false;
    await action(ids);
    endFileDrag();
    return true;
  };

  const handleSort = (column: 'uploaded_at' | 'name' | 'type') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const iconFor = (d: CompanyDocument) => {
    const name = String(d.original_name || d.title || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(d.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (is('pdf')) return { label: 'PDF', color: 'bg-red-500' };
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet'))
      return { label: 'XLS', color: 'bg-green-600' };
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return { label: 'DOC', color: 'bg-blue-600' };
    if (['ppt', 'pptx'].includes(ext) || ct.includes('powerpoint')) return { label: 'PPT', color: 'bg-orange-500' };
    if (['zip', 'rar', '7z'].includes(ext) || ct.includes('zip')) return { label: 'ZIP', color: 'bg-gray-700' };
    if (is('txt')) return { label: 'TXT', color: 'bg-gray-500' };
    return { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: 'bg-gray-600' };
  };

  const getFileType = (d: CompanyDocument): 'image' | 'pdf' | 'excel' | 'other' => {
    const name = String(d.original_name || d.title || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(d.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (d.is_image || ct.startsWith('image/')) return 'image';
    if (is('pdf')) return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'excel';
    return 'other';
  };

  const fetchDownloadUrl = async (fid: string) => {
    try {
      const r = await api<{ download_url?: string }>('GET', withFileAccessToken(`/files/${fid}/download`));
      return String(r.download_url || '');
    } catch {
      toast.error('Download link unavailable');
      return '';
    }
  };

  const handleFilePreview = async (d: CompanyDocument) => {
    const fileType = getFileType(d);
    const name = d.original_name || d.title || 'Preview';
    const fileId = d.file_id || '';
    if (!fileId) {
      toast.error('Preview not available');
      return;
    }
    try {
      const r = await api<{ preview_url?: string; download_url?: string }>(
        'GET',
        withFileAccessToken(`/files/${fileId}/preview`)
      );
      const url = String(r.preview_url || r.download_url || '');
      if (!url) {
        toast.error('Preview not available');
        return;
      }
      if (fileType === 'image') {
        await imageGallery.openImage(
          d,
          currentFiles,
          (doc) => getFileType(doc) === 'image',
          (doc) => doc.file_id || '',
          (doc) => doc.original_name || doc.title || 'Preview',
        );
        return;
      } else if (fileType === 'pdf') {
        setPreviewPdf({ url, name });
      } else if (fileType === 'excel') {
        setPreviewExcel({ url, name });
      } else {
        window.open(url, '_blank');
      }
    } catch {
      toast.error('Preview not available');
    }
  };

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refetchDocs(),
      refetchFolderTree(),
      queryClient.invalidateQueries({ queryKey: ['company-docs-count'] }),
    ]);
  }, [refetchDocs, refetchFolderTree, queryClient]);

  const handleBulkDeleteSelected = async () => {
    const ids = [...fileSelection.selectedIds];
    if (ids.length === 0) return;
    const result = await confirm({
      title: 'Delete selected files',
      message: `Delete ${ids.length} document(s)?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    if (!canDelete) {
      toast.error('You do not have permission to delete documents');
      return;
    }
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        ids.map(docId => api('DELETE', `/company/files/documents/${encodeURIComponent(docId)}`)),
      );
      const ok = results.filter(r => r.status === 'fulfilled').length;
      await refreshAll();
      fileSelection.clear();
      toast.success(ok === ids.length ? `Deleted ${ok} file(s)` : `Deleted ${ok} of ${ids.length} file(s)`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const uploadSingleFile = async (file: File, customTitle?: string, folderId?: string) => {
    const targetFolderId = folderId || effectiveFolderId;
    if (!targetFolderId) throw new Error('Select a file category first');
    const name = file.name;
    const type = file.type || 'application/octet-stream';

    const up = await api<{ upload_url?: string; key?: string }>('POST', '/files/upload', {
      original_name: name,
      content_type: type,
      client_id: null,
      project_id: null,
      employee_id: null,
      category_id: 'company-files',
    });

    if (!up?.upload_url || !up?.key) throw new Error('Failed to get upload URL from server');

    let conf: { id?: string };
    try {
      const putResp = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
        body: file,
      });
      if (!putResp.ok) {
        const errorText = await putResp.text().catch(() => 'Unknown error');
        throw new Error(`Azure upload failed: ${putResp.status} - ${errorText}`);
      }
      conf = await api<{ id?: string }>('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: type,
      });
    } catch {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('original_name', name);
      formData.append('content_type', type);
      formData.append('client_id', '');
      formData.append('project_id', '');
      formData.append('employee_id', '');
      formData.append('category_id', 'company-files');
      conf = await api<{ id?: string }>('POST', '/files/upload-proxy', formData);
    }

    if (!conf?.id) throw new Error('Failed to confirm upload');

    await api('POST', '/company/files/documents', {
      folder_id: targetFolderId,
      title: customTitle || name,
      file_id: conf.id,
    });
  };

  const uploadMultiple = async (files: FileList | File[], folderId?: string) => {
    if (!canWrite) {
      toast.error('You do not have permission to upload files');
      return;
    }
    const targetFolderId = folderId || effectiveFolderId;
    if (!targetFolderId) {
      toast.error('Select a file category first');
      return;
    }

    const fileArray = Array.from(files);
    const uploads = fileArray.map((file, idx) => ({
      id: `upload-${Date.now()}-${idx}-${Math.random()}`,
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setUploadQueue((prev) => [...prev, ...uploads]);

    for (const upload of uploads) {
      try {
        setUploadQueue((prev) => prev.map((u) => (u.id === upload.id ? { ...u, status: 'uploading', progress: 50 } : u)));
        await uploadSingleFile(upload.file, undefined, targetFolderId);
        setUploadQueue((prev) => prev.map((u) => (u.id === upload.id ? { ...u, status: 'success', progress: 100 } : u)));
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : 'Upload failed';
        setUploadQueue((prev) => prev.map((u) => (u.id === upload.id ? { ...u, status: 'error', error: errorMsg } : u)));
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await refreshAll();
    setTimeout(() => {
      setUploadQueue((prev) => prev.filter((u) => !uploads.find((up) => up.id === u.id) || u.status === 'error'));
    }, 3000);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      toast.error('Folder name required');
      return;
    }
    if (!canWrite) {
      toast.error('You do not have permission to create folders');
      return;
    }
    try {
      const body: Record<string, string> = { name };
      if (selectedFolderId) {
        body.parent_id = selectedFolderId;
      } else if (selectedDept) {
        body.department_id = selectedDept;
      }
      await api('POST', '/company/files/folders', body);
      toast.success('Folder created');
      setNewFolderName('');
      setShowNewFolderModal(false);
      await refetchFolderTree();
    } catch {
      toast.error('Failed to create folder');
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const result = await confirm({ message: `Delete folder "${folderName}"?` });
    if (result !== 'confirm') return;
    if (!canDelete) {
      toast.error('You do not have permission to delete folders');
      return;
    }
    try {
      await api('DELETE', `/company/files/folders/${encodeURIComponent(folderId)}`);
      toast.success('Deleted');
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      await refetchFolderTree();
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleDeleteFile = async (docId: string) => {
    const result = await confirm({ message: 'Delete this document?' });
    if (result !== 'confirm') return;
    if (!canDelete) {
      toast.error('You do not have permission to delete documents');
      return;
    }
    try {
      await api('DELETE', `/company/files/documents/${encodeURIComponent(docId)}`);
      toast.success('Deleted');
      await refreshAll();
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleRenameFile = async (docId: string, newName: string) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      toast.error('Title required');
      return;
    }
    if (!canMove) {
      toast.error('You do not have permission to rename documents');
      return;
    }
    try {
      await api('PUT', `/company/files/documents/${encodeURIComponent(docId)}`, { title: trimmed });
      setEditingFileNameId(null);
      setEditingFileNameValue('');
      await refetchDocs();
      toast.success('Renamed');
    } catch {
      toast.error('Failed to rename');
    }
  };

  const startEditingFileName = (d: CompanyDocument) => {
    setEditingFileNameId(d.id);
    setEditingFileNameValue(d.title || d.original_name || '');
  };

  const loadMoveModalFolders = useCallback(async (deptId: string) => {
    if (!deptId) {
      setMoveModalFolders([]);
      setMoveModalRootFolderId(null);
      return;
    }
    const data = await api<{ root_folder_id: string; folders: FolderItem[] }>(
      'GET',
      `/company/files/folders/tree?department_id=${encodeURIComponent(deptId)}`,
    );
    setMoveModalRootFolderId(data.root_folder_id);
    setMoveModalFolders(data.folders.filter((folder) => folder.id !== data.root_folder_id));
  }, []);

  const openMoveLocationModal = (docId: string) => {
    const dept = selectedDept;
    setMoveLocationDocId(docId);
    setMoveModalDept(dept);
    void loadMoveModalFolders(dept);
  };

  const moveLocationDoc = useMemo(
    () => (moveLocationDocId ? docs.find((doc) => doc.id === moveLocationDocId) ?? null : null),
    [docs, moveLocationDocId],
  );

  const departmentCategoryOptions = useMemo(
    () => (departments || []).map((dept) => ({ value: dept.id, label: dept.label })),
    [departments],
  );

  const moveModalFileLocationFolders = useMemo(
    () =>
      moveModalFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        category: moveModalDept,
      })),
    [moveModalFolders, moveModalDept],
  );

  const handleMoveFileToFolder = async (docId: string, folderId: string | null) => {
    const ids = fileSelection.resolveDragIds(docId);
    const label = folderId
      ? allFolders.find((folder) => folder.id === folderId)?.name
      : 'Root';
    await moveDocsToFolder(ids, folderId, label);
  };

  const moveLocationSelectedCount = useMemo(() => {
    if (!moveLocationDocId) return 1;
    return fileSelection.resolveDragIds(moveLocationDocId).length;
  }, [moveLocationDocId, fileSelection]);

  const handleRestoreDeletedFile = async (docId: string) => {
    try {
      await api('POST', `/company/files/documents/deleted/${encodeURIComponent(docId)}/restore`);
      await refetchDeletedFiles();
      await refreshAll();
      toast.success('File restored to library');
    } catch {
      toast.error('Failed to restore file');
    }
  };

  const handlePermanentDeleteFile = async (docId: string) => {
    const result = await confirm({
      title: 'Delete permanently',
      message: 'Permanently delete this file? This cannot be undone.',
      confirmText: 'Delete permanently',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/company/files/documents/deleted/${encodeURIComponent(docId)}`);
      await refetchDeletedFiles();
      toast.success('File permanently deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  };

  const submitRenameFolder = async () => {
    const newName = renameFolder?.name?.trim() || '';
    if (!renameFolder || !newName) {
      toast.error('Folder name required');
      return;
    }
    try {
      await api('PUT', `/company/files/folders/${encodeURIComponent(renameFolder.id)}`, { name: newName });
      toast.success('Renamed');
      setRenameFolder(null);
      await refetchFolderTree();
    } catch {
      toast.error('Failed to rename');
    }
  };

  const savePermissions = async () => {
    if (!permissionsFolder) return;
    try {
      await api('PUT', `/company/files/folders/${encodeURIComponent(permissionsFolder.id)}/permissions`, {
        is_public: isPublic,
        allowed_user_ids: isPublic ? [] : selectedUserIds,
        allowed_divisions: isPublic ? [] : selectedDivisions,
      });
      toast.success('Permissions updated');
      setPermissionsFolder(null);
      queryClient.invalidateQueries({ queryKey: ['company-folder-tree'] });
      queryClient.invalidateQueries({ queryKey: ['folder-permissions'] });
    } catch {
      toast.error('Failed to update permissions');
    }
  };

  const filteredUsers = useMemo(() => {
    if (!usersOptions) return [];
    return usersOptions.filter(
      (u) =>
        !userSearch ||
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
    );
  }, [usersOptions, userSearch]);

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

  const showTable =
    selectedDept &&
    (currentParentFolderId !== null || currentFolderChildren.length > 0 || currentFiles.length > 0);

  const filesBrowserBody = (
    <>
      {isAdmin && filesSection === 'deleted' ? (
        <div className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50/50">
          <p className="border-b border-amber-100/80 px-3 py-2 text-xs text-amber-900">
            Same previews and downloads as the library. Restore returns the file to Company Files, or purge to remove it
            permanently.
          </p>
          <div className="flex h-[calc(100vh-400px)] bg-white">
            <div className="flex-1 overflow-y-auto p-4">
              {Array.isArray(deletedFiles) && deletedFiles.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="w-12 px-3 py-2 text-left text-[10px] font-semibold text-gray-700" aria-hidden />
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Name</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Type</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Folder</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Removed</th>
                        <th className="w-52 px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {deletedFiles.map((df) => {
                        const icon = iconFor(df);
                        const isImg = df.is_image || String(df.content_type || '').startsWith('image/');
                        const name = df.original_name || df.title || 'Document';
                        return (
                          <tr key={df.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              {isImg && df.file_id ? (
                                <button
                                  type="button"
                                  className="block h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100"
                                  onClick={() => handleFilePreview(df)}
                                  title="Preview"
                                >
                                  <img
                                    src={withFileAccessToken(`/files/${df.file_id}/thumbnail?w=64`)}
                                    alt={name}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={`flex h-10 w-8 items-center justify-center rounded-lg ${icon.color} text-[10px] font-extrabold text-white`}
                                  onClick={() => handleFilePreview(df)}
                                  title="Open / preview"
                                >
                                  {icon.label}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="max-w-xs truncate text-left text-xs font-semibold text-gray-900 hover:text-brand-red"
                                onClick={() => handleFilePreview(df)}
                              >
                                {name}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">{getFileTypeLabel(df)}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{df.department_label || '—'}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {df.deleted_at ? new Date(df.deleted_at).toLocaleString() : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-1">
                                {canRead && df.file_id ? (
                                  <AppListRowIconButton
                                    preset="download"
                                    label="Download"
                                    onClick={async () => {
                                      const url = await fetchDownloadUrl(df.file_id!);
                                      if (url) window.open(url, '_blank');
                                    }}
                                  />
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => handleRestoreDeletedFile(df.id)}
                                  title="Restore to library"
                                  className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700"
                                >
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePermanentDeleteFile(df.id)}
                                  title="Delete permanently"
                                  className="rounded border border-red-200 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50"
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
              ) : (
                <AppEmptyState className="border-0 py-16 shadow-none" title="No deleted company files." />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!(isAdmin && filesSection === 'deleted') && (
        <div className="overflow-hidden bg-white">
          <div className="flex h-[calc(100vh-400px)]">
            <div className="flex w-64 flex-col border-r bg-gray-50">
              <div className="border-b p-3">
                <div className="text-xs font-semibold text-gray-700">File Categories</div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {(departments || []).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSelectedDept(d.id);
                      setSelectedFolderId(null);
                    }}
                    className={`w-full border-b px-3 py-2 text-left transition-colors hover:bg-white ${
                      selectedDept === d.id
                        ? 'border-l-4 border-l-brand-red bg-white font-semibold text-gray-900'
                        : 'text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">📁</span>
                      <span className="truncate text-xs">{d.label}</span>
                      <span className="ml-auto text-[10px] text-gray-500">({deptDocCounts[d.id] ?? 0})</span>
                    </div>
                  </button>
                ))}
                {!departments?.length ? (
                  <div className="p-3">
                    <AppEmptyState
                      title="No file categories"
                      description="Create one in Settings before organizing company folders."
                      className="border-0 bg-transparent p-3"
                      action={
                        <AppButton variant="secondary" size="sm" onClick={() => { window.location.href = '/settings'; }}>
                          Open Settings
                        </AppButton>
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={uiCx(
                'flex-1 overflow-y-auto p-4',
                dropTargetClass(isDropActive('root', selectedDept || ''), 'root'),
              )}
              onDragOver={
                canWrite && selectedDept
                  ? (e) => {
                      e.preventDefault();
                      if (isInternalFileDrag(e.dataTransfer) || (e.dataTransfer.files?.length || 0) > 0) {
                        setIsDragging(true);
                      }
                      if (isInternalFileDrag(e.dataTransfer) && !isOverNestedFileDropTarget(e)) {
                        setDropTarget({ kind: 'root', id: selectedDept, label: 'Root' });
                      }
                    }
                  : undefined
              }
              onDragLeave={
                canWrite
                  ? (e) => {
                      leaveContainerDragLeave(e, () => {
                        setIsDragging(false);
                        clearDropTarget();
                      });
                    }
                  : undefined
              }
              onDrop={
                canWrite && selectedDept
                  ? async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                      clearDropTarget();
                      if (e.dataTransfer.files?.length) {
                        await uploadMultiple(e.dataTransfer.files);
                        return;
                      }
                      await handleDropDocIds(e, ids => moveDocsToFolder(ids, null, 'Root'));
                    }
                  : undefined
              }
            >
              {!selectedDept ? (
                <AppEmptyState
                  title="Select a File Category"
                  description="Choose a file category from the sidebar to view and manage folders."
                  className="min-h-[320px]"
                />
              ) : (
                <>
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
                        {selectedDeptLabel}
                        <span className="ml-1 text-gray-500">({currentFiles.length})</span>
                      </div>
                    </div>
                    {canWrite ? (
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <AppButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setNewFolderName('');
                            setShowNewFolderModal(true);
                          }}
                        >
                          {selectedFolderId ? 'Add subfolder' : 'Add folder'}
                        </AppButton>
                        <AppButton type="button" size="sm" onClick={() => setShowUpload(true)}>
                          + Upload File
                        </AppButton>
                      </div>
                    ) : null}
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-gray-500">Location:</span>
                    {locationBreadcrumb.map((item, index) => (
                      <span key={item.id ?? 'root'} className="inline-flex items-center gap-1">
                        {index > 0 && <span className="text-xs text-gray-400">/</span>}
                        <button
                          type="button"
                          onClick={() => setSelectedFolderId(item.id)}
                          className={uiCx(
                            'max-w-[140px] truncate rounded px-2 py-1 text-xs font-medium',
                            (item.id === selectedFolderId || (item.id === null && selectedFolderId === null))
                              ? 'bg-brand-red text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          )}
                        >
                          {item.name}
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-lg border bg-white">
                    <FileListDropHint dropTarget={dropTarget} />
                    {canSelectInCurrentView ? (
                      <FileListSelectionBar
                        selectedCount={fileSelection.selectedCount}
                        visibleCount={visibleFileIds.length}
                        onSelectAll={() => fileSelection.selectAll(visibleFileIds)}
                        onClear={() => fileSelection.clear()}
                        onDeleteSelected={handleBulkDeleteSelected}
                        deleting={bulkDeleting}
                        className="m-3 mb-0"
                      />
                    ) : null}
                    {showTable ? (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="border-b bg-gray-50">
                            <tr>
                              {canSelectInCurrentView ? (
                                <th className="w-8 px-2 py-2">
                                  <AppCheckboxControl
                                    checked={allVisibleSelected}
                                    aria-label={allVisibleSelected ? 'Deselect all files' : 'Select all files'}
                                    onChange={(checked) => {
                                      if (checked) fileSelection.selectAll(visibleFileIds);
                                      else fileSelection.clear();
                                    }}
                                  />
                                </th>
                              ) : null}
                              <th className="w-12 px-3 py-2 text-left text-[10px] font-semibold text-gray-700" />
                              <th
                                className="w-full cursor-pointer select-none px-3 py-2 text-left text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
                                onClick={() => handleSort('name')}
                              >
                                <div className="flex items-center gap-1">
                                  Name
                                  {sortBy === 'name' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                                </div>
                              </th>
                              <th
                                className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
                                onClick={() => handleSort('type')}
                              >
                                <div className="flex items-center gap-1">
                                  Type
                                  {sortBy === 'type' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                                </div>
                              </th>
                              <th
                                className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
                                onClick={() => handleSort('uploaded_at')}
                              >
                                <div className="flex items-center gap-1">
                                  Upload Date
                                  {sortBy === 'uploaded_at' && (
                                    <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </div>
                              </th>
                              <th className="w-[1%] whitespace-nowrap px-3 py-2 text-right text-[10px] font-semibold text-gray-700">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {currentParentFolderId !== null && (
                              <tr
                                className="cursor-pointer bg-gray-50/50 hover:bg-gray-50"
                                onClick={() => setSelectedFolderId(currentParentFolderId)}
                              >
                                {canSelectInCurrentView ? <td className="px-2 py-2" /> : null}
                                <td className="px-3 py-2">
                                  <div className="flex h-10 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
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

                            {currentFolderChildren.map((folder) => (
                              <tr
                                key={folder.id}
                                {...fileDropTargetProps('folder')}
                                className={uiCx(
                                  'cursor-pointer hover:bg-gray-50',
                                  dropTargetClass(isDropActive('folder', folder.id), 'folder'),
                                )}
                                onClick={() => setSelectedFolderId(folder.id)}
                                {...(canWrite
                                  ? makeDropHandlers('folder', folder.id, folder.name, async (e) => {
                                      if (e.dataTransfer.files?.length) {
                                        await uploadMultiple(e.dataTransfer.files, folder.id);
                                        return;
                                      }
                                      await handleDropDocIds(e, ids =>
                                        moveDocsToFolder(ids, folder.id, folder.name),
                                      );
                                    })
                                  : {})}
                              >
                                {canSelectInCurrentView ? <td className="px-2 py-2" /> : null}
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
                                  <div className="flex max-w-xs items-center gap-2">
                                    <span className="truncate text-xs font-semibold">{folder.name}</span>
                                    <span className="ml-auto shrink-0 text-[10px] font-normal text-gray-500">
                                      ({folderFileCounts[folder.id] ?? 0})
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600">Folder</td>
                                <td className="px-3 py-2 text-xs text-gray-500">—</td>
                                <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-0.5">
                                    {canMove ? (
                                      <AppListRowIconButton
                                        label="Permissions"
                                        icon="🔒"
                                        onClick={() => setPermissionsFolder({ id: folder.id, name: folder.name })}
                                      />
                                    ) : null}
                                    {canMove ? (
                                      <AppListRowIconButton
                                        preset="edit"
                                        label="Rename"
                                        onClick={() => setRenameFolder({ id: folder.id, name: folder.name })}
                                      />
                                    ) : null}
                                    {canDelete ? (
                                      <AppListRowIconButton
                                        preset="delete"
                                        label="Delete folder"
                                        onClick={() => handleDeleteFolder(folder.id, folder.name)}
                                      />
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))}

                            {currentFiles.map((d) => {
                              const icon = iconFor(d);
                              const isImg = d.is_image || String(d.content_type || '').startsWith('image/');
                              const name = d.original_name || d.title || 'Document';
                              return (
                                <tr
                                  key={d.id}
                                  draggable={canMove}
                                  onDragStart={(e) => startFileDrag(e, d.id)}
                                  onDragEnd={endFileDrag}
                                  className={uiCx(
                                    'hover:bg-gray-50',
                                    canMove ? 'cursor-move' : '',
                                    fileSelection.isSelected(d.id) ? 'bg-brand-red/5' : '',
                                  )}
                                >
                                  {canSelectInCurrentView ? (
                                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                      <AppCheckboxControl
                                        checked={fileSelection.isSelected(d.id)}
                                        aria-label={`Select ${name}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (e.shiftKey) fileSelection.toggleRange(d.id, visibleFileIds);
                                          else fileSelection.toggle(d.id);
                                        }}
                                      />
                                    </td>
                                  ) : null}
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
                                        {canMove ? (
                                          <AppListRowIconButton
                                            preset="edit"
                                            label="Rename"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              startEditingFileName(d);
                                            }}
                                          />
                                        ) : null}
                                      </div>
                                    )}
                                  </td>
                                  <td className="cursor-pointer px-3 py-2" onClick={() => handleFilePreview(d)}>
                                    <div className="text-xs text-gray-600">{getFileTypeLabel(d)}</div>
                                  </td>
                                  <td className="cursor-pointer px-3 py-2" onClick={() => handleFilePreview(d)}>
                                    <div className="text-xs text-gray-600">
                                      {d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '-'}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="flex items-center justify-end gap-0.5">
                                      {canRead && d.file_id ? (
                                        <AppListRowIconButton
                                          preset="download"
                                          label="Download"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const url = await fetchDownloadUrl(d.file_id!);
                                            if (url) window.open(url, '_blank');
                                          }}
                                        />
                                      ) : null}
                                      {canMove ? (
                                        <AppListRowIconButton
                                          preset="move"
                                          label="Move to…"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openMoveLocationModal(d.id);
                                          }}
                                        />
                                      ) : null}
                                      {canDelete ? (
                                        <AppListRowIconButton
                                          preset="delete"
                                          label="Delete"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteFile(d.id);
                                          }}
                                        />
                                      ) : null}
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
                        title="No files in this category"
                        description={canWrite ? 'Drag and drop files here or click Upload File.' : undefined}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <AppCard className="!rounded-2xl" bodyClassName="p-0">
        <div className={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Files"
            description="Document library organized by file category and folder."
            {...appSectionPresetProps('files')}
            action={filesSectionTabs}
          />
        </div>
        <div className="border-t border-gray-100">{filesBrowserBody}</div>
      </AppCard>

      {showUpload ? (
        <AppFormModal
          open
          onClose={() => setShowUpload(false)}
          title="Upload Files"
          quickInfo={companyFilesUploadQuickInfo}
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
            accept="*"
            onFilesSelected={async (added) => {
              if (added.length > 0) {
                setShowUpload(false);
                await uploadMultiple(added);
              }
            }}
            fieldHint="Files\n\nPick one or more files to add to the current category and folder. You can also drag files onto the file list."
          />
        </AppFormModal>
      ) : null}

      {showNewFolderModal ? (
        <AppFormModal
          open
          onClose={() => setShowNewFolderModal(false)}
          title={selectedFolderId ? 'New subfolder' : 'New folder'}
          quickInfo={companyFilesNewFolderQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={() => setShowNewFolderModal(false)}>
                Cancel
              </AppButton>
              <AppButton size="sm" type="button" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                Create
              </AppButton>
            </div>
          }
        >
          <div className={uiSpacing.sectionStack}>
            {selectedFolderId ? (
              <p className={uiTypography.helper}>
                Creating inside{' '}
                <span className="font-medium text-gray-900">
                  {allFolders.find((f) => f.id === selectedFolderId)?.name ?? 'folder'}
                </span>
              </p>
            ) : null}
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
              autoFocus
            />
          </div>
        </AppFormModal>
      ) : null}

      {moveLocationDocId ? (
        <FileMoveLocationModal
          open
          onClose={() => setMoveLocationDocId(null)}
          title="Move files"
          quickInfo={companyFilesMoveDocQuickInfo}
          categoryLabel="File category"
          folderLabel="Folder"
          categoryOptions={departmentCategoryOptions}
          folders={moveModalFileLocationFolders}
          initialCategory={moveModalDept || selectedDept}
          initialFolderId={moveLocationDoc?.folder_id}
          rootFolderId={moveModalRootFolderId}
          selectedFileCount={moveLocationSelectedCount}
          onCategoryChange={(deptId) => {
            setMoveModalDept(deptId);
            void loadMoveModalFolders(deptId);
          }}
          onMove={async (destination) => {
            if (!moveLocationDocId) return;
            const ids = fileSelection.resolveDragIds(moveLocationDocId);
            const folderLabel =
              destination.folderId === moveModalRootFolderId
                ? 'Root'
                : moveModalFolders.find((folder) => folder.id === destination.folderId)?.name;
            const categoryLabel =
              departmentCategoryOptions.find((option) => option.value === destination.category)?.label ??
              destination.category;
            const label = folderLabel ? `${categoryLabel} / ${folderLabel}` : categoryLabel;
            await moveDocsToLocation(ids, destination.folderId, label);
          }}
        />
      ) : null}

      {renameFolder ? (
        <AppFormModal
          open
          onClose={() => setRenameFolder(null)}
          title="Rename Folder"
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={() => setRenameFolder(null)}>
                Cancel
              </AppButton>
              <AppButton size="sm" type="button" onClick={submitRenameFolder}>
                Rename
              </AppButton>
            </div>
          }
        >
          <AppInput
            label="Folder name"
            value={renameFolder.name}
            onChange={(e) => setRenameFolder((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRenameFolder();
            }}
            fieldHint="Folder name\n\nUpdate how this folder appears throughout Company Files."
            autoFocus
          />
        </AppFormModal>
      ) : null}

      {permissionsFolder ? (
        <AppFormModal
          open
          onClose={() => setPermissionsFolder(null)}
          title={`Access Permissions: ${permissionsFolder.name}`}
          quickInfo={companyFilesPermissionsQuickInfo}
          formWidth="comfortable"
          size="md"
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton variant="secondary" size="sm" type="button" onClick={() => setPermissionsFolder(null)}>
                Cancel
              </AppButton>
              <AppButton size="sm" type="button" onClick={savePermissions}>
                Save
              </AppButton>
            </div>
          }
        >
          {loadingPermissions ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading permissions...</div>
          ) : permissionsData ? (
            <div className={uiSpacing.sectionStack}>
              <AppCheckbox
                label="Public (all users can access)"
                checked={isPublic}
                onChange={setIsPublic}
                fieldHint="Leave this checked for open access, or clear it to restrict the folder."
              />
              {!isPublic ? (
                <>
                  <div className={uiSpacing.sectionStack}>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Allowed Users</div>
                      <div className={uiTypography.helper}>Select the individual users who can open this folder.</div>
                    </div>
                    <div className={uiCx(uiBorders.subtle, uiRadius.card, 'max-h-56 overflow-y-auto p-3')}>
                      <AppInput
                        label="Search users"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        leftIcon={<Search className="h-4 w-4" />}
                        placeholder="Search users..."
                        className="mb-3"
                        fieldHint="Search users\n\nFilter the user list by username or email."
                      />
                      <div className="space-y-2">
                        {filteredUsers.map((u) => (
                          <AppCheckbox
                            key={u.id}
                            label={
                              <span>
                                {u.username}
                                {u.email ? <span className="text-gray-500"> ({u.email})</span> : null}
                              </span>
                            }
                            checked={selectedUserIds.includes(u.id)}
                            onChange={() =>
                              setSelectedUserIds((prev) =>
                                prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                              )
                            }
                          />
                        ))}
                        {!filteredUsers.length ? <div className={uiTypography.helper}>No users found.</div> : null}
                      </div>
                    </div>
                  </div>
                  <div className={uiSpacing.sectionStack}>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Allowed Divisions</div>
                      <div className={uiTypography.helper}>Select which divisions can access this folder.</div>
                    </div>
                    <div className={uiCx(uiBorders.subtle, uiRadius.card, 'max-h-56 overflow-y-auto p-3')}>
                      {divisionsOptions?.length ? (
                        <div className="space-y-2">
                          {divisionsOptions.map((div) => (
                            <AppCheckbox
                              key={div.id}
                              label={div.label}
                              checked={selectedDivisions.includes(div.label)}
                              onChange={() =>
                                setSelectedDivisions((prev) =>
                                  prev.includes(div.label) ? prev.filter((id) => id !== div.label) : [...prev, div.label]
                                )
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className={uiTypography.helper}>No divisions configured.</div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-500">Failed to load permissions</div>
          )}
        </AppFormModal>
      ) : null}

      {uploadQueue.length > 0 ? (
        <AppCard
          className={uiCx('fixed bottom-4 right-4 z-50 max-h-96 w-80 overflow-hidden shadow-2xl', uiBorders.subtle, uiRadius.card)}
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
                {u.status === 'uploading' ? (
                  <div className={uiCx('mt-1 h-1.5 w-full overflow-hidden', uiRadius.badge, uiColors.surfaceSubtle)}>
                    <div
                      className={uiCx('h-full bg-blue-600 transition-all', uiRadius.badge)}
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                ) : null}
                {u.status === 'error' ? (
                  <div className={uiCx(uiTypography.helper, 'mt-1 text-red-600')} title={u.error}>
                    {u.error || 'Upload failed'}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </AppCard>
      ) : null}

      <FileImagePreviewModal
        open={imageGallery.open}
        items={imageGallery.items}
        index={imageGallery.index}
        loading={imageGallery.loading}
        onClose={imageGallery.close}
        onPrev={imageGallery.goPrev}
        onNext={imageGallery.goNext}
      />

      {previewPdf ? (
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
      ) : null}

      {previewExcel ? (
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
      ) : null}
    </>
  );
}
