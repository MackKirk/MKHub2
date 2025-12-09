import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';
import { useConfirm } from '@/components/ConfirmProvider';

type Loan = {
  id: string;
  loan_amount: number;
  remaining_balance: number;
  weekly_payment: number;
  loan_date: string;
  payment_method?: string;
  status: string;
  description?: string;
  notes?: string;
  created_by: { id: string; username?: string };
  created_at: string;
  updated_at?: string;
  paid_off_at?: string;
  payments_count: number;
};

type LoanSummary = {
  total_loaned: number;
  total_paid: number;
  total_outstanding: number;
};

type LoanDetail = Loan & {
  payments: Array<{
    id: string;
    payment_amount: number;
    payment_date: string;
    payment_method?: string;
    balance_after: number;
    notes?: string;
    created_by: { id: string; username?: string };
    created_at: string;
  }>;
  updated_by?: { id: string; username?: string };
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function UserLoans({ userId, canEdit = true }: { userId: string; canEdit?: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLoanDetail, setShowLoanDetail] = useState<string | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  
  // Filters
  const [showClosedLoans, setShowClosedLoans] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterAmountMin, setFilterAmountMin] = useState<string>('');
  const [filterAmountMax, setFilterAmountMax] = useState<string>('');

  const { data: summary } = useQuery<LoanSummary>({
    queryKey: ['loans-summary', userId],
    queryFn: () => api<LoanSummary>('GET', `/employees/${userId}/loans/summary`),
  });

  const { data: loans, refetch: refetchLoans } = useQuery<Loan[]>({
    queryKey: ['loans', userId],
    queryFn: () => api<Loan[]>('GET', `/employees/${userId}/loans`),
  });

  // Filter loans
  const filteredLoans = useMemo(() => {
    if (!loans) return [];
    
    return loans.filter((loan) => {
      // Filter by closed status
      if (!showClosedLoans && loan.status === 'Closed') {
        return false;
      }
      
      // Filter by status
      if (filterStatus && loan.status !== filterStatus) {
        return false;
      }
      
      // Filter by date range
      if (filterDateFrom || filterDateTo) {
        const loanDate = new Date(loan.loan_date);
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (loanDate < fromDate) return false;
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (loanDate > toDate) return false;
        }
      }
      
      // Filter by amount range
      if (filterAmountMin) {
        const minAmount = parseFloat(filterAmountMin);
        if (isNaN(minAmount) || loan.loan_amount < minAmount) return false;
      }
      if (filterAmountMax) {
        const maxAmount = parseFloat(filterAmountMax);
        if (isNaN(maxAmount) || loan.loan_amount > maxAmount) return false;
      }
      
      return true;
    });
  }, [loans, showClosedLoans, filterStatus, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax]);

  const { data: loanDetail } = useQuery<LoanDetail>({
    queryKey: ['loan-detail', userId, showLoanDetail],
    queryFn: () => api<LoanDetail>('GET', `/employees/${userId}/loans/${showLoanDetail}`),
    enabled: !!showLoanDetail,
  });

  const handleCloseLoan = async (loanId: string) => {
    try {
      await api('PATCH', `/employees/${userId}/loans/${loanId}/close`);
      toast.success('Loan closed');
      await refetchLoans();
      if (showLoanDetail === loanId) {
        queryClient.invalidateQueries({ queryKey: ['loan-detail', userId, loanId] });
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to close loan');
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-600 font-medium">Total Loaned</div>
          <div className="text-2xl font-bold text-blue-900">
            {summary ? formatCurrency(summary.total_loaned) : '-'}
          </div>
        </div>
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm text-green-600 font-medium">Total Paid</div>
          <div className="text-2xl font-bold text-green-900">
            {summary ? formatCurrency(summary.total_paid) : '-'}
          </div>
        </div>
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="text-sm text-orange-600 font-medium">Total Outstanding</div>
          <div className="text-2xl font-bold text-orange-900">
            {summary ? formatCurrency(summary.total_outstanding) : '-'}
          </div>
        </div>
      </div>

      {/* Header with Create Button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Loans</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show-closed"
              checked={showClosedLoans}
              onChange={(e) => setShowClosedLoans(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
            />
            <label htmlFor="show-closed" className="text-sm font-medium text-gray-700 cursor-pointer">
              Show "Closed" Loans
            </label>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-[#d11616] text-white rounded-lg font-semibold hover:bg-[#b01414] transition-colors"
            >
              + Create Loan
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="grid grid-cols-12 gap-4 items-end">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div className="col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount Range</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={filterAmountMin}
                onChange={(e) => setFilterAmountMin(e.target.value)}
                placeholder="Min"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="text-gray-500">-</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={filterAmountMax}
                onChange={(e) => setFilterAmountMax(e.target.value)}
                placeholder="Max"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          {(filterStatus || filterDateFrom || filterDateTo || filterAmountMin || filterAmountMax) && (
            <div className="col-span-2">
              <button
                onClick={() => {
                  setFilterStatus('');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                  setFilterAmountMin('');
                  setFilterAmountMax('');
                }}
                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Loans Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left font-semibold text-gray-700">Date</th>
              <th className="p-3 text-left font-semibold text-gray-700">Amount</th>
              <th className="p-3 text-left font-semibold text-gray-700">Remaining</th>
              <th className="p-3 text-left font-semibold text-gray-700">Status</th>
              <th className="p-3 text-left font-semibold text-gray-700">Created By</th>
              <th className="p-3 text-left font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loans ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  <div className="h-6 bg-gray-100 animate-pulse rounded" />
                </td>
              </tr>
            ) : filteredLoans.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  {loans.length === 0 ? 'No loans found' : 'No loans match the filters'}
                </td>
              </tr>
            ) : (
              filteredLoans.map((loan) => (
                <tr key={loan.id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors">
                  <td className="p-3 text-gray-900">{formatDate(loan.loan_date)}</td>
                  <td className="p-3 font-medium text-gray-900">{formatCurrency(loan.loan_amount)}</td>
                  <td className="p-3 text-gray-900">{formatCurrency(loan.remaining_balance)}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        loan.status === 'Active'
                          ? 'bg-green-100 text-green-800'
                          : loan.status === 'Closed'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {loan.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600">{loan.created_by?.username || '-'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowLoanDetail(loan.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                      >
                        View
                      </button>
                      {canEdit && loan.status === 'Active' && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedLoanId(loan.id);
                              setShowPaymentModal(true);
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
                          >
                            + Add Payment
                          </button>
                          {loan.remaining_balance <= 0 && (
                            <button
                              onClick={async () => {
                                const result = await confirm({
                                  message: 'Are you sure you want to close this loan?',
                                  title: 'Close Loan',
                                });
                                if (result === 'confirm') {
                                  await handleCloseLoan(loan.id);
                                }
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 transition-colors"
                            >
                              Close
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Loan Modal */}
      {showCreateModal && (
        <CreateLoanModal
          userId={userId}
          onClose={() => {
            setShowCreateModal(false);
            refetchLoans();
            queryClient.invalidateQueries({ queryKey: ['loans-summary', userId] });
          }}
        />
      )}

      {/* Add Payment Modal */}
      {showPaymentModal && selectedLoanId && (
        <AddPaymentModal
          userId={userId}
          loanId={selectedLoanId}
          onClose={async () => {
            setShowPaymentModal(false);
            setSelectedLoanId(null);
            await refetchLoans();
            queryClient.invalidateQueries({ queryKey: ['loans-summary', userId] });
            if (showLoanDetail === selectedLoanId) {
              queryClient.invalidateQueries({ queryKey: ['loan-detail', userId, selectedLoanId] });
            }
          }}
        />
      )}

      {/* Loan Detail View */}
      {showLoanDetail && loanDetail && (
        <LoanDetailView
          userId={userId}
          loanId={showLoanDetail}
          canEdit={canEdit}
          onClose={() => setShowLoanDetail(null)}
          onPaymentAdded={async () => {
            await refetchLoans();
            queryClient.invalidateQueries({ queryKey: ['loan-detail', userId, showLoanDetail] });
            queryClient.invalidateQueries({ queryKey: ['loans-summary', userId] });
          }}
          onLoanClosed={async () => {
            await refetchLoans();
            queryClient.invalidateQueries({ queryKey: ['loan-detail', userId, showLoanDetail] });
            queryClient.invalidateQueries({ queryKey: ['loans-summary', userId] });
          }}
        />
      )}
    </div>
  );
}

function CreateLoanModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [loanAmount, setLoanAmount] = useState('');
  const [agreementDate, setAgreementDate] = useState(formatDateLocal(new Date()));
  const [paymentMethod, setPaymentMethod] = useState('Payroll');
  const [status, setStatus] = useState('Active');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!loanAmount || parseFloat(loanAmount) <= 0) {
      toast.error('Loan amount is required and must be greater than 0');
      return;
    }
    if (!agreementDate) {
      toast.error('Agreement date is required');
      return;
    }
    if (!paymentMethod) {
      toast.error('Payment method is required');
      return;
    }

    setSaving(true);
    try {
      await api('POST', `/employees/${userId}/loans`, {
        loan_amount: parseFloat(loanAmount),
        loan_date: agreementDate,
        agreement_date: agreementDate,
        payment_method: paymentMethod,
        status: status,
        weekly_payment: 0, // Optional field
        notes: notes || undefined,
      });
      toast.success('Loan created');
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to create loan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[600px] max-w-[95vw] bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold">Create Loan</div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Loan Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full border rounded px-3 py-2"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Agreement Date *</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              value={agreementDate}
              onChange={(e) => setAgreementDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Method *</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="Payroll">Payroll</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about the loan agreement"
            />
          </div>
        </div>
        <div className="p-4 flex items-center justify-end gap-2 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Loan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPaymentModal({
  userId,
  loanId,
  onClose,
}: {
  userId: string;
  loanId: string;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [paymentDate, setPaymentDate] = useState(formatDateLocal(new Date()));
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Payroll');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch loan details to get remaining balance
  const { data: loan } = useQuery<LoanDetail>({
    queryKey: ['loan-detail', userId, loanId],
    queryFn: () => api<LoanDetail>('GET', `/employees/${userId}/loans/${loanId}`),
    enabled: !!loanId,
  });

  const handleSubmit = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Payment amount is required and must be greater than 0');
      return;
    }
    if (!paymentDate) {
      toast.error('Payment date is required');
      return;
    }
    if (!paymentMethod) {
      toast.error('Payment method is required');
      return;
    }

    const paymentValue = parseFloat(paymentAmount);
    const remainingBalance = loan?.remaining_balance || 0;

    // Check if payment exceeds remaining balance
    if (paymentValue > remainingBalance && remainingBalance > 0) {
      const adjustResult = await confirm({
        message: `The payment amount (${formatCurrency(paymentValue)}) is greater than the remaining balance (${formatCurrency(remainingBalance)}). The payment will be adjusted to ${formatCurrency(remainingBalance)}. Do you want to continue?`,
        title: 'Payment Exceeds Balance',
        confirmText: 'Yes, Adjust Payment',
        cancelText: 'Cancel',
      });
      
      if (adjustResult !== 'confirm') {
        return; // User cancelled
      }
    }

    setSaving(true);
    try {
      // Use the adjusted amount if payment exceeds balance
      const finalPaymentAmount = paymentValue > remainingBalance ? remainingBalance : paymentValue;
      
      const result = await api<{ remaining_balance: number; should_close: boolean }>(
        'POST',
        `/employees/${userId}/loans/${loanId}/payments`,
        {
          payment_amount: finalPaymentAmount,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          origin: paymentMethod, // Support both field names
          notes: notes || undefined,
        }
      );

      toast.success('Payment added');
      
      // If balance reached 0, ask user if they want to close the loan
      if (result.should_close) {
        const closeResult = await confirm({
          message: 'The balance of this loan has reached $0.00. Would you like to change the status to "Closed"?',
          title: 'Close Loan?',
          confirmText: 'Yes, Close',
          cancelText: 'No, Keep Open',
        });
        
        if (closeResult === 'confirm') {
          try {
            await api('PATCH', `/employees/${userId}/loans/${loanId}/close`);
            toast.success('Loan closed');
          } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'Failed to close loan');
          }
        }
      }
      
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to add payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[500px] max-w-[95vw] bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold">Add Payment</div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Payment Date *</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full border rounded px-3 py-2"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="0.00"
            />
            {loan && loan.remaining_balance > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                Remaining balance: {formatCurrency(loan.remaining_balance)}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Method *</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="Payroll">Payroll</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div className="p-4 flex items-center justify-end gap-2 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoanDetailView({
  userId,
  loanId,
  canEdit,
  onClose,
  onPaymentAdded,
  onLoanClosed,
}: {
  userId: string;
  loanId: string;
  canEdit: boolean;
  onClose: () => void;
  onPaymentAdded: () => void;
  onLoanClosed: () => void;
}) {
  const confirm = useConfirm();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  // Fetch loan details to ensure we have the latest data including payments
  const { data: loan } = useQuery<LoanDetail>({
    queryKey: ['loan-detail', userId, loanId],
    queryFn: () => api<LoanDetail>('GET', `/employees/${userId}/loans/${loanId}`),
  });
  
  if (!loan) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-[800px] max-w-[95vw] max-h-[90vh] bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b font-semibold flex items-center justify-between">
            <span>Loan Details</span>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-center py-8 text-gray-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const handleCloseLoan = async () => {
    const result = await confirm({
      message: 'Are you sure you want to close this loan?',
      title: 'Close Loan',
    });
    if (result === 'confirm') {
      try {
        await api('PATCH', `/employees/${userId}/loans/${loanId}/close`);
        toast.success('Loan closed');
        await onLoanClosed();
      } catch (e: any) {
        toast.error(e?.response?.data?.detail || 'Failed to close loan');
      }
    }
  };

  // Build history/activities
  const activities: Array<{ type: string; date: string; user?: string; description: string }> = [];
  
  // Loan creation
  activities.push({
    type: 'created',
    date: loan.created_at,
    user: loan.created_by?.username,
    description: `Loan created for ${formatCurrency(loan.loan_amount)}`,
  });

  // Status changes
  if (loan.updated_at && loan.updated_by) {
    activities.push({
      type: 'updated',
      date: loan.updated_at,
      user: loan.updated_by.username,
      description: `Loan status updated to ${loan.status}`,
    });
  }

  if (loan.paid_off_at) {
    activities.push({
      type: 'closed',
      date: loan.paid_off_at,
      description: 'Loan closed',
    });
  }

  // Payments
  loan.payments.forEach((payment) => {
    activities.push({
      type: 'payment',
      date: payment.created_at,
      user: payment.created_by?.username,
      description: `Payment of ${formatCurrency(payment.payment_amount)} recorded (${payment.payment_method || 'N/A'})`,
    });
  });

  // Sort by date (newest first)
  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[800px] max-w-[95vw] max-h-[90vh] bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b font-semibold flex items-center justify-between">
          <span>Loan Details</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Loan Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Loan Amount</div>
              <div className="font-semibold text-lg">{formatCurrency(loan.loan_amount)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Remaining Balance</div>
              <div className="font-semibold text-lg">{formatCurrency(loan.remaining_balance)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Agreement Date</div>
              <div>{formatDate(loan.loan_date)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Payment Method</div>
              <div>{loan.payment_method || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Status</div>
              <div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    loan.status === 'Active'
                      ? 'bg-green-100 text-green-800'
                      : loan.status === 'Closed'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {loan.status}
                </span>
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Created By</div>
              <div>{loan.created_by?.username || '-'}</div>
            </div>
            {loan.notes && (
              <div className="md:col-span-2">
                <div className="text-sm text-gray-600">Notes</div>
                <div className="text-sm">{loan.notes}</div>
              </div>
            )}
          </div>

          {/* Actions - Only show if canEdit */}
          {canEdit && loan.status === 'Active' && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                + Add Payment
              </button>
              {loan.remaining_balance <= 0 && (
                <button
                  onClick={handleCloseLoan}
                  className="px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700"
                >
                  Close Loan
                </button>
              )}
            </div>
          )}

          {/* Payments Table */}
          <div>
            <h4 className="font-semibold mb-2">Payments</h4>
            {loan.payments.length === 0 ? (
              <div className="text-sm text-gray-500">No payments recorded</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Amount</th>
                      <th className="p-2 text-left">Method</th>
                      <th className="p-2 text-left">Balance After</th>
                      <th className="p-2 text-left">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loan.payments.map((payment) => (
                      <tr key={payment.id} className="border-t">
                        <td className="p-2">{formatDate(payment.payment_date)}</td>
                        <td className="p-2 font-medium">{formatCurrency(payment.payment_amount)}</td>
                        <td className="p-2">{payment.payment_method || '-'}</td>
                        <td className="p-2">{formatCurrency(payment.balance_after)}</td>
                        <td className="p-2 text-gray-600">{payment.created_by?.username || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* History/Activities */}
          <div>
            <h4 className="font-semibold mb-2">History / Activities</h4>
            <div className="space-y-2">
              {activities.map((activity, idx) => (
                <div key={idx} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{activity.description}</span>
                    {activity.user && (
                      <span className="text-gray-500">by {activity.user}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{formatDate(activity.date)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <AddPaymentModal
          userId={userId}
          loanId={loanId}
          onClose={async () => {
            setShowPaymentModal(false);
            await onPaymentAdded();
          }}
        />
      )}
    </div>
  );
}

