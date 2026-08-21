import OnboardingSignModal from '@/components/OnboardingSignModal';

type SignItem = {
  id: string;
  document_name: string;
};

type Props = {
  signItem: SignItem;
  onClose: () => void;
  onSigned: () => void;
};

/** Thin wrapper: same PDF signing UI as onboarding, Document Builder request URLs. */
export default function DocumentSignModal({ signItem, onClose, onSigned }: Props) {
  const base = `/auth/me/document-signature-requests/${signItem.id}`;
  return (
    <OnboardingSignModal
      signItem={signItem}
      onClose={onClose}
      onSigned={onSigned}
      endpoints={{
        contextPath: `${base}/signing-context`,
        previewPath: `${base}/preview`,
        signPath: `${base}/sign`,
        idFormField: null,
        queryKeyPrefix: 'doc-sig-req',
      }}
    />
  );
}
