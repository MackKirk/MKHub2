import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import ImageEditor from '@/components/ImageEditor';

export type ClientFileForFiles = { id: string; file_object_id: string; is_image?: boolean; content_type?: string; category?: string; original_name?: string; uploaded_at?: string; site_id?: string };

export function CustomerFilesTabEnhanced({ clientId, files, onRefresh, hasEditPermission }: { clientId: string; files: ClientFileForFiles[]; onRefresh: () => any; hasEditPermission?: boolean }) {
  const canEditFiles = !!hasEditPermission;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{ id: string; file: File; progress: number; status: 'pending' | 'uploading' | 'success' | 'error'; error?: string }>>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string; fileObjectId?: string } | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [previewExcel, setPreviewExcel] = useState<{ url: string; name: string } | null>(null);
  const [editingImage, setEditingImage] = useState<{ fileObjectId: string; name: string } | null>(null);
  const [sortBy, setSortBy] = useState<'uploaded_at' | 'name' | 'type'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data: categories } = useQuery({
    queryKey: ['file-categories'],
    queryFn: () => api<any[]>('GET', '/clients/file-categories'),
  });

  const visibleCategories = useMemo(() => {
    return (categories || []).filter((c: any) => String(c?.id || '') !== 'photos');
  }, [categories]);

  const filesByCategory = useMemo(() => {
    const grouped: Record<string, ClientFileForFiles[]> = { all: [], uncategorized: [] };
    files.forEach((f) => {
      const cat = f.category || 'uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
      grouped['all'].push(f);
    });
    return grouped;
  }, [files]);

  useEffect(() => {
    if (selectedCategory === 'all' || selectedCategory === 'uncategorized') return;
    if (!visibleCategories.find((c: any) => c.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [selectedCategory, visibleCategories]);

  const getFileTypeLabel = (f: ClientFileForFiles): string => {
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
    const list = filesByCategory[selectedCategory] || [];
    return [...list].sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortBy === 'uploaded_at') {
        aVal = a.uploaded_at || '';
        bVal = b.uploaded_at || '';
      } else if (sortBy === 'name') {
        aVal = (a.original_name || a.file_object_id || '').toLowerCase();
        bVal = (b.original_name || b.file_object_id || '').toLowerCase();
      } else {
        aVal = getFileTypeLabel(a).toLowerCase();
        bVal = getFileTypeLabel(b).toLowerCase();
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filesByCategory, selectedCategory, sortBy, sortOrder]);

  const handleSort = (column: 'uploaded_at' | 'name' | 'type') => {
    if (sortBy === column) setSortOrder((s) => (s === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const iconFor = (f: ClientFileForFiles) => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (is('pdf')) return { label: 'PDF', color: 'bg-red-500' };
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return { label: 'XLS', color: 'bg-green-600' };
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return { label: 'DOC', color: 'bg-blue-600' };
    if (['ppt', 'pptx'].includes(ext) || ct.includes('powerpoint')) return { label: 'PPT', color: 'bg-orange-500' };
    if (['zip', 'rar', '7z'].includes(ext) || ct.includes('zip')) return { label: 'ZIP', color: 'bg-gray-700' };
    if (is('txt')) return { label: 'TXT', color: 'bg-gray-500' };
    return { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: 'bg-gray-600' };
  };

  const getFileType = (f: ClientFileForFiles): 'image' | 'pdf' | 'excel' | 'other' => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (f.is_image || ct.startsWith('image/')) return 'image';
    if (is('pdf')) return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'excel';
    return 'other';
  };

  const handleFilePreview = async (f: ClientFileForFiles) => {
    const fileType = getFileType(f);
    const name = f.original_name || f.file_object_id;
    try {
      const r: any = await api('GET', `/files/${f.file_object_id}/download`);
      const url = r.download_url || '';
      if (!url) {
        toast.error('Preview not available');
        return;
      }
      if (fileType === 'image') setPreviewImage({ url, name, fileObjectId: f.file_object_id });
      else if (fileType === 'pdf') setPreviewPdf({ url, name });
      else if (fileType === 'excel') setPreviewExcel({ url, name });
      else window.open(url, '_blank');
    } catch {
      toast.error('Preview not available');
    }
  };

  const fetchDownloadUrl = async (fid: string) => {
    try {
      const r: any = await api('GET', `/files/${fid}/download`);
      return String(r.download_url || '');
    } catch {
      toast.error('Download link unavailable');
      return '';
    }
  };

  const uploadMultiple = async (fileList: File[], targetCategory?: string) => {
    const category = targetCategory !== undefined ? (targetCategory === 'uncategorized' ? null : targetCategory) : selectedCategory === 'all' || selectedCategory === 'uncategorized' ? undefined : selectedCategory;
    if (!canEditFiles) return;

    const newQueue = Array.from(fileList).map((file, idx) => ({ id: `${Date.now()}-${idx}`, file, progress: 0, status: 'pending' as const }));
    setUploadQueue((prev) => [...prev, ...newQueue]);

    for (const item of newQueue) {
      try {
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'uploading' } : u)));
        const up: any = await api('POST', '/files/upload', {
          project_id: null,
          client_id: clientId,
          employee_id: null,
          category_id: 'client-files',
          original_name: item.file.name,
          content_type: item.file.type || 'application/octet-stream',
        });
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': item.file.type || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' },
          body: item.file,
        });
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: item.file.size,
          checksum_sha256: 'na',
          content_type: item.file.type || 'application/octet-stream',
        });
        await api('POST', `/clients/${clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent(category || '')}&original_name=${encodeURIComponent(item.file.name)}`);
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'success', progress: 100 } : u)));
      } catch (e: any) {
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'error', error: e.message || 'Upload failed' } : u)));
      }
    }
    await onRefresh();
    setTimeout(() => setUploadQueue((prev) => prev.filter((u) => !newQueue.find((nq) => nq.id === u.id))), 2000);
  };

  const handleMoveFile = async (fileId: string, newCategory: string) => {
    try {
      if (!canEditFiles) return;
      await api('PUT', `/clients/${clientId}/files/${fileId}`, { category: newCategory === 'uncategorized' ? null : newCategory });
      await onRefresh();
      toast.success('File moved');
    } catch {
      toast.error('Failed to move file');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;
    try {
      if (!canEditFiles) return;
      await api('DELETE', `/clients/${clientId}/files/${fileId}`);
      await onRefresh();
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Files</h2>
        </div>
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex h-[calc(100vh-400px)]">
            <div className="w-64 border-r bg-gray-50 flex flex-col">
              <div className="p-3 border-b">
                <div className="text-xs font-semibold text-gray-700">File Categories</div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <button onClick={() => setSelectedCategory('all')} className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${selectedCategory === 'all' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">📁</span>
                    <span className="text-xs">All Files</span>
                    <span className="ml-auto text-[10px] text-gray-500">({filesByCategory['all']?.length || 0})</span>
                  </div>
                </button>
                {visibleCategories.map((cat: any) => {
                  const count = filesByCategory[cat.id]?.length || 0;
                  const canEditCat = canEditFiles;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      onDragOver={canEditCat ? (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); } : undefined}
                      onDragLeave={canEditCat ? (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); } : undefined}
                      onDrop={canEditCat ? async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.length) {
                          await uploadMultiple(Array.from(e.dataTransfer.files), cat.id);
                          return;
                        }
                        if (draggedFileId) {
                          await handleMoveFile(draggedFileId, cat.id);
                          setDraggedFileId(null);
                        }
                      } : undefined}
                      className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${selectedCategory === cat.id ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'} ${isDragging && canEditCat ? 'bg-blue-50' : ''}`}
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
                  <button onClick={() => setSelectedCategory('uncategorized')} className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${selectedCategory === 'uncategorized' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">📦</span>
                      <span className="text-xs">Uncategorized</span>
                      <span className="ml-auto text-[10px] text-gray-500">({filesByCategory['uncategorized']?.length || 0})</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
            <div
              className={`flex-1 overflow-y-auto p-4 ${isDragging && canEditFiles ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}
              onDragOver={canEditFiles ? (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); } : undefined}
              onDragLeave={canEditFiles ? (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); } : undefined}
              onDrop={canEditFiles ? async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) {
                  const category = selectedCategory === 'all' ? undefined : selectedCategory === 'uncategorized' ? null : selectedCategory;
                  await uploadMultiple(Array.from(e.dataTransfer.files), category);
                  return;
                }
                if (draggedFileId && selectedCategory !== 'all' && selectedCategory !== 'uncategorized') {
                  await handleMoveFile(draggedFileId, selectedCategory);
                  setDraggedFileId(null);
                }
              } : undefined}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold">
                  {selectedCategory === 'all' ? 'All Files' : selectedCategory === 'uncategorized' ? 'Uncategorized Files' : visibleCategories.find((c: any) => c.id === selectedCategory)?.name || 'Files'}
                  <span className="ml-2 text-gray-500">({currentFiles.length})</span>
                </div>
                {canEditFiles && (
                  <button onClick={() => setShowUpload(true)} className="px-2 py-1 rounded bg-brand-red text-white text-xs">
                    + Upload File
                  </button>
                )}
              </div>
              <div className="rounded-lg border overflow-hidden bg-white">
                {currentFiles.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-12"></th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('name')}>
                            <div className="flex items-center gap-1">Name {sortBy === 'name' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}</div>
                          </th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('type')}>
                            <div className="flex items-center gap-1">Type {sortBy === 'type' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}</div>
                          </th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('uploaded_at')}>
                            <div className="flex items-center gap-1">Upload Date {sortBy === 'uploaded_at' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}</div>
                          </th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {currentFiles.map((f) => {
                          const icon = iconFor(f);
                          const isImg = f.is_image || String(f.content_type || '').startsWith('image/');
                          const name = f.original_name || f.file_object_id;
                          return (
                            <tr key={f.id} draggable={canEditFiles} onDragStart={() => canEditFiles && setDraggedFileId(f.id)} onDragEnd={() => setDraggedFileId(null)} className={`hover:bg-gray-50 ${canEditFiles ? 'cursor-move' : ''}`}>
                              <td className="px-3 py-2">
                                {isImg ? (
                                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 cursor-pointer flex-shrink-0" onClick={() => handleFilePreview(f)}>
                                    <img src={`/files/${f.file_object_id}/thumbnail?w=64`} alt={name} className="w-full h-full object-cover" />
                                  </div>
                                ) : (
                                  <div className={`w-8 h-10 rounded-lg ${icon.color} text-white flex items-center justify-center text-[10px] font-extrabold select-none flex-shrink-0 cursor-pointer`} onClick={() => handleFilePreview(f)}>
                                    {icon.label}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 cursor-pointer" onClick={() => handleFilePreview(f)}>
                                <div className="text-xs font-semibold truncate max-w-xs">{name}</div>
                              </td>
                              <td className="px-3 py-2 cursor-pointer" onClick={() => handleFilePreview(f)}>
                                <div className="text-xs text-gray-600">{getFileTypeLabel(f)}</div>
                              </td>
                              <td className="px-3 py-2 cursor-pointer" onClick={() => handleFilePreview(f)}>
                                <div className="text-xs text-gray-600">{f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString('pt-BR') : '-'}</div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-0.5">
                                  <button onClick={async (e) => { e.stopPropagation(); const url = await fetchDownloadUrl(f.file_object_id); if (url) window.open(url, '_blank'); }} title="Download" className="p-1 rounded hover:bg-gray-100 text-xs">⬇️</button>
                                  {isImg && canEditFiles && (
                                    <button onClick={(e) => { e.stopPropagation(); setEditingImage({ fileObjectId: f.file_object_id, name: f.original_name || 'image' }); }} title="Edit" className="p-1 rounded hover:bg-blue-50 text-blue-600 text-xs">✏️</button>
                                  )}
                                  {canEditFiles && (
                                    <>
                                      <button onClick={(e) => { e.stopPropagation(); const newCat = prompt('Move to category (leave empty for uncategorized):'); if (newCat !== null) handleMoveFile(f.id, newCat || 'uncategorized'); }} title="Move to category" className="p-1 rounded hover:bg-gray-100 text-xs">📦</button>
                                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id); }} title="Delete" className="p-1 rounded hover:bg-red-50 text-red-600 text-xs">🗑️</button>
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
                  <div className="px-3 py-6 text-center text-gray-500">
                    <div className="text-2xl mb-2">📁</div>
                    <div className="text-xs">No files in this category</div>
                    {canEditFiles && <div className="text-[10px] mt-1">Drag and drop files here or click &quot;Upload File&quot;</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3">Upload Files</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1.5">Files (multiple files supported)</div>
                <input type="file" multiple onChange={async (e) => { const fileList = e.target.files; if (fileList?.length) { setShowUpload(false); await uploadMultiple(Array.from(fileList)); } }} className="w-full text-xs" />
              </div>
              <div className="text-[10px] text-gray-500">You can also drag and drop files directly onto the category area</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowUpload(false)} className="px-3 py-1.5 rounded border text-xs">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border w-80 max-h-96 overflow-hidden z-50">
          <div className="p-2.5 border-b bg-gray-50 flex items-center justify-between">
            <div className="font-semibold text-xs">Upload Progress</div>
            <button onClick={() => setUploadQueue([])} className="text-gray-500 hover:text-gray-700 text-[10px]">Clear</button>
          </div>
          <div className="overflow-y-auto max-h-80">
            {uploadQueue.map((u) => (
              <div key={u.id} className="p-2.5 border-b">
                <div className="flex items-start gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" title={u.file.name}>{u.file.name}</div>
                    <div className="text-[10px] text-gray-500">{(u.file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                  <div className="text-xs">{u.status === 'pending' && '⏳'}{u.status === 'uploading' && '⏳'}{u.status === 'success' && '✅'}{u.status === 'error' && '❌'}</div>
                </div>
                {u.status === 'uploading' && <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${u.progress}%` }} /></div>}
                {u.status === 'error' && <div className="text-[10px] text-red-600 mt-1" title={u.error}>{u.error || 'Upload failed'}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewImage(null)}>
          <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold">{previewImage.name}</h3>
              <div className="flex items-center gap-2">
                <a href={previewImage.url} download={previewImage.name} className="text-xs px-2 py-1 rounded border hover:bg-gray-50" title="Download">⬇️</a>
                {canEditFiles && previewImage.fileObjectId && (
                  <button onClick={() => { setEditingImage({ fileObjectId: previewImage.fileObjectId!, name: previewImage.name }); setPreviewImage(null); }} className="text-xs px-2 py-1 rounded border hover:bg-blue-50 text-blue-600" title="Edit">✏️ Edit</button>
                )}
                <a href={previewImage.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded border hover:bg-gray-50" title="Open in new tab">🔗</a>
                <button onClick={() => setPreviewImage(null)} className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 min-h-0 flex items-center justify-center">
              <img src={previewImage.url} alt={previewImage.name} className="max-w-full max-h-full h-auto object-contain" />
            </div>
          </div>
        </div>
      )}
      {previewPdf && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewPdf(null)}>
          <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold">{previewPdf.name}</h3>
              <div className="flex items-center gap-2">
                <a href={previewPdf.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded border hover:bg-gray-50">🔗</a>
                <button onClick={() => setPreviewPdf(null)} className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe src={previewPdf.url} className="w-full h-full border-0" title={previewPdf.name} />
            </div>
          </div>
        </div>
      )}
      {previewExcel && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewExcel(null)}>
          <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold">{previewExcel.name}</h3>
              <div className="flex items-center gap-2">
                <a href={previewExcel.url} download={previewExcel.name} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">⬇️</a>
                <a href={previewExcel.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded border hover:bg-gray-50">🔗</a>
                <button onClick={() => setPreviewExcel(null)} className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewExcel.url)}`} className="w-full h-full border-0" title={previewExcel.name} allow="fullscreen" />
            </div>
          </div>
        </div>
      )}
      {editingImage && (
        <ImageEditor
          isOpen={!!editingImage}
          onClose={() => setEditingImage(null)}
          imageUrl={`/files/${editingImage.fileObjectId}/thumbnail?w=1600`}
          imageName={editingImage.name}
          fileObjectId={editingImage.fileObjectId}
          onSave={async (blob) => {
            try {
              const originalName = editingImage.name || 'image';
              const dot = originalName.lastIndexOf('.');
              const nameNoExt = dot > 0 ? originalName.slice(0, dot) : originalName.replace(/\.+$/, '');
              const ext = dot > 0 ? originalName.slice(dot) : '.png';
              const editedName = `${nameNoExt}_edited${ext}`;
              const up: any = await api('POST', '/files/upload', {
                project_id: null,
                client_id: clientId,
                employee_id: null,
                category_id: 'image-edited',
                original_name: editedName,
                content_type: 'image/png',
              });
              await fetch(up.upload_url, {
                method: 'PUT',
                headers: { 'Content-Type': 'image/png', 'x-ms-blob-type': 'BlockBlob' },
                body: blob,
              });
              const conf: any = await api('POST', '/files/confirm', {
                key: up.key,
                size_bytes: blob.size,
                checksum_sha256: 'na',
                content_type: 'image/png',
              });
              const originalFile = files.find((f) => f.file_object_id === editingImage.fileObjectId);
              await api('POST', `/clients/${encodeURIComponent(clientId)}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent(originalFile?.category || 'image-edited')}&original_name=${encodeURIComponent(editedName)}${originalFile?.site_id ? `&site_id=${encodeURIComponent(originalFile.site_id)}` : ''}`);
              toast.success('Image saved as edited copy');
              await onRefresh();
              setEditingImage(null);
            } catch (e: any) {
              console.error('Failed to save edited image:', e);
              toast.error('Failed to save edited image');
            }
          }}
        />
      )}
    </div>
  );
}
