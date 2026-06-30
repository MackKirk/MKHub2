import { useCallback, useEffect, useState } from 'react';import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
} from '@/components/ui';
import type { ProjectBillingProject } from '@/components/ProjectBillingSection';

type Props = {
  open: boolean;
  projectId: string;
  project: ProjectBillingProject;
  projectName?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

export default function EditProjectBillingModal({
  open,
  projectId,
  project,
  projectName,
  onClose,
  onSaved,
}: Props) {
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [invoiceTo, setInvoiceTo] = useState('');
  const [billingContact, setBillingContact] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingAddressLine1, setBillingAddressLine1] = useState('');
  const [billingCountry, setBillingCountry] = useState('');
  const [billingProvince, setBillingProvince] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hydrate = useCallback((p: ProjectBillingProject) => {
    setPurchaseOrderNumber(p.purchase_order_number || '');
    setInvoiceTo(p.invoice_to || '');
    setBillingContact(p.billing_contact || '');
    setBillingEmail(p.billing_email || '');
    setBillingAddressLine1(p.billing_address_line1 || '');
    setBillingCountry(p.billing_country || '');
    setBillingProvince(p.billing_province || '');
    setBillingCity(p.billing_city || '');
    setBillingPostalCode(p.billing_postal_code || '');
  }, []);

  useEffect(() => {
    if (open) hydrate(project);
  }, [open, project, hydrate]);

  const handleAddressSelect = useCallback((s: {
    address_line1: string;
    address_line2?: string;
    city?: string;
    province?: string;
    country?: string;
    postal_code?: string;
  }) => {
    if (s.address_line1) setBillingAddressLine1(s.address_line1);
    if (s.city) setBillingCity(s.city);
    if (s.province) setBillingProvince(s.province);
    if (s.country) setBillingCountry(s.country);
    if (s.postal_code) setBillingPostalCode(s.postal_code);
  }, []);

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const handleSave = async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      await api('PATCH', `/projects/${encodeURIComponent(projectId)}`, {
        purchase_order_number: purchaseOrderNumber.trim() || null,
        invoice_to: invoiceTo.trim() || null,
        billing_contact: billingContact.trim() || null,
        billing_email: billingEmail.trim() || null,
        billing_address_line1: billingAddressLine1.trim() || null,
        billing_address_line2: null,
        billing_country: billingCountry.trim() || null,
        billing_province: billingProvince.trim() || null,
        billing_city: billingCity.trim() || null,
        billing_postal_code: billingPostalCode.trim() || null,
      });
      toast.success('Billing information saved');
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const controlInputClass = uiCx('w-full text-sm', uiRadius.control, uiBorders.input, uiSpacing.controlX, 'py-2');
  const title = projectName?.trim() ? `Edit Billing Information — ${projectName.trim()}` : 'Edit Billing Information';

  const quickInfo = (
    <>
      <p>Billing details used for invoices on this project only.</p>
      <p>Initially copied from the Customer when this project was created or awarded.</p>
      <p>Use Sync with Customer on the overview card to pull the latest Customer billing.</p>
      <p>Changes here do not update the Customer profile.</p>
    </>
  );

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title={title}
      description="Invoice delivery and billing address for this project."
      formWidth="comfortable"
      quickInfo={quickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" onClick={handleSave} disabled={isSaving} loading={isSaving}>
            Save
          </AppButton>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900">Purchase Order</h4>
          <AppInput
            label="PO Number"
            value={purchaseOrderNumber}
            onChange={(e) => setPurchaseOrderNumber(e.target.value)}
            maxLength={100}
            disabled={isSaving}
            fieldHint="Purchase Order Number\n\nRequired before invoicing when the customer requires a PO."
          />
        </div>

        <div className="space-y-4 border-t border-gray-100 pt-4">
          <h4 className="text-sm font-semibold text-gray-900">Billing Contact</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <AppInput
              label="Invoice To"
              value={invoiceTo}
              onChange={(e) => setInvoiceTo(e.target.value)}
              disabled={isSaving}
              fieldHint="Invoice To\n\nName of the invoice recipient. This is not your company name."
            />
            <AppInput
              label="Billing Contact"
              value={billingContact}
              onChange={(e) => setBillingContact(e.target.value)}
              disabled={isSaving}
              fieldHint="Billing Contact\n\nPerson to contact for billing (e.g. accounts payable contact name)."
            />
            <AppInput
              label="Billing Email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              disabled={isSaving}
              fieldHint="Billing Email\n\nEmail used for invoice delivery."
            />
          </div>
        </div>

        <div className="space-y-4 border-t border-gray-100 pt-4">
          <h4 className="text-sm font-semibold text-gray-900">Billing Address</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <AppControlLabelRow
                label="Billing Address"
                fieldHint={
                  <AppFieldHint hint="Billing Address\n\nStreet address for billing. Suggestions appear as you type." />
                }
              />
              <AddressAutocomplete
                value={billingAddressLine1}
                onChange={setBillingAddressLine1}
                disabled={isSaving}
                placeholder="Enter billing address"
                className={controlInputClass}
                onAddressSelect={handleAddressSelect}
              />
            </div>
            <AppInput
              label="Billing Country"
              value={billingCountry}
              onChange={(e) => setBillingCountry(e.target.value)}
              disabled={isSaving}
              fieldHint="Billing Country\n\nFilled automatically when you pick an address."
            />
            <AppInput
              label="Billing Province/State"
              value={billingProvince}
              onChange={(e) => setBillingProvince(e.target.value)}
              disabled={isSaving}
              fieldHint="Billing Province/State\n\nFilled automatically when you pick an address."
            />
            <AppInput
              label="Billing City"
              value={billingCity}
              onChange={(e) => setBillingCity(e.target.value)}
              disabled={isSaving}
              fieldHint="Billing City\n\nFilled automatically when you pick an address."
            />
            <AppInput
              label="Billing Postal Code"
              value={billingPostalCode}
              onChange={(e) => setBillingPostalCode(e.target.value)}
              disabled={isSaving}
              fieldHint="Billing Postal Code\n\nFilled automatically when you pick an address."
            />
          </div>
        </div>
      </div>
    </AppFormModal>
  );
}
