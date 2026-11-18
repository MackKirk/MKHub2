import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileStack } from 'lucide-react';
import {
  AppPageHeader,
  AppTabs,
  uiCx,
  uiSpacing,
} from '@/components/ui';
import FormTemplatesPage from '@/pages/FormTemplatesPage';
import WorkPhaseTemplatesAdminPage from '@/pages/WorkPhaseTemplatesAdminPage';

type BusinessLine = 'construction' | 'repairs_maintenance';

type Props = {
  businessLine: BusinessLine;
};

const TAB_ASSESSMENTS = 'assessments';
const TAB_JOB_PROGRESS = 'job-progress';

export default function FieldworkTemplatesHubPage({ businessLine }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => {
    const raw = (searchParams.get('tab') || TAB_ASSESSMENTS).trim().toLowerCase();
    return raw === TAB_JOB_PROGRESS ? TAB_JOB_PROGRESS : TAB_ASSESSMENTS;
  }, [searchParams]);

  const setTab = (key: string) => {
    const params = new URLSearchParams(searchParams);
    if (key === TAB_ASSESSMENTS) params.delete('tab');
    else params.set('tab', key);
    // Drop sort/dir from assessments list when switching away
    if (key !== TAB_ASSESSMENTS) {
      params.delete('sort');
      params.delete('dir');
    }
    setSearchParams(params, { replace: true });
  };

  const lineLabel = businessLine === 'construction' ? 'Production' : 'R&M';

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Templates"
        subtitle={`${lineLabel}: Fieldwork assessments and Job progress starter templates (projects can stack several and edit by hand).`}
        icon={<FileStack className="h-4 w-4" />}
      />

      <AppTabs
        tabs={[
          { key: TAB_ASSESSMENTS, label: 'Assessments' },
          { key: TAB_JOB_PROGRESS, label: 'Job progress' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === TAB_JOB_PROGRESS ? (
        <WorkPhaseTemplatesAdminPage businessLine={businessLine} />
      ) : (
        <div className={uiSpacing.pageStack}>
          <p className="text-sm text-gray-600">
            Site Assessment and Work Report form templates for fieldwork.
          </p>
          <FormTemplatesPage variant="fieldwork" businessLine={businessLine} embedded />
        </div>
      )}
    </div>
  );
}
