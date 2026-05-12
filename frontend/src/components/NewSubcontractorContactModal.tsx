import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName?: string | null;
  onCreated?: () => void;
};

export default function NewSubcontractorContactModal({ open, onClose, companyId, companyName, onCreated }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [primary, setPrimary] = useState('false');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [nameError, setNameError] = useState(false);

  const handleClose = useCallback(() => {
    setIsCreating(false);
    setNameError(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setPhone('');
      setPrimary('false');
      setRole('');
      setDept('');
      setNameError(false);
    }
  }, [open, companyId]);

  const formatPhone = (v: string) => {
    const d = String(v || '')
      .replace(/\D+/g, '')
      .slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  };

  if (!open || !companyId) return null;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
        role="presentation"
        onClick={handleClose}
      >
        <div
          className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
          role="dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">New contact</div>
                {companyName && <div className="text-xs text-gray-500 mt-0.5">{companyName}</div>}
              </div>
              <button type="button" onClick={handleClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Close">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            <div className="rounded-xl border bg-white p-4 grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                  Name <span className="text-red-600">*</span>
                </label>
                <input
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${nameError && !name.trim() ? 'border-red-500' : 'border-gray-200'}`}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(false);
                  }}
                />
                {nameError && !name.trim() && <div className="text-[11px] text-red-600 mt-1">Required</div>}
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Role / title</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Department</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={dept} onChange={(e) => setDept(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Phone</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Primary</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={primary} onChange={(e) => setPrimary(e.target.value)}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
            <button type="button" onClick={handleClose} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-700">
              Cancel
            </button>
            <button
              type="button"
              disabled={isCreating}
              onClick={async () => {
                if (!name.trim()) {
                  setNameError(true);
                  toast.error('Name is required');
                  return;
                }
                try {
                  setIsCreating(true);
                  await api('POST', `/subcontractors/companies/${companyId}/contacts`, {
                    name: name.trim(),
                    email: email.trim() || undefined,
                    phone: phone.trim() || undefined,
                    role_title: role.trim() || undefined,
                    department: dept.trim() || undefined,
                    is_primary: primary === 'true',
                  });
                  toast.success('Contact created');
                  onCreated?.();
                  handleClose();
                } catch {
                  toast.error('Failed to create contact');
                } finally {
                  setIsCreating(false);
                }
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-red text-white hover:bg-[#c41e1e] disabled:opacity-50"
            >
              {isCreating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
