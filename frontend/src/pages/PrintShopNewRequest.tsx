import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import {
  appendLineItemsToFormData,
  isNotifiableRequesterEmail,
  PrintRequestLineItemCard,
  usePrintRequestLineItems,
} from '@/components/print-shop/printRequestLineItems';
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppDatePicker,
  AppInput,
  AppPageHeader,
  AppTextarea,
  uiColors,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export default function PrintShopNewRequest() {
  const navigate = useNavigate();
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
    validateLineItems,
  } = usePrintRequestLineItems();
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [requestDate, setRequestDate] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [sendReceivedEmail, setSendReceivedEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const canNotify = isNotifiableRequesterEmail(requesterEmail);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requesterName.trim()) {
      toast.error('Requester name is required');
      return;
    }
    if (requesterEmail.trim() && !isNotifiableRequesterEmail(requesterEmail)) {
      toast.error('Enter a valid requester email, or leave it blank');
      return;
    }
    if (!validateLineItems()) return;

    const fd = new FormData();
    fd.append('requester_name', requesterName.trim());
    fd.append('requester_email', requesterEmail.trim());
    if (dueDate) fd.append('due_date', dueDate);
    if (requestDate) fd.append('created_at', requestDate);
    if (notes.trim()) fd.append('notes', notes.trim());
    if (internalNotes.trim()) fd.append('internal_notes', internalNotes.trim());
    fd.append('send_received_email', canNotify && sendReceivedEmail ? 'true' : 'false');
    appendLineItemsToFormData(fd, lineItems);

    setSubmitting(true);
    try {
      const data = await api<{ id: string; request_code?: string }>('POST', '/print-shop/requests', fd);
      toast.success(data.request_code ? `Logged ${data.request_code}` : 'Print request logged');
      navigate(`/print-shop/${data.id}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Log print request"
        subtitle="Register a request that arrived by email or in person — same queue as the public form."
        icon={<Printer className="h-4 w-4" />}
        onBack={() => navigate('/print-shop')}
        backLabel="Back to requests"
      />

      <form onSubmit={onSubmit} className={uiSpacing.sectionStack}>
        <AppCard className={uiShadows.card} bodyClassName={uiCx(uiSpacing.cardPadding, 'space-y-4')}>
          <div>
            <h2 className={uiTypography.sectionTitle}>Who asked</h2>
            <p className={uiTypography.helper}>Copy name and email from the message.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <AppInput
              label="Requester name"
              required
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              autoComplete="off"
            />
            <AppInput
              label="Requester email"
              type="email"
              value={requesterEmail}
              onChange={(e) => setRequesterEmail(e.target.value)}
              autoComplete="off"
              helperText="Optional. Leave blank if you will not notify them."
            />
            <AppDatePicker
              label="Desired delivery"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <AppDatePicker
              label="Request date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              helperText="Leave blank for today."
            />
          </div>
        </AppCard>

        <AppCard className={uiShadows.card} bodyClassName={uiCx(uiSpacing.cardPadding, 'space-y-4')}>
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
        </AppCard>

        <AppCard className={uiShadows.card} bodyClassName={uiCx(uiSpacing.cardPadding, 'space-y-4')}>
          <AppTextarea
            label="Notes from the email"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Paste details, pickup location, or extra instructions…"
          />
          <AppTextarea
            label="Internal notes"
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            placeholder="Visible only to print shop staff…"
          />
          <AppCheckbox
            label="Email confirmation to the requester"
            checked={canNotify && sendReceivedEmail}
            onChange={setSendReceivedEmail}
            disabled={!canNotify}
            fieldHint={
              canNotify
                ? 'Off by default — they already emailed you. Turn on only if they should get the usual “request received” message.'
                : 'Add a requester email to send a confirmation.'
            }
          />
        </AppCard>

        <div className={uiCx(uiLayout.actionsRow, 'justify-between items-center')}>
          <p className={uiCx(uiTypography.helper, uiColors.textMuted)}>
            Public form stays at{' '}
            <Link to="/print-request" className="text-brand-red underline">
              /print-request
            </Link>
          </p>
          <AppButton type="submit" variant="primary" disabled={submitting} loading={submitting}>
            Log request
          </AppButton>
        </div>
      </form>
    </div>
  );
}
