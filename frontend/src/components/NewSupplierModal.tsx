import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { supplierFormQuickInfo } from '@/lib/formModalQuickInfo';
import {
  SupplierAddressFields,
  SupplierCompanyFields,
  type SupplierFormFieldsProps,
  supplierFormStepPills,
} from '@/components/SupplierFormFields';
import {
  AppButton,
  AppFormModal,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';

interface NewSupplierModalProps {
  open: boolean;
  onClose: () => void;
  onSupplierCreated: (supplierName: string) => void;
}

export default function NewSupplierModal({ open, onClose, onSupplierCreated }: NewSupplierModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine1Complement, setAddressLine1Complement] = useState('');
  const [showAddress2, setShowAddress2] = useState(false);
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLine2Complement, setAddressLine2Complement] = useState('');
  const [showAddress3, setShowAddress3] = useState(false);
  const [addressLine3, setAddressLine3] = useState('');
  const [addressLine3Complement, setAddressLine3Complement] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');

  const fieldProps: SupplierFormFieldsProps = useMemo(
    () => ({
      name,
      nameError,
      legalName,
      email,
      phone,
      website,
      addressLine1,
      addressLine1Complement,
      showAddress2,
      addressLine2,
      addressLine2Complement,
      showAddress3,
      addressLine3,
      addressLine3Complement,
      city,
      province,
      postalCode,
      country,
      onNameChange: setName,
      onClearNameError: () => setNameError(false),
      onLegalNameChange: setLegalName,
      onEmailChange: setEmail,
      onPhoneChange: setPhone,
      onWebsiteChange: setWebsite,
      onAddressLine1Change: setAddressLine1,
      onAddressLine1ComplementChange: setAddressLine1Complement,
      onShowAddress2: setShowAddress2,
      onAddressLine2Change: setAddressLine2,
      onAddressLine2ComplementChange: setAddressLine2Complement,
      onShowAddress3: setShowAddress3,
      onAddressLine3Change: setAddressLine3,
      onAddressLine3ComplementChange: setAddressLine3Complement,
      onCityChange: setCity,
      onProvinceChange: setProvince,
      onPostalCodeChange: setPostalCode,
      onCountryChange: setCountry,
      onAddressSelect: (address) => {
        setAddressLine1(address.address_line1 || addressLine1);
        if (address.city !== undefined) setCity(address.city);
        if (address.province !== undefined) setProvince(address.province);
        if (address.postal_code !== undefined) setPostalCode(address.postal_code);
        if (address.country !== undefined) setCountry(address.country);
      },
    }),
    [
      name,
      nameError,
      legalName,
      email,
      phone,
      website,
      addressLine1,
      addressLine1Complement,
      showAddress2,
      addressLine2,
      addressLine2Complement,
      showAddress3,
      addressLine3,
      addressLine3Complement,
      city,
      province,
      postalCode,
      country,
      addressLine1,
    ],
  );

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      return await api<any>('POST', '/inventory/suppliers', data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions'] });
      queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions-select'] });
      toast.success('Supplier created');
      onSupplierCreated(data.name);
      resetForm();
      onClose();
    },
    onError: () => {
      toast.error('Failed to create supplier');
    },
  });

  const resetForm = () => {
    setStep(1);
    setName('');
    setNameError(false);
    setLegalName('');
    setEmail('');
    setPhone('');
    setWebsite('');
    setAddressLine1('');
    setAddressLine1Complement('');
    setShowAddress2(false);
    setAddressLine2('');
    setAddressLine2Complement('');
    setShowAddress3(false);
    setAddressLine3('');
    setAddressLine3Complement('');
    setCity('');
    setProvince('');
    setPostalCode('');
    setCountry('');
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const buildPayload = () => ({
    name: name.trim(),
    legal_name: legalName.trim() || undefined,
    email: email.trim() || undefined,
    phone: phone.trim() || undefined,
    website: website.trim() || undefined,
    address_line1: addressLine1.trim() || undefined,
    address_line1_complement: addressLine1Complement.trim() || undefined,
    address_line2: addressLine2.trim() || undefined,
    address_line2_complement: addressLine2Complement.trim() || undefined,
    address_line3: addressLine3.trim() || undefined,
    address_line3_complement: addressLine3Complement.trim() || undefined,
    city: city.trim() || undefined,
    province: province.trim() || undefined,
    postal_code: postalCode.trim() || undefined,
    country: country.trim() || undefined,
    is_active: true,
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError(true);
      toast.error('Name is required');
      return;
    }
    createMut.mutate(buildPayload());
  };

  const goNext = () => {
    if (!name.trim()) {
      setNameError(true);
      toast.error('Name is required');
      return;
    }
    setStep(2);
  };

  const stepSubtitle = step === 1 ? 'Company details' : 'Address';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      formWidth="wide"
      dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
      dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
      title="New Supplier"
      description={stepSubtitle}
      headerExtra={supplierFormStepPills(step, 2)}
      quickInfo={supplierFormQuickInfo(false)}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
          <span className={uiTypography.helper}>Step {step} of 2</span>
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </AppButton>
            {step > 1 ? (
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setStep(1)}>
                Back
              </AppButton>
            ) : null}
            {step === 1 ? (
              <AppButton type="button" size="sm" onClick={goNext}>
                Next
              </AppButton>
            ) : (
              <AppButton
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={createMut.isPending}
                loading={createMut.isPending}
              >
                {createMut.isPending ? 'Creating...' : 'Create'}
              </AppButton>
            )}
          </div>
        </div>
      }
    >
      {step === 1 ? <SupplierCompanyFields {...fieldProps} /> : <SupplierAddressFields {...fieldProps} />}
    </AppFormModal>
  );
}
