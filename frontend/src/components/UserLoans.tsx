import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  employeeLoanCreateQuickInfo,
  employeeLoanDetailQuickInfo,
  employeeLoanPaymentQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppControlLabelRow,
  AppDatePicker,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTextarea,
  appSectionPresetProps,
  resolveAppSortableListPreset,
  sortListByAppColumn,
  uiBorders,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
} from '@/components/ui';

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

const LOAN_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'Active', label: 'Active' },
  { value: 'Closed', label: 'Closed' },
  { value: 'Cancelled', label: 'Cancelled' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'Payroll', label: 'Payroll' },
  { value: 'Manual', label: 'Manual' },
];

const LOAN_STATUS_FORM_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Closed', label: 'Closed' },
  { value: 'Cancelled', label: 'Cancelled' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function loanStatusVariant(status: string): 'success' | 'neutral' | 'danger' {
  if (status === 'Active') return 'success';
  if (status === 'Closed') return 'neutral';
  return 'danger';
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className={uiCx(
        'grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-2.5',
      )}
    >
      <dt className={uiTypography.helper}>{label}</dt>
      <dd className={uiCx(uiTypography.body, 'min-w-0 break-words font-medium text-gray-900')}>{children}</dd>
    </div>
  );
}

export default function UserLoans({ userId, canEdit = true }: { userId: string; canEdit?: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLoanDetail, setShowLoanDetail] = useState<string | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  const [showClosedLoans, setShowClosedLoans] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterAmountMin, setFilterAmountMin] = useState('');
  const [filterAmountMax, setFilterAmountMax] = useState('');

  const { data: summary } = useQuery<LoanSummary>({
    queryKey: ['loans-summary', userId],
    queryFn: () => api<LoanSummary>('GET', `/employees/${userId}/loans/summary`),
  });

  const { data: loans, refetch: refetchLoans } = useQuery<Loan[]>({
    queryKey: ['loans', userId],
    queryFn: () => api<Loan[]>('GET', `/employees/${userId}/loans`),
  });

  const filteredLoans = useMemo(() => {
    if (!loans) return [];

    return loans.filter((loan) => {
      if (!showClosedLoans && loan.status === 'Closed') return false;
      if (filterStatus && loan.status !== filterStatus) return false;

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

      if (filterAmountMin) {
        const minAmount = parseFloat(filterAmountMin);
        if (Number.isNaN(minAmount) || loan.loan_amount < minAmount) return false;
      }
      if (filterAmountMax) {
        const maxAmount = parseFloat(filterAmountMax);
        if (Number.isNaN(maxAmount) || loan.loan_amount > maxAmount) return false;
      }

      return true;
    });
  }, [loans, showClosedLoans, filterStatus, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax]);

  type LoanSortColumn = 'date' | 'amount' | 'remaining' | 'status' | 'createdBy';
  const { sortBy, sortDir, setSort } = useLocalAppListSort<LoanSortColumn>('date', 'desc');

  const sortedFilteredLoans = useMemo(
    () =>
      sortListByAppColumn(filteredLoans, sortBy, sortDir, {
        date: (loan) => (loan.loan_date ? Date.parse(loan.loan_date) : null),
        amount: (loan) => loan.loan_amount,
        remaining: (loan) => loan.remaining_balance,
        status: (loan) => loan.status,
        createdBy: (loan) => loan.created_by?.username || '',
      }),
    [filteredLoans, sortBy, sortDir],
  );

  const hasActiveFilters =
    Boolean(filterStatus || filterDateFrom || filterDateTo || filterAmountMin || filterAmountMax);

  const clearFilters = () => {
    setFilterStatus('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterAmountMin('');
    setFilterAmountMax('');
  };

  const handleCloseLoan = async (loanId: string) => {
    try {
      await api('PATCH', `/employees/${userId}/loans/${loanId}/close`);
      toast.success('Loan closed');
      await refetchLoans();
      queryClient.invalidateQueries({ queryKey: ['loans-summary', userId] });
      if (showLoanDetail === loanId) {
        queryClient.invalidateQueries({ queryKey: ['loan-detail', userId, loanId] });
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to close loan');
    }
  };

  const summaryCards = [
    {
      title: 'Total loaned',
      description: 'Sum of all loan amounts issued to this employee.',
      value: summary ? formatCurrency(summary.total_loaned) : '—',
      preset: 'billing' as const,
    },
    {
      title: 'Total paid',
      description: 'Total repayments collected across all loans.',
      value: summary ? formatCurrency(summary.total_paid) : '—',
      preset: 'pricing' as const,
    },
    {
      title: 'Outstanding',
      description: 'Remaining balance still owed on active loans.',
      value: summary ? formatCurrency(summary.total_outstanding) : '—',
      preset: 'billing' as const,
    },
  ];

  return (
    <div className="space-y-6 pb-24">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <AppCard key={card.title} bodyClassName={uiSpacing.cardPadding}>
            <AppSectionHeader
              title={card.title}
              description={card.description}
              {...appSectionPresetProps(card.preset)}
            />
            <p className="mt-3 text-lg font-semibold text-gray-900">{card.value}</p>
          </AppCard>
        ))}
      </div>

      <AppCard>
        <AppSectionHeader
          title="Loans"
          description="Employee loan agreements, repayments, and outstanding balances."
          {...appSectionPresetProps('billing')}
        />

        <div className="mt-4 space-y-4">
          <AppCheckbox
            label='Show "Closed" loans'
            checked={showClosedLoans}
            onChange={setShowClosedLoans}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-2">
              <AppDatePicker
                label="Start date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div className="lg:col-span-2">
              <AppDatePicker
                label="End date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
            <div className="lg:col-span-2">
              <AppSelect
                label="Status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                placeholder="All statuses"
                options={LOAN_STATUS_OPTIONS}
              />
            </div>
            <div className="lg:col-span-4">
              <div className="block space-y-1.5">
                <AppControlLabelRow label="Amount range" />
                <div className="flex items-center gap-2">
                  <AppInput
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Min"
                    value={filterAmountMin}
                    onChange={(e) => setFilterAmountMin(e.target.value)}
                    className="min-w-0 flex-1 !space-y-0"
                  />
                  <span className={uiTypography.helper}>–</span>
                  <AppInput
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Max"
                    value={filterAmountMax}
                    onChange={(e) => setFilterAmountMax(e.target.value)}
                    className="min-w-0 flex-1 !space-y-0"
                  />
                </div>
              </div>
            </div>
            {hasActiveFilters ? (
              <div className="flex items-end lg:col-span-2">
                <AppButton type="button" variant="secondary" size="sm" className="w-full" onClick={clearFilters}>
                  Clear filters
                </AppButton>
              </div>
            ) : null}
          </div>

          <div className={uiCx('rounded-xl border bg-white', uiSpacing.cardPadding)}>
            <p className={uiCx(uiTypography.helper, 'mb-3')}>Click a row to view loan details and payment history.</p>
            <div className="flex flex-col gap-2 overflow-x-auto">
              {canEdit && (
                <AppListCreateItem
                  label="Create loan"
                  layout="row"
                  className={uiCx('w-full', resolveAppSortableListPreset('employeeLoans').minWidth)}
                  onClick={() => setShowCreateModal(true)}
                />
              )}
              {!loans ? (
                <div
                  className={uiCx(resolveAppSortableListPreset('employeeLoans').minWidth, 'px-4 py-4')}
                >
                  <div className="h-6 animate-pulse rounded bg-gray-100" />
                </div>
              ) : filteredLoans.length === 0 ? (
                <AppEmptyState
                  title={loans.length === 0 ? 'No loans found' : 'No loans match the filters'}
                  className="border-0 bg-transparent p-0 py-6 shadow-none"
                />
              ) : (
                <AppSortableEntityList layout="flat">
                  <AppSortableEntityListHeader preset="employeeLoans" variant="flat">
                    <AppSortableEntityListSortColumn
                      label="Date"
                      column="date"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Amount"
                      column="amount"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Remaining"
                      column="remaining"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Status"
                      column="status"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Created by"
                      column="createdBy"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <div className="min-w-0 w-24" aria-hidden />
                  </AppSortableEntityListHeader>
                  <AppSortableEntityListFlatBody preset="employeeLoans">
                    {sortedFilteredLoans.map((loan) => (
                      <AppSortableEntityListRow
                        key={loan.id}
                        as="div"
                        variant="flat"
                        preset="employeeLoans"
                        className="group"
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowLoanDetail(loan.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowLoanDetail(loan.id);
                          }
                        }}
                      >
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                          {formatDate(loan.loan_date)}
                        </span>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate font-semibold text-gray-900')}>
                          {formatCurrency(loan.loan_amount)}
                        </span>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                          {formatCurrency(loan.remaining_balance)}
                        </span>
                        <div className="min-w-0">
                          <AppBadge variant={loanStatusVariant(loan.status)}>{loan.status}</AppBadge>
                        </div>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-600')}>
                          {loan.created_by?.username || '—'}
                        </span>
                        <div
                          className="flex w-24 shrink-0 items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && loan.status === 'Active' ? (
                            <>
                              <AppListRowIconButton
                                icon="💵"
                                label="Add payment"
                                onClick={() => {
                                  setSelectedLoanId(loan.id);
                                  setShowPaymentModal(true);
                                }}
                              />
                              {loan.remaining_balance <= 0 ? (
                                <AppListRowIconButton
                                  icon="✓"
                                  label="Close loan"
                                  onClick={async () => {
                                    const result = await confirm({
                                      message: 'Are you sure you want to close this loan?',
                                      title: 'Close loan',
                                    });
                                    if (result === 'confirm') {
                                      await handleCloseLoan(loan.id);
                                    }
                                  }}
                                />
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </AppSortableEntityListRow>
                    ))}
                  </AppSortableEntityListFlatBody>
                </AppSortableEntityList>
              )}
            </div>
          </div>
        </div>
      </AppCard>

      {showCreateModal ? (
        <CreateLoanModal
          userId={userId}
          onClose={() => {
            setShowCreateModal(false);
            void refetchLoans();
            queryClient.invalidateQueries({ queryKey: ['loans-summary', userId] });
          }}
        />
      ) : null}

      {showPaymentModal && selectedLoanId ? (
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
      ) : null}

      {showLoanDetail ? (
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
      ) : null}
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

  const totalLoanAmount = useMemo(() => {
    const baseAmount = parseFloat(loanAmount) || 0;
    const feesPercent = parseFloat(fees) || 0;
    if (baseAmount <= 0) return 0;
    return baseAmount + (baseAmount * feesPercent) / 100;
  }, [loanAmount, fees]);

  const submitDisabled =
    saving ||
    !loanAmount ||
    parseFloat(loanAmount) <= 0 ||
    totalLoanAmount <= 0 ||
    !agreementDate ||
    !paymentMethod;

  const handleSubmit = async () => {
    if (submitDisabled) return;

    setSaving(true);
    try {
      const baseAmountValue = parseFloat(loanAmount) || 0;
      const feesPercentValue = parseFloat(fees) || 0;

      await api('POST', `/employees/${userId}/loans`, {
        loan_amount: totalLoanAmount,
        base_amount: baseAmountValue > 0 ? baseAmountValue : undefined,
        fees_percent: feesPercentValue > 0 ? feesPercentValue : undefined,
        loan_date: agreementDate,
        agreement_date: agreementDate,
        payment_method: paymentMethod,
        status,
        weekly_payment: 0,
        notes: notes || undefined,
      });
      toast.success('Loan created');
      onClose();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to create loan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Create loan"
      description="Add a new loan agreement for this employee."
      quickInfo={employeeLoanCreateQuickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" onClick={() => void handleSubmit()} disabled={submitDisabled} loading={saving}>
            Create loan
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppInput
          label="Loan amount *"
          type="number"
          step="0.01"
          min={0}
          value={loanAmount}
          onChange={(e) => setLoanAmount(e.target.value)}
          placeholder="0.00"
          fieldHint="Loan amount\n\nPrincipal before fees are applied."
          required
        />
        <AppInput
          label="Fees (%)"
          type="number"
          step="0.01"
          min={0}
          max={100}
          value={fees}
          onChange={(e) => setFees(e.target.value)}
          placeholder="0.00"
          fieldHint="Fees (%)\n\nInterest rate percentage added to the loan amount."
        />
        {loanAmount && parseFloat(loanAmount) > 0 ? (
          <div className={uiCx('rounded-xl border border-blue-200 bg-blue-50 p-3', uiBorders.card)}>
            <div className={uiCx(uiTypography.helper, 'font-medium text-blue-700')}>Total loan amount</div>
            <div className="mt-1 text-sm font-semibold text-blue-900">{formatCurrency(totalLoanAmount)}</div>
            <div className={uiCx(uiTypography.helper, 'mt-1 text-blue-700')}>
              Base: {formatCurrency(parseFloat(loanAmount) || 0)}
              {fees && parseFloat(fees) > 0 ? (
                <>
                  {' '}
                  + Fees ({parseFloat(fees) || 0}%):{' '}
                  {formatCurrency(((parseFloat(loanAmount) || 0) * (parseFloat(fees) || 0)) / 100)}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
        <AppDatePicker
          label="Agreement date *"
          value={agreementDate}
          onChange={(e) => setAgreementDate(e.target.value)}
          fieldHint="Agreement date\n\nDate the loan agreement was signed or issued."
          required
        />
        <AppSelect
          label="Payment method *"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          options={PAYMENT_METHOD_OPTIONS}
          fieldHint="Payment method\n\nHow repayments are typically collected."
          required
        />
        <AppSelect
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={LOAN_STATUS_FORM_OPTIONS}
          fieldHint="Status\n\nActive loans accept payments; closed loans are read-only."
        />
        <AppTextarea
          label="Notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes about the loan agreement"
          fieldHint="Notes\n\nOptional context for payroll or HR."
        />
      </div>
    </AppFormModal>
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

  const { data: loan } = useQuery<LoanDetail>({
    queryKey: ['loan-detail', userId, loanId],
    queryFn: () => api<LoanDetail>('GET', `/employees/${userId}/loans/${loanId}`),
    enabled: !!loanId,
  });

  const submitDisabled =
    saving ||
    !paymentAmount ||
    parseFloat(paymentAmount) <= 0 ||
    !paymentDate ||
    !paymentMethod ||
    !loan;

  const handleSubmit = async () => {
    if (submitDisabled || !loan) return;

    const paymentValue = parseFloat(paymentAmount);
    const remainingBalance = loan.remaining_balance ?? 0;

    if (paymentValue > remainingBalance) {
      if (remainingBalance <= 0) {
        toast.error('This loan has no remaining balance to pay');
        return;
      }

      const adjustResult = await confirm({
        message: `The payment amount (${formatCurrency(paymentValue)}) is greater than the remaining balance (${formatCurrency(remainingBalance)}). The payment will be adjusted to ${formatCurrency(remainingBalance)}. Do you want to continue?`,
        title: 'Payment exceeds balance',
        confirmText: 'Yes, adjust payment',
        cancelText: 'Cancel',
      });

      if (adjustResult !== 'confirm') return;
    }

    setSaving(true);
    try {
      const finalPaymentAmount = paymentValue > remainingBalance ? remainingBalance : paymentValue;

      const result = await api<{ remaining_balance: number; should_close: boolean }>(
        'POST',
        `/employees/${userId}/loans/${loanId}/payments`,
        {
          payment_amount: finalPaymentAmount,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          origin: paymentMethod,
          notes: notes || undefined,
        },
      );

      toast.success('Payment added');

      if (result.should_close) {
        const closeResult = await confirm({
          message: 'The balance of this loan has reached $0.00. Would you like to change the status to "Closed"?',
          title: 'Close loan?',
          confirmText: 'Yes, close',
          cancelText: 'No, keep open',
        });

        if (closeResult === 'confirm') {
          try {
            await api('PATCH', `/employees/${userId}/loans/${loanId}/close`);
            toast.success('Loan closed');
          } catch (e: unknown) {
            const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast.error(detail || 'Failed to close loan');
          }
        }
      }

      onClose();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to add payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Add payment"
      description="Record a repayment for this loan."
      quickInfo={employeeLoanPaymentQuickInfo}
      overlayClassName="z-[200]"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" onClick={() => void handleSubmit()} disabled={submitDisabled} loading={saving}>
            Add payment
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppDatePicker
          label="Payment date *"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          fieldHint="Payment date\n\nDate the repayment was collected or deducted."
          required
        />
        <AppInput
          label="Payment amount *"
          type="number"
          step="0.01"
          min={0}
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
          placeholder="0.00"
          fieldHint="Payment amount\n\nAmount repaid toward the loan balance."
          required
        />
        {loan && loan.remaining_balance > 0 ? (
          <p className={uiTypography.helper}>Remaining balance: {formatCurrency(loan.remaining_balance)}</p>
        ) : null}
        <AppSelect
          label="Payment method *"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          options={PAYMENT_METHOD_OPTIONS}
          fieldHint="Payment method\n\nHow this repayment was collected."
          required
        />
        <AppTextarea
          label="Notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          fieldHint="Notes\n\nOptional context for this payment."
        />
      </div>
    </AppFormModal>
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

  const { data: loan } = useQuery<LoanDetail>({
    queryKey: ['loan-detail', userId, loanId],
    queryFn: () => api<LoanDetail>('GET', `/employees/${userId}/loans/${loanId}`),
  });

  const activities = useMemo(() => {
    if (!loan) return [];

    const items: Array<{ type: string; date: string; user?: string; description: string }> = [];

    items.push({
      type: 'created',
      date: loan.created_at,
      user: loan.created_by?.username,
      description: `Loan created for ${formatCurrency(loan.loan_amount)}`,
    });

    if (loan.updated_at && loan.updated_by) {
      items.push({
        type: 'updated',
        date: loan.updated_at,
        user: loan.updated_by.username,
        description: `Loan status updated to ${loan.status}`,
      });
    }

    if (loan.paid_off_at) {
      items.push({
        type: 'closed',
        date: loan.paid_off_at,
        description: 'Loan closed',
      });
    }

    loan.payments.forEach((payment) => {
      items.push({
        type: 'payment',
        date: payment.created_at,
        user: payment.created_by?.username,
        description: `Payment of ${formatCurrency(payment.payment_amount)} recorded (${payment.payment_method || 'N/A'})`,
      });
    });

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [loan]);

  const handleCloseLoan = async () => {
    const result = await confirm({
      message: 'Are you sure you want to close this loan?',
      title: 'Close loan',
    });
    if (result !== 'confirm') return;

    try {
      await api('PATCH', `/employees/${userId}/loans/${loanId}/close`);
      toast.success('Loan closed');
      await onLoanClosed();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to close loan');
    }
  };

  return (
    <>
      <AppFormModal
        open
        onClose={onClose}
        layout="detail"
        size="md"
        title="Loan details"
        description={loan ? `${formatCurrency(loan.loan_amount)} · ${loan.status}` : 'Loading…'}
        quickInfo={loan ? employeeLoanDetailQuickInfo : undefined}
        bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </AppButton>
            {canEdit && loan?.status === 'Active' ? (
              <>
                <AppButton type="button" size="sm" onClick={() => setShowPaymentModal(true)}>
                  Add payment
                </AppButton>
                {loan.remaining_balance <= 0 ? (
                  <AppButton type="button" variant="secondary" size="sm" onClick={() => void handleCloseLoan()}>
                    Close loan
                  </AppButton>
                ) : null}
              </>
            ) : null}
          </div>
        }
      >
        {!loan ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-500">Loading…</div>
        ) : (
          <div className={uiSpacing.sectionStack}>
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <dl className="min-w-0">
                <DetailField label="Loan amount">
                  <span className="inline-flex flex-wrap items-baseline gap-2">
                    <span>{formatCurrency(loan.loan_amount)}</span>
                    {loan.base_amount && loan.fees_percent && loan.fees_percent > 0 ? (
                      <span className={uiCx(uiTypography.helper, 'font-normal')}>
                        ({formatCurrency(loan.base_amount)} +{' '}
                        {formatCurrency((loan.base_amount * loan.fees_percent) / 100)} fees ({loan.fees_percent}%))
                      </span>
                    ) : null}
                  </span>
                </DetailField>
                <DetailField label="Remaining balance">{formatCurrency(loan.remaining_balance)}</DetailField>
                <DetailField label="Agreement date">{formatDate(loan.loan_date)}</DetailField>
                <DetailField label="Payment method">{loan.payment_method || '—'}</DetailField>
                <DetailField label="Status">
                  <AppBadge variant={loanStatusVariant(loan.status)}>{loan.status}</AppBadge>
                </DetailField>
                <DetailField label="Created by">{loan.created_by?.username || '—'}</DetailField>
                {loan.notes ? (
                  <DetailField label="Notes">
                    <span className="whitespace-pre-wrap font-normal text-gray-700">{loan.notes}</span>
                  </DetailField>
                ) : null}
              </dl>
            </AppCard>

            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <AppSectionHeader title="Payments" />
              {loan.payments.length === 0 ? (
                <p className={uiTypography.helper}>No payments recorded</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left text-xs font-medium text-gray-600">Date</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-600">Amount</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-600">Method</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-600">Balance after</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-600">Recorded by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loan.payments.map((payment) => (
                        <tr key={payment.id} className="border-t border-gray-200">
                          <td className="p-2 text-xs text-gray-900">{formatDate(payment.payment_date)}</td>
                          <td className="p-2 text-xs font-semibold text-gray-900">
                            {formatCurrency(payment.payment_amount)}
                          </td>
                          <td className="p-2 text-xs text-gray-900">{payment.payment_method || '—'}</td>
                          <td className="p-2 text-xs text-gray-900">{formatCurrency(payment.balance_after)}</td>
                          <td className="p-2 text-xs text-gray-600">{payment.created_by?.username || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AppCard>

            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <AppSectionHeader title="History" />
              <div className="mt-3 space-y-2">
                {activities.map((activity, idx) => (
                  <div key={idx} className="border-l-2 border-gray-200 py-1 pl-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{activity.description}</span>
                      {activity.user ? <span className="text-gray-500">by {activity.user}</span> : null}
                    </div>
                    <div className={uiTypography.helper}>{formatDate(activity.date)}</div>
                  </div>
                ))}
              </div>
            </AppCard>
          </div>
        )}
      </AppFormModal>

      {showPaymentModal ? (
        <AddPaymentModal
          userId={userId}
          loanId={loanId}
          onClose={async () => {
            setShowPaymentModal(false);
            await onPaymentAdded();
          }}
        />
      ) : null}
    </>
  );
}
