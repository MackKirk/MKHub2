import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Printer } from 'lucide-react';
import { formatApiErrorDetail, getToken } from '@/lib/api';
import {
  appendLineItemsToFormData,
  PrintRequestLineItemCard,
  usePrintRequestLineItems,
} from '@/components/print-shop/printRequestLineItems';
import {
  AppButton,
  AppDatePicker,
  AppInput,
  AppPageHeader,
  AppTextarea,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const LOGO_SRC = '/ui/assets/login/logo-light.svg';

export default function PrintRequestForm() {
  const {
    meta,
    lineItems,
    expandedId,
    setExpandedId,
    maxFiles,
    maxItems,
    updateLineItem,
    addLineItem,
    duplicateLineItem,
    removeLineItem,
    addArtworkToItem,
    removeArtworkFromItem,
    resetLineItems,
    validateLineItems,
  } = usePrintRequestLineItems();
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

  function resetFormBody() {
    resetLineItems();
    setDueDate('');
    setNotes('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateLineItems()) return;

    const fd = new FormData();
    fd.append('requester_name', requesterName.trim());
    fd.append('requester_email', requesterEmail.trim());
    if (dueDate) fd.append('due_date', dueDate);
    if (notes.trim()) fd.append('notes', notes.trim());
    appendLineItemsToFormData(fd, lineItems);

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch('/print-shop/public/requests', {
        method: 'POST',
        headers,
        body: fd,
      });
      if (!r.ok) {
        let message = `HTTP ${r.status}`;
        try {
          const err = await r.json();
          message = formatApiErrorDetail(err.detail) || err.message || message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const data = await r.json();
      resetFormBody();
      setConfirmationCode(data.request_code || 'submitted');
      toast.success('Print request submitted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmationCode) {
    return (
      <div
        className={uiCx(
          'min-h-screen flex items-center justify-center',
          uiSpacing.pageX,
          uiSpacing.pageY,
          'bg-gradient-to-b from-gray-100 to-gray-50'
        )}
      >
        <div
          className={uiCx(
            'w-full max-w-lg',
            uiSpacing.sectionStack,
            uiRadius.card,
            uiShadows.card,
            uiColors.surface,
            uiBorders.subtle,
            uiSpacing.cardPadding,
            'p-8 text-center'
          )}
        >
          <img src={LOGO_SRC} alt="Mack Kirk" className="h-10 mx-auto" />
          <h1 className={uiTypography.pageTitle}>Request received</h1>
          <p className={uiTypography.pageSubtitle}>
            Your print request code is{' '}
            <span className={uiCx(uiTypography.sectionTitle, uiColors.textStrong)}>{confirmationCode}</span>.
            We emailed you a confirmation — our team will follow up with an estimated delivery date.
          </p>
          <div className={uiCx(uiLayout.actionsRow, 'justify-center')}>
            <AppButton
              variant="primary"
              onClick={() => {
                setConfirmationCode(null);
                resetFormBody();
              }}
            >
              Submit another request
            </AppButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={uiCx(
        'min-h-screen',
        uiSpacing.pageX,
        uiSpacing.pageY,
        'bg-gradient-to-b from-gray-100 to-gray-50'
      )}
    >
      <div className={uiCx('mx-auto w-full max-w-5xl', uiSpacing.pageStack)}>
        <AppPageHeader
          title="Print Shop Request"
          subtitle="Request one or more signs, stickers, or other printed materials."
          icon={<Printer className="h-4 w-4" />}
          actions={
            getToken() ? (
              <Link to="/home">
                <AppButton variant="ghost">Back to Hub</AppButton>
              </Link>
            ) : undefined
          }
        />

        <form
          onSubmit={onSubmit}
          className={uiCx(
            uiSpacing.sectionStack,
            uiRadius.card,
            uiShadows.card,
            uiColors.surface,
            uiBorders.subtle,
            'p-5 md:p-6'
          )}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <AppInput
              label="Your name"
              required
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              autoComplete="name"
            />
            <AppInput
              label="Email"
              type="email"
              required
              value={requesterEmail}
              onChange={(e) => setRequesterEmail(e.target.value)}
              autoComplete="email"
            />
            <AppDatePicker
              label="Desired delivery date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className={uiCx(uiLayout.actionsRow, 'justify-between items-center')}>
            <div>
              <h2 className={uiTypography.sectionTitle}>Items to print</h2>
              <p className={uiTypography.helper}>
                {lineItems.length} item{lineItems.length === 1 ? '' : 's'} — click a row to expand
              </p>
            </div>
            <AppButton type="button" variant="secondary" onClick={addLineItem}>
              <Plus className="h-4 w-4" />
              Add item
            </AppButton>
          </div>

          <div className="space-y-2">
            {lineItems.map((item, index) => (
              <PrintRequestLineItemCard
                key={item.id}
                index={index}
                item={item}
                meta={meta}
                maxFiles={maxFiles}
                expanded={expandedId === item.id}
                canRemove={lineItems.length > 1}
                canDuplicate={lineItems.length < maxItems}
                onToggle={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                onChange={(patch) => updateLineItem(item.id, patch)}
                onDuplicate={() => duplicateLineItem(item.id)}
                onRemove={() => removeLineItem(item.id)}
                onAddFiles={(files) => addArtworkToItem(item.id, files)}
                onRemoveFile={(artworkId) => removeArtworkFromItem(item.id, artworkId)}
              />
            ))}
          </div>

          <AppTextarea
            label="Notes (for the whole request)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Pickup location, general instructions, etc."
          />

          <p className={uiCx(uiTypography.helper, 'rounded-lg border border-gray-200 bg-gray-50 px-3 py-2')}>
            Someone from the print shop will review your request and confirm the completion date afterward.
          </p>

          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="submit" variant="primary" disabled={submitting} loading={submitting}>
              Submit request
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
}
