import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import type { DocumentTypePreset } from '@/components/ChooseDocumentTypeModal';
import type { DocElement, PageMargins } from '@/types/documentCreator';
import { DocumentTypePageLayoutModal } from '@/components/DocumentTypePageLayoutModal';

type Template = { id: string; name: string; background_file_id?: string };

type PageTemplateRow = {
  template_id: string;
  label: string;
  margins?: PageMargins | null;
  elements?: DocElement[];
};

export default function DocumentTypesTab() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pages, setPages] = useState<PageTemplateRow[]>([{ template_id: '', label: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [layoutModalPageIndex, setLayoutModalPageIndex] = useState<number | null>(null);

  const { data: documentTypes = [] } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
  });
  const editing = editingId ? documentTypes.find((dt) => dt.id === editingId) : null;

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setDescription(editing.description || '');
      const pt = editing.page_templates || [];
      setPages(
        pt.length > 0
          ? pt.map((p: { template_id?: string; label?: string; margins?: PageMargins; elements?: DocElement[] }) => ({
              template_id: p.template_id || '',
              label: p.label || '',
              margins: p.margins,
              elements: Array.isArray(p.elements) ? p.elements : [],
            }))
          : [{ template_id: '', label: '' }]
      );
    } else if (!showForm) {
      setName('');
      setDescription('');
      setPages([{ template_id: '', label: '' }]);
    }
  }, [editing, showForm]);

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
  });

  const layoutPage = layoutModalPageIndex !== null ? pages[layoutModalPageIndex] : null;

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

  const savePageLayout = (index: number, margins: PageMargins, elements: DocElement[]) => {
    setPages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], margins, elements };
      return next;
    });
    setLayoutModalPageIndex(null);
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
        return {
          template_id: tid,
          label: p.label?.trim() || undefined,
          margins: p.margins ?? undefined,
          elements: p.elements ?? [],
        };
      })
      .filter(Boolean) as { template_id: string; label?: string; margins?: PageMargins; elements?: DocElement[] }[];
    if (page_templates.length === 0) {
      toast.error('Add at least one page (select a background template).');
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        await api('PATCH', `/document-creator/document-types/${editingId}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          page_templates,
        });
        toast.success('Document type updated.');
      } else {
        await api('POST', '/document-creator/document-types', {
          name: name.trim(),
          description: description.trim() || undefined,
          page_templates,
        });
        toast.success('Document type created.');
      }
      queryClient.invalidateQueries({ queryKey: ['document-creator-document-types'] });
      setShowForm(false);
      setEditingId(null);
      setName('');
      setDescription('');
      setPages([{ template_id: '', label: '' }]);
    } catch (err: any) {
      toast.error(err?.message || (editingId ? 'Failed to update.' : 'Failed to create document type.'));
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPages([{ template_id: '', label: '' }]);
    setShowForm(true);
  };

  const openEdit = (dt: DocumentTypePreset) => {
    setEditingId(dt.id);
    setShowForm(true);
  };

  const handleDelete = async (dt: DocumentTypePreset) => {
    const ok = await confirm({
      title: 'Delete document type',
      message: `Delete "${dt.name}"? Documents already created with this type will keep their pages.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    try {
      await api('DELETE', `/document-creator/document-types/${dt.id}`);
      toast.success('Document type deleted.');
      queryClient.invalidateQueries({ queryKey: ['document-creator-document-types'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete.');
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
          onClick={openCreate}
          className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90"
        >
          Create document type
        </button>
      </div>
      {documentTypes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-gray-600 mb-3">No document types yet.</p>
          <p className="text-sm text-gray-500 mb-4">
            Create a preset (e.g. Cover + Back cover + Content) so users can pick it when creating a document.
          </p>
          <button
            type="button"
            onClick={openCreate}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(dt)}
                  className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(dt)}
                  className="px-3 py-1.5 rounded text-red-600 hover:bg-red-50 text-sm"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit document type' : 'New document type'}
              </h3>
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
                    <div key={idx} className="flex flex-wrap gap-2 items-center p-2 rounded-lg border border-gray-200 bg-gray-50/50">
                      <select
                        value={p.template_id}
                        onChange={(e) => updatePage(idx, 'template_id', e.target.value)}
                        className="flex-1 min-w-[140px] px-3 py-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50"
                      >
                        <option value="">— Background —</option>
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
                        className="w-24 px-2 py-2 rounded border border-gray-300 text-sm"
                        placeholder="Label"
                      />
                      <button
                        type="button"
                        onClick={() => setLayoutModalPageIndex(idx)}
                        disabled={!p.template_id}
                        className="px-3 py-1.5 rounded bg-brand-red/10 text-brand-red hover:bg-brand-red/20 border border-brand-red/30 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Edit layout
                      </button>
                      <button
                        type="button"
                        onClick={() => removePage(idx)}
                        className="p-2 text-gray-500 hover:text-red-600"
                        aria-label="Remove page"
                      >
                        ×
                      </button>
                      {(p.elements?.length ?? 0) > 0 && (
                        <span className="text-xs text-gray-500">{(p.elements?.length ?? 0)} elements</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </form>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
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
                {isSaving ? 'Saving...' : editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {layoutModalPageIndex !== null && layoutPage && (
        <DocumentTypePageLayoutModal
          open={true}
          pageIndex={layoutModalPageIndex}
          templateId={layoutPage.template_id || null}
          templates={templates}
          initialMargins={layoutPage.margins}
          initialElements={layoutPage.elements}
          onClose={() => setLayoutModalPageIndex(null)}
          onSave={(margins, elements) => savePageLayout(layoutModalPageIndex, margins, elements)}
        />
      )}
    </div>
  );
}
