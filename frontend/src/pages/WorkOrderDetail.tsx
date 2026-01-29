import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type CostItem = {
  id?: string;
  description: string;
  amount: number;
  invoice_files: string[];
};

type WorkOrder = {
  id: string;
  work_order_number: string;
  entity_type: string;
  entity_id: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  assigned_to_user_id?: string;
  photos?: string[] | { before: string[]; after: string[] };
  documents?: string[];
  costs?: {
    labor?: number | CostItem[];
    parts?: number | CostItem[];
    other?: number | CostItem[];
    total?: number;
  };
  created_at: string;
  updated_at?: string;
  closed_at?: string;
};

export default function WorkOrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showCostForm, setShowCostForm] = useState(false);
  const [editingCost, setEditingCost] = useState<{ category: string; index?: number } | null>(null);

  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'costs' | 'files' | 'photos' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'costs' | 'files' | 'photos'>(initialTab);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as 'general' | 'costs' | 'files' | 'photos' | null;
    if (tabParam && ['general', 'costs', 'files', 'photos'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [location.search]);

  const isValidId = id && id !== 'new';

  const { data: workOrder, isLoading } = useQuery({
    queryKey: ['workOrder', id],
    queryFn: () => api<WorkOrder>('GET', `/fleet/work-orders/${id}`),
    enabled: isValidId,
  });

  const updateWorkOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return api('PUT', `/fleet/work-orders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      toast.success('Work order updated');
    },
    onError: () => {
      toast.error('Failed to update work order');
    },
  });

  const updateCostsMutation = useMutation({
    mutationFn: async (newCosts: any) => {
      return api('PUT', `/fleet/work-orders/${id}`, { costs: newCosts });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      toast.success('Costs updated');
      setShowCostForm(false);
      setEditingCost(null);
    },
    onError: () => {
      toast.error('Failed to update costs');
    },
  });

  const statusColors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    pending_parts: 'bg-orange-100 text-orange-800',
    closed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const urgencyColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    normal: 'bg-gray-100 text-gray-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
  };

  // Helper to check if costs are in new format (array) or legacy (number)
  const isCostArray = (cost: any): cost is CostItem[] => {
    return Array.isArray(cost);
  };

  const getCostTotal = (costs: any, category: 'labor' | 'parts' | 'other'): number => {
    const cost = costs?.[category];
    if (!cost) return 0;
    if (typeof cost === 'number') return cost;
    if (Array.isArray(cost)) {
      return cost.reduce((sum, item) => sum + (item.amount || 0), 0);
    }
    return 0;
  };

  const getTotalCost = (costs: any): number => {
    if (!costs) return 0;
    if (costs.total && typeof costs.total === 'number') return costs.total;
    return getCostTotal(costs, 'labor') + getCostTotal(costs, 'parts') + getCostTotal(costs, 'other');
  };

  // Helper to normalize photos structure
  const getPhotosStructure = (photos: any): { before: string[]; after: string[] } => {
    if (!photos) return { before: [], after: [] };
    if (Array.isArray(photos)) {
      // Legacy format: all photos go to "before" by default
      return { before: photos, after: [] };
    }
    if (typeof photos === 'object' && photos !== null) {
      return {
        before: Array.isArray(photos.before) ? photos.before : [],
        after: Array.isArray(photos.after) ? photos.after : [],
      };
    }
    return { before: [], after: [] };
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  if (!isValidId) {
    return <div className="p-4">Invalid work order ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!workOrder) {
    return <div className="p-4">Work order not found</div>;
  }

  const costs = workOrder.costs || {};
  const laborCosts = Array.isArray(costs.labor) ? costs.labor : [];
  const partsCosts = Array.isArray(costs.parts) ? costs.parts : [];
  const otherCosts = Array.isArray(costs.other) ? costs.other : [];
  const photosStructure = getPhotosStructure(workOrder.photos);
  const documents = workOrder.documents || [];

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => nav(`/fleet/${workOrder.entity_type === 'fleet' ? 'assets' : 'equipment'}/${workOrder.entity_id}`)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-600 hover:text-gray-900"
              title={`Back to ${workOrder.entity_type === 'fleet' ? 'Asset' : 'Equipment'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <div className="text-sm font-semibold text-gray-900">{workOrder.work_order_number}</div>
              <div className="text-xs text-gray-500 mt-0.5 capitalize">{workOrder.entity_type}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex gap-1 border-b border-gray-200 px-4">
          {(['general', 'costs', 'files', 'photos'] as const).map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                nav(`/fleet/work-orders/${id}?tab=${t}`, { replace: true });
              }}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
                tab === t ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white p-4 min-w-0 overflow-hidden">
        {tab === 'general' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Description</label>
                <div className="font-medium mt-1">{workOrder.description}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Status</label>
                <div className="mt-1">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[workOrder.status] || 'bg-gray-100 text-gray-800'}`}>
                    {workOrder.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Category</label>
                <div className="font-medium mt-1 capitalize">{workOrder.category}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Urgency</label>
                <div className="mt-1">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${urgencyColors[workOrder.urgency] || 'bg-gray-100 text-gray-800'}`}>
                    {workOrder.urgency}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Entity Type</label>
                <div className="font-medium mt-1 capitalize">{workOrder.entity_type}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Created</label>
                <div className="font-medium mt-1">
                  {new Date(workOrder.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'costs' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-medium text-gray-700">Costs</label>
            </div>

            {showCostForm && editingCost && (
              <CostFormInline
                workOrderId={id!}
                category={editingCost.category}
                existingCostIndex={editingCost.index}
                existingCost={editingCost.index !== undefined ? (
                  editingCost.category === 'labor' ? laborCosts[editingCost.index] :
                  editingCost.category === 'parts' ? partsCosts[editingCost.index] :
                  otherCosts[editingCost.index]
                ) : undefined}
                onSuccess={(newCosts) => {
                  updateCostsMutation.mutate(newCosts);
                }}
                onCancel={() => {
                  setShowCostForm(false);
                  setEditingCost(null);
                }}
              />
            )}

            <div className="space-y-4">
              {/* Labor Costs */}
              <div className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold">Labor</h4>
                  <span className="text-sm font-medium">${getCostTotal(costs, 'labor').toLocaleString()}</span>
                </div>
                {laborCosts.length > 0 ? (
                  <div className="space-y-2">
                    {laborCosts.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between p-2 bg-gray-50 rounded">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.description || 'No description'}</div>
                          <div className="text-xs text-gray-600">${item.amount.toLocaleString()}</div>
                          {item.invoice_files && item.invoice_files.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              {item.invoice_files.length} invoice file(s)
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setEditingCost({ category: 'labor', index: idx });
                            setShowCostForm(true);
                          }}
                          className="text-xs text-brand-red hover:underline ml-2"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No labor costs added</p>
                )}
                <button
                  onClick={() => {
                    setEditingCost({ category: 'labor' });
                    setShowCostForm(true);
                  }}
                  className="mt-2 text-xs text-brand-red hover:underline"
                >
                  + Add Labor Cost
                </button>
              </div>

              {/* Parts Costs */}
              <div className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold">Parts</h4>
                  <span className="text-sm font-medium">${getCostTotal(costs, 'parts').toLocaleString()}</span>
                </div>
                {partsCosts.length > 0 ? (
                  <div className="space-y-2">
                    {partsCosts.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between p-2 bg-gray-50 rounded">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.description || 'No description'}</div>
                          <div className="text-xs text-gray-600">${item.amount.toLocaleString()}</div>
                          {item.invoice_files && item.invoice_files.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              {item.invoice_files.length} invoice file(s)
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setEditingCost({ category: 'parts', index: idx });
                            setShowCostForm(true);
                          }}
                          className="text-xs text-brand-red hover:underline ml-2"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No parts costs added</p>
                )}
                <button
                  onClick={() => {
                    setEditingCost({ category: 'parts' });
                    setShowCostForm(true);
                  }}
                  className="mt-2 text-xs text-brand-red hover:underline"
                >
                  + Add Parts Cost
                </button>
              </div>

              {/* Other Costs */}
              <div className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold">Other</h4>
                  <span className="text-sm font-medium">${getCostTotal(costs, 'other').toLocaleString()}</span>
                </div>
                {otherCosts.length > 0 ? (
                  <div className="space-y-2">
                    {otherCosts.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between p-2 bg-gray-50 rounded">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.description || 'No description'}</div>
                          <div className="text-xs text-gray-600">${item.amount.toLocaleString()}</div>
                          {item.invoice_files && item.invoice_files.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              {item.invoice_files.length} invoice file(s)
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setEditingCost({ category: 'other', index: idx });
                            setShowCostForm(true);
                          }}
                          className="text-xs text-brand-red hover:underline ml-2"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No other costs added</p>
                )}
                <button
                  onClick={() => {
                    setEditingCost({ category: 'other' });
                    setShowCostForm(true);
                  }}
                  className="mt-2 text-xs text-brand-red hover:underline"
                >
                  + Add Other Cost
                </button>
              </div>

              {/* Total */}
              <div className="border-t-2 pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-lg font-bold">${getTotalCost(costs).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'files' && (
          <FilesTab
            workOrderId={id!}
            documents={documents}
            onUpdate={(newDocuments) => {
              updateWorkOrderMutation.mutate({ documents: newDocuments });
            }}
          />
        )}

        {tab === 'photos' && (
          <PhotosTab
            workOrderId={id!}
            photos={photosStructure}
            onUpdate={(newPhotos) => {
              updateWorkOrderMutation.mutate({ photos: newPhotos });
            }}
          />
        )}
      </div>
    </div>
  );
}

// Files Tab Component
function FilesTab({ workOrderId, documents, onUpdate }: {
  workOrderId: string;
  documents: string[];
  onUpdate: (documents: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File): Promise<string> => {
    const name = file.name;
    const type = file.type || 'application/pdf';
    const up: any = await api('POST', '/files/upload', {
      original_name: name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: 'work-order-documents',
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });
    const conf: any = await api('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: type,
    });
    return conf.id;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(file => uploadFile(file));
      const uploadedIds = await Promise.all(uploadPromises);
      onUpdate([...documents, ...uploadedIds]);
      toast.success('Files uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (fileId: string) => {
    onUpdate(documents.filter(id => id !== fileId));
    toast.success('File removed');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Documents & Files</h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className={`px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 cursor-pointer inline-block ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {uploading ? 'Uploading...' : '+ Upload Files'}
          </label>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No files uploaded yet</p>
          <p className="text-sm mt-2">Click "Upload Files" to add documents, invoices, or other files</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((docId, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <a
                    href={`/files/${docId}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    Document {idx + 1}
                  </a>
                  <p className="text-xs text-gray-500">Click to download</p>
                </div>
              </div>
              <button
                onClick={() => handleRemoveFile(docId)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Photos Tab Component
function PhotosTab({ workOrderId, photos, onUpdate }: {
  workOrderId: string;
  photos: { before: string[]; after: string[] };
  onUpdate: (photos: { before: string[]; after: string[] }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<'before' | 'after'>('before');
  const beforeFileInputRef = useRef<HTMLInputElement>(null);
  const afterFileInputRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = async (file: File): Promise<string> => {
    const name = file.name;
    const type = file.type || 'image/jpeg';
    const up: any = await api('POST', '/files/upload', {
      original_name: name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: 'work-order-photos',
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });
    const conf: any = await api('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: type,
    });
    return conf.id;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, category: 'before' | 'after') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(file => uploadPhoto(file));
      const uploadedIds = await Promise.all(uploadPromises);
      const newPhotos = { ...photos };
      newPhotos[category] = [...newPhotos[category], ...uploadedIds];
      onUpdate(newPhotos);
      toast.success(`Photos uploaded to ${category === 'before' ? 'Before' : 'After'} section`);
    } catch (error) {
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
      if (category === 'before' && beforeFileInputRef.current) {
        beforeFileInputRef.current.value = '';
      }
      if (category === 'after' && afterFileInputRef.current) {
        afterFileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (photoId: string, category: 'before' | 'after') => {
    const newPhotos = { ...photos };
    newPhotos[category] = newPhotos[category].filter(id => id !== photoId);
    onUpdate(newPhotos);
    toast.success('Photo removed');
  };

  return (
    <div className="space-y-6">
      {/* Before Maintenance Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Before Maintenance</h3>
          <div>
            <input
              ref={beforeFileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileChange(e, 'before')}
              disabled={uploading}
              className="hidden"
              id="before-photo-upload"
            />
            <label
              htmlFor="before-photo-upload"
              className={`px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 cursor-pointer inline-block ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {uploading ? 'Uploading...' : '+ Add Before Photos'}
            </label>
          </div>
        </div>
        {photos.before.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
            <p>No photos uploaded yet</p>
            <p className="text-sm mt-2">Upload photos showing the condition before maintenance</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {photos.before.map((photoId, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={`/files/${photoId}/thumbnail?w=300`}
                  alt={`Before ${idx + 1}`}
                  className="w-full h-48 object-cover rounded border"
                />
                <button
                  onClick={() => handleRemovePhoto(photoId, 'before')}
                  className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
                <a
                  href={`/files/${photoId}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-50 transition-all opacity-0 group-hover:opacity-100"
                >
                  <span className="text-white text-sm">View Full Size</span>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* After Maintenance Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">After Maintenance</h3>
          <div>
            <input
              ref={afterFileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileChange(e, 'after')}
              disabled={uploading}
              className="hidden"
              id="after-photo-upload"
            />
            <label
              htmlFor="after-photo-upload"
              className={`px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 cursor-pointer inline-block ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {uploading ? 'Uploading...' : '+ Add After Photos'}
            </label>
          </div>
        </div>
        {photos.after.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
            <p>No photos uploaded yet</p>
            <p className="text-sm mt-2">Upload photos showing the condition after maintenance</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {photos.after.map((photoId, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={`/files/${photoId}/thumbnail?w=300`}
                  alt={`After ${idx + 1}`}
                  className="w-full h-48 object-cover rounded border"
                />
                <button
                  onClick={() => handleRemovePhoto(photoId, 'after')}
                  className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
                <a
                  href={`/files/${photoId}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-50 transition-all opacity-0 group-hover:opacity-100"
                >
                  <span className="text-white text-sm">View Full Size</span>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Cost Form Component
function CostFormInline({ workOrderId, category, existingCost, existingCostIndex, onSuccess, onCancel }: {
  workOrderId: string;
  category: 'labor' | 'parts' | 'other';
  existingCost?: CostItem;
  existingCostIndex?: number;
  onSuccess: (costs: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    description: existingCost?.description || '',
    amount: existingCost?.amount || 0,
  });
  const [invoiceFiles, setInvoiceFiles] = useState<string[]>(existingCost?.invoice_files || []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File): Promise<string> => {
    const name = file.name;
    const type = file.type || 'application/pdf';
    const up: any = await api('POST', '/files/upload', {
      original_name: name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: 'work-order-invoices',
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });
    const conf: any = await api('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: type,
    });
    return conf.id;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(file => uploadFile(file));
      const uploadedIds = await Promise.all(uploadPromises);
      setInvoiceFiles(prev => [...prev, ...uploadedIds]);
      toast.success('Invoice files uploaded');
    } catch (error) {
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const { data: workOrder } = useQuery({
    queryKey: ['workOrder', workOrderId],
    queryFn: () => api<WorkOrder>('GET', `/fleet/work-orders/${workOrderId}`),
  });

  const getCostTotal = (costs: any, cat: 'labor' | 'parts' | 'other'): number => {
    const cost = costs?.[cat];
    if (!cost) return 0;
    if (typeof cost === 'number') return cost;
    if (Array.isArray(cost)) {
      return cost.reduce((sum, item) => sum + (item.amount || 0), 0);
    }
    return 0;
  };

  const handleSubmit = () => {
    if (!form.description.trim() || form.amount <= 0) {
      toast.error('Description and amount are required');
      return;
    }

    const currentCosts = workOrder?.costs || {};
    // Convert legacy format to new format if needed
    let categoryCosts: CostItem[] = [];
    if (Array.isArray(currentCosts[category])) {
      categoryCosts = [...currentCosts[category]];
    } else if (typeof currentCosts[category] === 'number' && currentCosts[category] > 0) {
      // Convert legacy single number to array format
      categoryCosts = [{ description: 'Legacy cost', amount: currentCosts[category] as number, invoice_files: [] }];
    }
    
    const newCostItem: CostItem = {
      description: form.description.trim(),
      amount: form.amount,
      invoice_files: invoiceFiles,
    };

    let newCosts: any = { ...currentCosts };
    
    // Handle editing vs adding
    if (existingCost && existingCostIndex !== undefined) {
      // Replace item at index
      newCosts[category] = categoryCosts.map((item, idx) => 
        idx === existingCostIndex ? newCostItem : item
      );
    } else {
      // Add new cost
      newCosts[category] = [...categoryCosts, newCostItem];
    }
    
    // Ensure all categories are arrays
    if (!Array.isArray(newCosts.labor)) newCosts.labor = typeof newCosts.labor === 'number' ? [{ description: 'Legacy', amount: newCosts.labor, invoice_files: [] }] : [];
    if (!Array.isArray(newCosts.parts)) newCosts.parts = typeof newCosts.parts === 'number' ? [{ description: 'Legacy', amount: newCosts.parts, invoice_files: [] }] : [];
    if (!Array.isArray(newCosts.other)) newCosts.other = typeof newCosts.other === 'number' ? [{ description: 'Legacy', amount: newCosts.other, invoice_files: [] }] : [];
    
    // Calculate total
    const total = getCostTotal(newCosts, 'labor') + getCostTotal(newCosts, 'parts') + getCostTotal(newCosts, 'other');
    newCosts.total = total;
    onSuccess(newCosts);
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50 mb-4">
      <h4 className="font-semibold mb-3">Add {category.charAt(0).toUpperCase() + category.slice(1)} Cost</h4>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="e.g., Oil change, Tire replacement, etc."
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => setForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Files</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            disabled={uploading}
            className="w-full px-3 py-2 border rounded-lg"
          />
          {invoiceFiles.length > 0 && (
            <div className="text-sm text-gray-600 mt-1">
              {invoiceFiles.length} file(s) uploaded
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.description.trim() || form.amount <= 0 || uploading}
            className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {existingCost ? 'Update' : 'Add'} Cost
          </button>
        </div>
      </div>
    </div>
  );
}
