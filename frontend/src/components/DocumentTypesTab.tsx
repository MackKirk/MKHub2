import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import type { DocumentTypePreset } from '@/components/ChooseDocumentTypeModal';

type Template = { id: string; name: string };

export default function DocumentTypesTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pages, setPages] = useState<{ template_id: string; label: string }[]>([
    { template_id: '', label: '' },
  ]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: documentTypes = [], isLoading } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
  });

  const addPage = () => {
    setPages((prev) => [...prev, { template_id: '', label: '' }]);
  };

  const removePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePage = (index: number, field: 'template_id' | 'label', value: string) => {
    setPages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Enter a name for the document type.');
      return;
    }
    const page_templates = pages
      .map((p) => {
        const tid = p.template_id?.trim();
        if (!tid) return null;
        return { template_id: tid, label: p.label?.trim() || undefined };
      })
      .filter(Boolean) as { template_id: string; label?: string }[];
    if (page_templates.length === 0) {
      toast.error('Add at least one page (select a background template).');
      return;
    }
    setIsSaving(true);
    try {
      await api('POST', '/document-creator/document-types', {
        name: name.trim(),
        description: description.trim() || undefined,
        page_templates,
      });
      queryClient.invalidateQueries({ queryKey: ['document-creator-document-types'] });
      toast.success('Document type created.');
      setShowForm(false);
      setName('');
      setDescription('');
      setPages([{ template_id: '', label: '' }]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create document type.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Document types are preset layouts: an ordered list of background templates (e.g. cover, back cover, content
        page). When creating a document, users can choose a type to start with that sequence of pages.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90"
        >
          Create document type
        </button>
      </div>
      {isLoading ? (
        <div className="text-sm text-gray-500 py-6">Loading...</div>
      ) : documentTypes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-gray-600 mb-3">No document types yet.</p>
          <p className="text-sm text-gray-500 mb-4">
            Create a preset (e.g. Cover + Back cover + Content) so users can pick it when creating a document.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90"
          >
            Create document type
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {documentTypes.map((dt) => (
            <li
              key={dt.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3"
            >
              <div>
                <div className="font-medium text-gray-900">{dt.name}</div>
                <div className="text-xs text-gray-500">
                  {dt.description || `${(dt.page_templates || []).length} page(s)`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">New document type</h3>
            </div>
            <form id="document-type-form" onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
                  placeholder="e.g. Proposal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
                  placeholder="e.g. Cover + back cover + content page"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Pages (order)</label>
                  <button
                    type="button"
                    onClick={addPage}
                    className="text-sm text-brand-red hover:underline"
                  >
                    + Add page
                  </button>
                </div>
                <div className="space-y-2">
                  {pages.map((p, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        value={p.template_id}
                        onChange={(e) => updatePage(idx, 'template_id', e.target.value)}
                        className="flex-1 px-3 py-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50"
                      >
                        <option value="">— Select background —</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={p.label}
                        onChange={(e) => updatePage(idx, 'label', e.target.value)}
                        className="w-28 px-2 py-2 rounded border border-gray-300 text-sm"
                        placeholder="Label"
                      />
                      <button
                        type="button"
                        onClick={() => removePage(idx)}
                        className="p-2 text-gray-500 hover:text-red-600"
                        aria-label="Remove page"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </form>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="document-type-form"
                disabled={isSaving}
                className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
