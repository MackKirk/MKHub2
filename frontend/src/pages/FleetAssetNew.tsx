import { useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function FleetAssetNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const assetType = searchParams.get('type') || 'vehicle';
  
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
  });
  const divisions = Array.isArray(settings?.divisions) ? settings.divisions : [];

  const [form, setForm] = useState({
    asset_type: assetType,
    name: '',
    vin: '',
    model: '',
    year: '',
    division_id: '',
    odometer_current: '',
    odometer_last_service: '',
    hours_current: '',
    hours_last_service: '',
    status: 'active',
    notes: '',
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const uploadFile = async (file: File): Promise<string> => {
    const name = file.name;
    const type = file.type || 'image/jpeg';
    const up: any = await api('POST', '/files/upload', {
      original_name: name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: 'fleet-asset-photos',
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
      setPhotos(prev => {
        const updated = [...prev, ...uploadedIds];
        console.log('Photos updated:', updated); // Debug
        return updated;
      });
      toast.success(`Uploaded ${uploadedIds.length} photo(s)`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        asset_type: form.asset_type,
        name: form.name.trim(),
        vin: form.vin.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? parseInt(form.year) : null,
        division_id: form.division_id || null,
        odometer_current: form.odometer_current ? parseInt(form.odometer_current) : null,
        odometer_last_service: form.odometer_last_service ? parseInt(form.odometer_last_service) : null,
        hours_current: form.hours_current ? parseFloat(form.hours_current) : null,
        hours_last_service: form.hours_last_service ? parseFloat(form.hours_last_service) : null,
        status: form.status,
        notes: form.notes.trim() || null,
        photos: photos.length > 0 ? photos : null,
      };
      return api('POST', '/fleet/assets', payload);
    },
    onSuccess: (data: any) => {
      toast.success('Asset created successfully');
      nav(`/fleet/assets/${data.id}`);
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to create asset';
      toast.error(message);
    },
  });

  const canSubmit = form.name.trim().length > 0 && !uploading;

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div className="flex items-center justify-between flex-1">
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">New {assetType.replace('_', ' ')}</div>
            <div className="text-sm text-gray-500 font-medium">Create a new fleet asset</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
              <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
            </div>
            <button
              onClick={() => nav(-1)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700"
            >
              ← Cancel
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) {
              createMutation.mutate();
            }
          }}
          className="space-y-6"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Asset Type
              </label>
              <select
                value={form.asset_type}
                onChange={(e) => updateField('asset_type', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="vehicle">Vehicle</option>
                <option value="heavy_machinery">Heavy Machinery</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                VIN/Serial Number
              </label>
              <input
                type="text"
                value={form.vin}
                onChange={(e) => updateField('vin', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model
              </label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => updateField('model', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year
              </label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => updateField('year', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                min="1900"
                max={new Date().getFullYear() + 1}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Division
              </label>
              <select
                value={form.division_id}
                onChange={(e) => updateField('division_id', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="">None</option>
                {Array.isArray(divisions) && divisions.map((div: any) => (
                  <option key={div.id} value={div.id}>
                    {div.label || div.value}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
              </select>
            </div>

            {(form.asset_type === 'vehicle' || form.asset_type === 'heavy_machinery') && (
              <>
                {form.asset_type === 'vehicle' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Odometer
                      </label>
                      <input
                        type="number"
                        value={form.odometer_current}
                        onChange={(e) => updateField('odometer_current', e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                        min="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Service Odometer
                      </label>
                      <input
                        type="number"
                        value={form.odometer_last_service}
                        onChange={(e) => updateField('odometer_last_service', e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                        min="0"
                      />
                    </div>
                  </>
                )}
                
                {form.asset_type === 'heavy_machinery' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Hours
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={form.hours_current}
                        onChange={(e) => updateField('hours_current', e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                        min="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Service Hours
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={form.hours_last_service}
                        onChange={(e) => updateField('hours_last_service', e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                        min="0"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {form.asset_type === 'other' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Hours
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.hours_current}
                    onChange={(e) => updateField('hours_current', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Service Hours
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.hours_last_service}
                    onChange={(e) => updateField('hours_last_service', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                    min="0"
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photos
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
            />
            {photos.length > 0 && (
              <div className="mt-2">
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((photoId, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={`/files/${photoId}/thumbnail?w=200`}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-24 object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPhotos(prev => prev.filter((_, i) => i !== idx));
                        }}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-600 mt-2">{photos.length} photo(s) uploaded</p>
              </div>
            )}
            {photos.length === 0 && !uploading && (
              <p className="text-sm text-gray-500 mt-1">You can add photos now or later</p>
            )}
            {uploading && (
              <p className="text-sm text-blue-600 mt-1">Uploading photos...</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => nav(-1)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || createMutation.isPending}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

