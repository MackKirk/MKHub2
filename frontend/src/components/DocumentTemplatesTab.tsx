import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import OverlayPortal from '@/components/OverlayPortal';

type Template = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
};

export default function DocumentTemplatesTab() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [uploadingFileId, setUploadingFileId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFileId, setEditFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setUploadingFileId('uploading');
    try {
      const up: any = await api('POST', '/files/upload', {
        original_name: file.name,
        content_type: file.type,
        client_id: null,
        project_id: null,
        employee_id: null,
        category_id: 'document-creator-template',
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
      setUploadingFileId(conf.id);
      toast.success('File uploaded. Fill in the name and click Save.');
    } catch (err) {
      toast.error('Upload failed.');
      setUploadingFileId(null);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Please enter the template name.');
      return;
    }
    if (!uploadingFileId) {
      toast.error('Upload a background image first.');
      return;
    }
    setIsSaving(true);
    try {
      await api('POST', '/document-creator/templates', {
        name: name.trim(),
        description: description.trim() || undefined,
        background_file_id: uploadingFileId,
      });
      toast.success('Template created.');
      queryClient.invalidateQueries({ queryKey: ['document-creator-templates'] });
      setName('');
      setDescription('');
      setUploadingFileId(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create template.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setEditFileId('uploading');
    try {
      const up: any = await api('POST', '/files/upload', {
        original_name: file.name,
        content_type: file.type,
        client_id: null,
        project_id: null,
        employee_id: null,
        category_id: 'document-creator-template',
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
      setEditFileId(conf.id);
      toast.success('New image ready. Click Save to update template.');
    } catch (err) {
      toast.error('Upload failed.');
      setEditFileId(editingTemplate?.background_file_id ?? null);
    }
  };

  const openEditTemplate = (t: Template) => {
    setEditingTemplate(t);
    setEditName(t.name);
    setEditDescription(t.description || '');
    setEditFileId(t.background_file_id || null);
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    if (!editName.trim()) {
      toast.error('Enter a name.');
      return;
    }
    setIsSaving(true);
    try {
      await api('PATCH', `/document-creator/templates/${editingTemplate.id}`, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        background_file_id: editFileId || '',  // '' clears the image
      });
      toast.success('Template updated.');
      queryClient.invalidateQueries({ queryKey: ['document-creator-templates'] });
      setEditingTemplate(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update template.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (t: Template) => {
    const ok = await confirm({
      title: 'Delete template',
      message: `Delete the template "${t.name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    try {
      await api('DELETE', `/document-creator/templates/${t.id}`);
      toast.success('Template deleted.');
      queryClient.invalidateQueries({ queryKey: ['document-creator-templates'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Add background template</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              placeholder="e.g. Cover with logo"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              placeholder="e.g. Standard cover with logo and footer"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 font-medium transition-colors"
          >
            {uploadingFileId ? 'Change image' : 'Upload background image'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {uploadingFileId && uploadingFileId !== 'uploading' && (
            <span className="text-xs text-green-600">Image ready</span>
          )}
          {uploadingFileId === 'uploading' && (
            <span className="text-xs text-gray-500">Uploading...</span>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={isSaving || !uploadingFileId || uploadingFileId === 'uploading' || !name.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-brand-red text-white font-medium hover:bg-[#aa1212] disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save template'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Registered templates</h2>
        {isLoading ? (
          <p className="text-xs text-gray-500">Loading...</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-gray-500">No templates yet. Add one above.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden flex flex-col"
              >
                <div className="h-48 w-full rounded-t-lg bg-gray-100 overflow-hidden flex items-center justify-center">
                  {t.background_file_id ? (
                    <img
                      src={`/files/${t.background_file_id}/thumbnail?w=320`}
                      alt={t.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-gray-400 text-xs">No image</div>
                  )}
                </div>
                <div className="p-2 flex-1 min-w-0">
                  <h3 className="text-xs font-semibold text-gray-900 truncate">{t.name}</h3>
                  {t.description && (
                    <p className="text-[10px] text-gray-600 mt-0.5 line-clamp-2">{t.description}</p>
                  )}
                </div>
                <div className="p-2 flex items-center gap-0.5 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => openEditTemplate(t)}
                    className="p-1.5 rounded text-gray-500 hover:text-brand-red hover:bg-brand-red/10 transition-colors"
                    title="Edit"
                    aria-label="Edit"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {editingTemplate && (
        <OverlayPortal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Edit template</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
                  placeholder="Template name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
                  placeholder="Description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Background image</label>
                <div className="flex flex-wrap items-center gap-3">
                  {editFileId && editFileId !== 'uploading' && (
                    <img
                      src={`/files/${editFileId}/thumbnail?w=120`}
                      alt=""
                      className="h-20 rounded border border-gray-200 object-contain bg-gray-50"
                    />
                  )}
                  {editFileId === 'uploading' && (
                    <span className="text-sm text-gray-500">Uploading...</span>
                  )}
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
                  >
                    {editFileId && editFileId !== 'uploading' ? 'Replace image' : 'Upload image'}
                  </button>
                  {editFileId && editFileId !== 'uploading' && (
                    <button
                      type="button"
                      onClick={() => setEditFileId(null)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove image
                    </button>
                  )}
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleEditFileChange}
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateTemplate}
                disabled={isSaving || !editName.trim()}
                className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </div>
  );
}
