import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';
import { useConfirm } from '@/components/ConfirmProvider';

type Loan = {
  id: string;
  loan_amount: number;
  base_amount?: number | null;
  fees_percent?: number | null;
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
    <div className="space-y-6 pb-24">
      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h5 className="text-sm font-semibold text-blue-900">Total Loaned</h5>
          </div>
          <div className="text-sm font-semibold text-blue-900">
            {summary ? formatCurrency(summary.total_loaned) : '—'}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h5 className="text-sm font-semibold text-green-900">Total Paid</h5>
          </div>
          <div className="text-sm font-semibold text-green-900">
            {summary ? formatCurrency(summary.total_paid) : '—'}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h5 className="text-sm font-semibold text-orange-900">Total Outstanding</h5>
          </div>
          <div className="text-sm font-semibold text-orange-900">
            {summary ? formatCurrency(summary.total_outstanding) : '—'}
          </div>
        </div>
      </div>

      {/* Loans Section */}
      <div className="rounded-xl border bg-white p-4">
        {/* Header with Create Button */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h5 className="text-sm font-semibold text-purple-900">Loans</h5>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="show-closed"
                checked={showClosedLoans}
                onChange={(e) => setShowClosedLoans(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red"
              />
              <label htmlFor="show-closed" className="text-xs font-medium text-gray-700 cursor-pointer">
                Show "Closed" Loans
              </label>
            </div>
            {canEdit && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-2 py-1 text-xs bg-[#d11616] text-white rounded-lg font-medium hover:bg-[#b01414] transition-colors"
              >
                + Create Loan
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 space-y-4">
          <div className="grid grid-cols-12 gap-4 items-end">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Start Date</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">End Date</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              >
                <option value="">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Closed">Closed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div className="col-span-4">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filterAmountMin}
                  onChange={(e) => setFilterAmountMin(e.target.value)}
                  placeholder="Min"
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                />
                <span className="text-xs text-gray-500">-</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filterAmountMax}
                  onChange={(e) => setFilterAmountMax(e.target.value)}
                  placeholder="Max"
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
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
                  className="w-full px-2 py-1 text-xs rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Loans Table */}
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Date</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Amount</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Remaining</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Status</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Created By</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loans ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-xs text-gray-500">
                    <div className="h-6 bg-gray-100 animate-pulse rounded" />
                  </td>
                </tr>
              ) : filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-xs text-gray-500">
                    {loans.length === 0 ? 'No loans found' : 'No loans match the filters'}
                  </td>
                </tr>
              ) : (
                filteredLoans.map((loan) => (
                  <tr key={loan.id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="p-2.5 text-xs text-gray-900">{formatDate(loan.loan_date)}</td>
                    <td className="p-2.5 text-xs font-semibold text-gray-900">{formatCurrency(loan.loan_amount)}</td>
                    <td className="p-2.5 text-xs text-gray-900">{formatCurrency(loan.remaining_balance)}</td>
                    <td className="p-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
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
                    <td className="p-2.5 text-xs text-gray-600">{loan.created_by?.username || '—'}</td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setShowLoanDetail(loan.id)}
                          className="px-2 py-1 text-[10px] font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
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
                              className="px-2 py-1 text-[10px] font-medium rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
                            >
                              + Payment
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
                                className="px-2 py-1 text-[10px] font-medium rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 transition-colors"
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
  const [fees, setFees] = useState('');
  const [agreementDate, setAgreementDate] = useState(formatDateLocal(new Date()));
  const [paymentMethod, setPaymentMethod] = useState('Payroll');
  const [status, setStatus] = useState('Active');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Calculate total loan amount (base + fees)
  const totalLoanAmount = useMemo(() => {
    const baseAmount = parseFloat(loanAmount) || 0;
    const feesPercent = parseFloat(fees) || 0;
    if (baseAmount <= 0) return 0;
    const feesAmount = (baseAmount * feesPercent) / 100;
    return baseAmount + feesAmount;
  }, [loanAmount, fees]);

  const handleSubmit = async () => {
    if (!loanAmount || parseFloat(loanAmount) <= 0) {
      toast.error('Loan amount is required and must be greater than 0');
      return;
    }
    if (totalLoanAmount <= 0) {
      toast.error('Total loan amount must be greater than 0');
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
      // Send the total calculated amount (base + fees) as loan_amount
      // Also send base_amount and fees_percent for tracking
      const baseAmountValue = parseFloat(loanAmount) || 0;
      const feesPercentValue = parseFloat(fees) || 0;
      
      await api('POST', `/employees/${userId}/loans`, {
        loan_amount: totalLoanAmount,
        base_amount: baseAmountValue > 0 ? baseAmountValue : undefined,
        fees_percent: feesPercentValue > 0 ? feesPercentValue : undefined,
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
      <div className="w-[600px] max-w-[95vw] bg-white rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 rounded-t-xl flex items-center justify-between">
          <div className="text-lg font-extrabold">Create Loan</div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl font-bold w-6 h-6 flex items-center justify-center rounded hover:bg-white/10">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Loan Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Fees (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              placeholder="0.00"
            />
            <div className="text-[10px] text-gray-500 mt-1">Interest rate percentage to be added to the loan amount</div>
          </div>
          {loanAmount && parseFloat(loanAmount) > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-xs text-blue-600 font-medium mb-1">Total Loan Amount</div>
              <div className="text-sm font-semibold text-blue-900">
                {formatCurrency(totalLoanAmount)}
              </div>
              <div className="text-[10px] text-blue-700 mt-1">
                Base: {formatCurrency(parseFloat(loanAmount) || 0)} 
                {fees && parseFloat(fees) > 0 && (
                  <> + Fees ({parseFloat(fees) || 0}%): {formatCurrency((parseFloat(loanAmount) || 0) * (parseFloat(fees) || 0) / 100)}</>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Agreement Date *</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              value={agreementDate}
              onChange={(e) => setAgreementDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Method *</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="Payroll">Payroll</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about the loan agreement"
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded bg-gray-200 hover:bg-gray-300"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3 py-1.5 text-xs rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
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
    
    // Ensure loan data is loaded
    if (!loan) {
      toast.error('Loan information is still loading. Please try again.');
      return;
    }

    const paymentValue = parseFloat(paymentAmount);
    const remainingBalance = loan.remaining_balance ?? 0;

    // Check if payment exceeds remaining balance
    if (paymentValue > remainingBalance) {
      // Don't show confirmation if balance is already 0 or negative
      if (remainingBalance <= 0) {
        toast.error('This loan has no remaining balance to pay');
        return;
      }
      
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
      <div className="w-[500px] max-w-[95vw] bg-white rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 rounded-t-xl flex items-center justify-between">
          <div className="text-lg font-extrabold">Add Payment</div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl font-bold w-6 h-6 flex items-center justify-center rounded hover:bg-white/10">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Date *</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="0.00"
            />
            {loan && loan.remaining_balance > 0 && (
              <div className="text-[10px] text-gray-500 mt-1">
                Remaining balance: {formatCurrency(loan.remaining_balance)}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Method *</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="Payroll">Payroll</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded bg-gray-200 hover:bg-gray-300"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3 py-1.5 text-xs rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
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
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">Loan Details</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-lg">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Loan Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Loan Amount</div>
              <div className="text-sm font-semibold text-gray-900 flex items-baseline gap-2 flex-wrap">
                <span>{formatCurrency(loan.loan_amount)}</span>
                {loan.base_amount && loan.fees_percent && loan.fees_percent > 0 && (
                  <span className="text-[10px] font-normal text-gray-500 leading-tight">
                    ({formatCurrency(loan.base_amount)} + {formatCurrency((loan.base_amount * loan.fees_percent) / 100)} Fees ({loan.fees_percent}%))
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Remaining Balance</div>
              <div className="text-sm font-semibold text-gray-900">{formatCurrency(loan.remaining_balance)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Agreement Date</div>
              <div className="text-sm font-semibold text-gray-900">{formatDate(loan.loan_date)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Payment Method</div>
              <div className="text-sm font-semibold text-gray-900">{loan.payment_method || '—'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Status</div>
              <div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
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
              <div className="text-xs font-medium text-gray-600 mb-1.5">Created By</div>
              <div className="text-sm font-semibold text-gray-900">{loan.created_by?.username || '—'}</div>
            </div>
            {loan.notes && (
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-gray-600 mb-1.5">Notes</div>
                <div className="text-xs text-gray-900">{loan.notes}</div>
              </div>
            )}
          </div>

          {/* Actions - Only show if canEdit */}
          {canEdit && loan.status === 'Active' && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                + Add Payment
              </button>
              {loan.remaining_balance <= 0 && (
                <button
                  onClick={handleCloseLoan}
                  className="px-2 py-1 text-xs rounded bg-orange-600 text-white hover:bg-orange-700"
                >
                  Close Loan
                </button>
              )}
            </div>
          )}

          {/* Payments Table */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 mb-2">Payments</h4>
            {loan.payments.length === 0 ? (
              <div className="text-xs text-gray-500">No payments recorded</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-gray-600">Date</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-600">Amount</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-600">Method</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-600">Balance After</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-600">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loan.payments.map((payment) => (
                      <tr key={payment.id} className="border-t border-gray-200">
                        <td className="p-2 text-xs text-gray-900">{formatDate(payment.payment_date)}</td>
                        <td className="p-2 text-xs font-semibold text-gray-900">{formatCurrency(payment.payment_amount)}</td>
                        <td className="p-2 text-xs text-gray-900">{payment.payment_method || '—'}</td>
                        <td className="p-2 text-xs text-gray-900">{formatCurrency(payment.balance_after)}</td>
                        <td className="p-2 text-xs text-gray-600">{payment.created_by?.username || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* History/Activities */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 mb-2">History / Activities</h4>
            <div className="space-y-2">
              {activities.map((activity, idx) => (
                <div key={idx} className="text-xs border-l-2 border-gray-200 pl-3 py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{activity.description}</span>
                    {activity.user && (
                      <span className="text-gray-500">by {activity.user}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">{formatDate(activity.date)}</div>
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

