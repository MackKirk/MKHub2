import { useState } from 'react';
import { api } from '@/lib/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';

type InviteModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Division = { id: string; label: string; value?: string };

export default function InviteUserModal({ isOpen, onClose }: InviteModalProps) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api<any>('GET', '/settings') });
  const { data: usersOptions } = useQuery({ queryKey: ['usersOptions'], queryFn: () => api<any[]>('GET', '/auth/users/options?limit=500') });
  const divisions: Division[] = (settings?.divisions || []) as Division[];
  const employmentTypes = (settings?.employment_types || []) as any[];
  
  const [email, setEmail] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [needsBusinessCard, setNeedsBusinessCard] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [needsVehicle, setNeedsVehicle] = useState(false);
  const [needsEquipment, setNeedsEquipment] = useState(false);
  const [equipmentList, setEquipmentList] = useState('');
  // Job fields
  const [hireDate, setHireDate] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [managerUserId, setManagerUserId] = useState('');
  const [payRate, setPayRate] = useState('');
  const [payType, setPayType] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const selectedDivision = divisions.find(d => d.id === divisionId);
      await api('POST', '/auth/invite', {
        email_personal: email,
        division_id: divisionId || null,
        division_name: selectedDivision?.label || null,
        document_ids: documentIds.length > 0 ? documentIds : null,
        needs_email: needsEmail,
        needs_business_card: needsBusinessCard,
        needs_phone: needsPhone,
        needs_vehicle: needsVehicle,
        needs_equipment: needsEquipment,
        equipment_list: needsEquipment && equipmentList ? equipmentList : null,
        // Job information
        hire_date: hireDate || null,
        job_title: jobTitle || null,
        work_email: workEmail || null,
        work_phone: workPhone || null,
        manager_user_id: managerUserId || null,
        pay_rate: payRate || null,
        pay_type: payType || null,
        employment_type: employmentType || null,
      });
      
      // Reset form
      setEmail('');
      setDivisionId('');
      setDocumentIds([]);
      setNeedsEmail(false);
      setNeedsBusinessCard(false);
      setNeedsPhone(false);
      setNeedsVehicle(false);
      setNeedsEquipment(false);
      setEquipmentList('');
      setHireDate('');
      setJobTitle('');
      setWorkEmail('');
      setWorkPhone('');
      setManagerUserId('');
      setPayRate('');
      setPayType('');
      setEmploymentType('');
      
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Invite New User</h2>
          <p className="text-sm text-gray-600 mt-1">Send an invitation to a new employee</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Division *
            </label>
            <select
              required
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
            >
              <option value="">Select a division...</option>
              {divisions.map((div) => (
                <option key={div.id} value={div.id}>
                  {div.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Documents to Sign (optional)
            </label>
            <input
              type="text"
              value={documentIds.join(', ')}
              onChange={(e) => setDocumentIds(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
              placeholder="Comma-separated document IDs"
            />
            <p className="text-xs text-gray-500 mt-1">Enter document IDs separated by commas</p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Information</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hire Date (optional)
                </label>
                <input
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title (optional)
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                  placeholder="e.g., Software Engineer"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Email (optional)
                </label>
                <input
                  type="email"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                  placeholder="work@company.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Phone (optional)
                </label>
                <input
                  type="tel"
                  value={workPhone}
                  onChange={(e) => setWorkPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Manager (optional)
                </label>
                <select
                  value={managerUserId}
                  onChange={(e) => setManagerUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                >
                  <option value="">Select a manager...</option>
                  {(usersOptions || []).map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.username}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employment Type (optional)
                </label>
                {employmentTypes.length > 0 ? (
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                  >
                    <option value="">Select type...</option>
                    {employmentTypes.map((et: any) => (
                      <option key={et.id} value={et.label}>
                        {et.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                    placeholder="e.g., full-time, part-time"
                  />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pay Rate (optional)
                </label>
                <input
                  type="text"
                  value={payRate}
                  onChange={(e) => setPayRate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                  placeholder="e.g., $50/hour or $100,000/year"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pay Type (optional)
                </label>
                <select
                  value={payType}
                  onChange={(e) => setPayType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616]"
                >
                  <option value="">Select type...</option>
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="contract">Contract</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Onboarding Requirements</h3>
            
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={needsEmail}
                  onChange={(e) => setNeedsEmail(e.target.checked)}
                  className="w-4 h-4 text-[#d11616] border-gray-300 rounded focus:ring-[#d11616]"
                />
                <span className="ml-2 text-sm text-gray-700">This user will need an email account</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={needsBusinessCard}
                  onChange={(e) => setNeedsBusinessCard(e.target.checked)}
                  className="w-4 h-4 text-[#d11616] border-gray-300 rounded focus:ring-[#d11616]"
                />
                <span className="ml-2 text-sm text-gray-700">This user will need business cards</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={needsPhone}
                  onChange={(e) => setNeedsPhone(e.target.checked)}
                  className="w-4 h-4 text-[#d11616] border-gray-300 rounded focus:ring-[#d11616]"
                />
                <span className="ml-2 text-sm text-gray-700">This user will need a phone</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={needsVehicle}
                  onChange={(e) => setNeedsVehicle(e.target.checked)}
                  className="w-4 h-4 text-[#d11616] border-gray-300 rounded focus:ring-[#d11616]"
                />
                <span className="ml-2 text-sm text-gray-700">This user will receive a vehicle</span>
              </label>

              <div>
                <label className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    checked={needsEquipment}
                    onChange={(e) => setNeedsEquipment(e.target.checked)}
                    className="w-4 h-4 text-[#d11616] border-gray-300 rounded focus:ring-[#d11616]"
                  />
                  <span className="ml-2 text-sm text-gray-700">This user will need equipment or tools</span>
                </label>
                {needsEquipment && (
                  <textarea
                    value={equipmentList}
                    onChange={(e) => setEquipmentList(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#d11616] mt-2"
                    placeholder="Please list the equipment/tools needed..."
                    rows={3}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#d11616]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#d11616] to-[#ee2b2b] rounded-md hover:from-[#a90f0f] hover:to-[#d11616] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#d11616] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

