import { CanadianDriversLicenseSection } from '@/components/CanadianDriversLicenseSection';
import { UserImmigrationStatusDocumentSection } from '@/components/users/UserImmigrationStatusDocumentSection';
import { UserVisaInformationSection } from '@/components/users/UserVisaInformationSection';
import { uiSpacing } from '@/components/ui';

export function requiresVisaAndImmigration(workEligibilityStatus: string | null | undefined): boolean {
  const wes = (workEligibilityStatus || '').trim();
  return wes !== '' && wes !== 'Canadian Citizen';
}

export function UserWorkEligibilityDocumentsSection({
  userId,
  canEdit,
  profile,
  onProfileFieldsChange,
  showFieldHints,
  selfProfile,
}: {
  userId: string;
  canEdit: boolean;
  profile: Record<string, any>;
  onProfileFieldsChange: (kv: Record<string, any>) => void;
  showFieldHints?: boolean;
  /** Use `/auth/me/profile` for self-service profile edits. */
  selfProfile?: boolean;
}) {
  const showVisaAndImmigration = requiresVisaAndImmigration(profile.work_eligibility_status);

  const driversLicense = (
    <CanadianDriversLicenseSection
      editable={canEdit}
      profile={profile}
      onFieldsChange={onProfileFieldsChange}
      showFieldHints={showFieldHints}
    />
  );

  const visaSection = showVisaAndImmigration ? (
    <UserVisaInformationSection userId={userId} canEdit={canEdit} isRequired={false} showFieldHints={showFieldHints} />
  ) : null;

  if (!canEdit && showVisaAndImmigration) {
    return (
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">{driversLicense}</div>
        <div className="min-w-0">{visaSection}</div>
      </div>
    );
  }

  if (showVisaAndImmigration) {
    return (
      <div className={uiSpacing.sectionStack}>
        {driversLicense}
        {visaSection}
        {canEdit ? (
          <UserImmigrationStatusDocumentSection
            userId={userId}
            canEdit={canEdit}
            isRequired={false}
            selfProfile={selfProfile}
          />
        ) : null}
      </div>
    );
  }

  return <div>{driversLicense}</div>;
}
