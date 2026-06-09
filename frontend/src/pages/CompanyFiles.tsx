import { Folder } from 'lucide-react';
import { AppPageHeader, uiCx, uiSpacing } from '@/components/ui';
import CompanyFilesTabEnhanced from '@/components/CompanyFilesTabEnhanced';

export default function CompanyFiles() {
  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        icon={<Folder className="h-4 w-4" />}
        title="Company Files"
        subtitle="Manage company-wide documents organized by file categories."
      />
      <CompanyFilesTabEnhanced />
    </div>
  );
}
