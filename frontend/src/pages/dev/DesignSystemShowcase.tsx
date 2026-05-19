import { useMemo, useState } from 'react';
import {
  AppBadge,
  AppButton,
  AppCalendarBase,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppModal,
  AppPageHeader,
  AppSectionHeader,
  AppSelect,
  AppTable,
  AppTabs,
  AppTextarea,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  CalendarDays,
  CircleAlert,
  ClipboardList,
  Layers,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  UserRound,
} from 'lucide-react';

const sampleDays = [
  { dateLabel: '28', isMuted: true },
  { dateLabel: '29', isMuted: true },
  { dateLabel: '30', isMuted: true },
  { dateLabel: '1' },
  { dateLabel: '2' },
  { dateLabel: '3' },
  { dateLabel: '4' },
  { dateLabel: '5' },
  { dateLabel: '6' },
  { dateLabel: '7', isSelected: true },
  { dateLabel: '8' },
  { dateLabel: '9' },
  { dateLabel: '10' },
  { dateLabel: '11' },
  { dateLabel: '12' },
  { dateLabel: '13' },
  { dateLabel: '14', isToday: true },
  { dateLabel: '15' },
  { dateLabel: '16' },
  { dateLabel: '17' },
  { dateLabel: '18' },
  { dateLabel: '19' },
  { dateLabel: '20' },
  { dateLabel: '21' },
  { dateLabel: '22' },
  { dateLabel: '23' },
  { dateLabel: '24' },
  { dateLabel: '25' },
  { dateLabel: '26' },
  { dateLabel: '27' },
  { dateLabel: '28' },
  { dateLabel: '29' },
  { dateLabel: '30' },
  { dateLabel: '31' },
  { dateLabel: '1', isMuted: true },
  { dateLabel: '2', isMuted: true },
  { dateLabel: '3', isMuted: true },
  { dateLabel: '4', isMuted: true },
  { dateLabel: '5', isMuted: true },
  { dateLabel: '6', isMuted: true },
  { dateLabel: '7', isMuted: true },
  { dateLabel: '8', isMuted: true },
] as const;

const tabItems = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents', count: 12 },
  { key: 'activity', label: 'Activity', count: 4 },
] as const;

const spacingTokens = [
  { label: 'space-y-2', className: 'h-2' },
  { label: 'space-y-3', className: 'h-3' },
  { label: 'space-y-4', className: 'h-4' },
  { label: 'space-y-6', className: 'h-6' },
] as const;

export default function DesignSystemShowcase() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const tableRows = useMemo(
    () => [
      [<span key="u1">RC-2044</span>, <span key="n1">Atlas Office Buildout</span>, <AppBadge key="s1" variant="info">In Progress</AppBadge>, <span key="o1">May 26, 2026</span>],
      [<span key="u2">RC-2045</span>, <span key="n2">West Terminal Retrofit</span>, <AppBadge key="s2" variant="warning">Review</AppBadge>, <span key="o2">Jun 02, 2026</span>],
      [<span key="u3">RC-2046</span>, <span key="n3">South Yard Lighting</span>, <AppBadge key="s3" variant="success">Approved</AppBadge>, <span key="o3">Jun 08, 2026</span>],
    ],
    [],
  );

  return (
    <main className={uiCx('min-h-full bg-gray-50', uiSpacing.pageY)}>
      <div className={uiCx(uiLayout.contentContainer, uiSpacing.pageX, uiSpacing.pageStack)}>
        <AppPageHeader
          title="Design System Showcase"
          subtitle="MK Hub reusable enterprise UI foundation based on Human Resources User Details patterns."
          icon={<LayoutGrid className="h-4 w-4" />}
          actions={
            <>
              <AppButton variant="secondary" leftIcon={<Settings className="h-4 w-4" />}>
                Configure
              </AppButton>
              <AppButton leftIcon={<Plus className="h-4 w-4" />}>Create</AppButton>
            </>
          }
        />

        <AppCard>
          <AppSectionHeader
            title="Buttons"
            description="Primary actions, secondary actions, ghost actions, and danger actions."
            icon={<Layers className="h-4 w-4" />}
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <AppButton>Primary</AppButton>
                <AppButton variant="secondary">Secondary</AppButton>
                <AppButton variant="ghost">Ghost</AppButton>
                <AppButton variant="danger">Danger</AppButton>
              </div>
              <div className="flex flex-wrap gap-2">
                <AppButton size="sm">Small</AppButton>
                <AppButton size="md">Medium</AppButton>
                <AppButton size="lg">Large</AppButton>
                <AppButton loading>Loading</AppButton>
              </div>
            </div>
            <AppCard
              title="Card In Card"
              subtitle="Example of information grouping inside shared card shells."
              footer={<AppButton variant="secondary">View Details</AppButton>}
            >
              <p className={uiTypography.body}>
                Cards should remain subtle with rounded corners, soft borders, and concise hierarchy.
              </p>
            </AppCard>
          </div>
        </AppCard>

        <AppCard
          title="List create item (first in list)"
          subtitle="Dashed placeholder rendered before existing rows/cards. Opens a create route or modal."
        >
          <p className={uiCx(uiTypography.helper, 'mb-4')}>
            Always place this as the <strong className="font-semibold text-gray-800">first item</strong> in the list or grid,
            then map your data items after it (same pattern as Opportunities → New Opportunity).
          </p>
          <div className="space-y-6">
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>Grid / cards — layout=&quot;card&quot;</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AppListCreateItem label="New Opportunity" layout="card" onClick={() => undefined} />
                <div className={uiCx(uiRadius.card, 'border border-gray-200 bg-white p-4', uiTypography.helper)}>
                  Existing list card (example)
                </div>
                <div className={uiCx(uiRadius.card, 'border border-gray-200 bg-gray-50 p-4', uiTypography.helper)}>
                  Existing list card (example)
                </div>
              </div>
            </div>
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>Row / table-style list — layout=&quot;row&quot;</p>
              <div className="flex flex-col gap-2">
                <AppListCreateItem label="New Opportunity" layout="row" onClick={() => undefined} />
                <div className={uiCx(uiRadius.control, 'border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600')}>
                  Existing row (example)
                </div>
              </div>
            </div>
          </div>
        </AppCard>

        <div className={uiLayout.sectionGrid2}>
          <AppCard title="Tabs" subtitle="Controlled tab style from existing enterprise dashboard patterns.">
            <AppTabs tabs={[...tabItems]} value={activeTab} onChange={setActiveTab} />
            <div className={uiCx('mt-4 border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600', uiRadius.control)}>
              Active tab: <span className="font-semibold text-gray-800">{activeTab}</span>
            </div>
          </AppCard>

          <AppCard title="Badges" subtitle="Compact status and metadata labels.">
            <div className="flex flex-wrap gap-2">
              <AppBadge variant="neutral">Draft</AppBadge>
              <AppBadge variant="info">In Progress</AppBadge>
              <AppBadge variant="success">Approved</AppBadge>
              <AppBadge variant="warning">Pending</AppBadge>
              <AppBadge variant="danger">Blocked</AppBadge>
            </div>
          </AppCard>
        </div>

        <div className={uiLayout.sectionGrid2}>
          <AppCard title="Form Controls" subtitle="Unified inputs, selects, and textareas for data entry.">
            <div className="space-y-3">
              <AppInput
                id="showcase-search"
                label="Search"
                placeholder="Search by employee, project, or ID"
                leftIcon={<Search className="h-4 w-4" />}
              />
              <AppSelect
                id="showcase-department"
                label="Department"
                placeholder="Select department"
                options={[
                  { value: 'hr', label: 'Human Resources' },
                  { value: 'operations', label: 'Operations' },
                  { value: 'fleet', label: 'Fleet' },
                ]}
              />
              <AppTextarea
                id="showcase-notes"
                label="Notes"
                placeholder="Write concise internal notes..."
                helperText="Keep notes objective and action-oriented."
              />
            </div>
          </AppCard>

          <AppCard title="Modal" subtitle="Modal shell only, reusable across features.">
            <p className={uiTypography.body}>
              Use one modal visual system for all features to maintain consistency.
            </p>
            <div className="mt-4">
              <AppButton onClick={() => setIsModalOpen(true)} leftIcon={<ClipboardList className="h-4 w-4" />}>
                Open Modal
              </AppButton>
            </div>
          </AppCard>
        </div>

        <AppCard title="Table" subtitle="Default table shell with subtle header and row hover treatment.">
          <AppTable
            columns={['ID', 'Project', 'Status', 'Due Date']}
            rows={tableRows}
            emptyState="No records found for the selected filters."
          />
        </AppCard>

        <div className={uiLayout.sectionGrid2}>
          <AppCard title="Empty State" subtitle="Unified blank-state pattern with optional action.">
            <AppEmptyState
              title="No Documents Added"
              description="Upload policy files, safety forms, or HR records to populate this section."
              icon={<CircleAlert className="h-5 w-5" />}
              action={<AppButton variant="secondary">Upload Document</AppButton>}
            />
          </AppCard>

          <AppCard title="Calendar Base" subtitle="Visual-only calendar scaffold; no business logic included.">
            <AppCalendarBase monthLabel="May 2026" days={[...sampleDays]} />
          </AppCard>
        </div>

        <div className={uiLayout.sectionGrid2}>
          <AppCard title="Spacing Rules" subtitle="Reference spacing rhythm for page and section composition.">
            <div className="space-y-3">
              {spacingTokens.map((token) => (
                <div key={token.label} className="space-y-1">
                  <div className={uiTypography.helper}>{token.label}</div>
                  <div className={uiCx('border border-dashed border-gray-300 bg-gray-50 p-2', uiRadius.control)}>
                    <div className={uiCx('bg-brand-red/10 px-2 py-1 text-[10px] font-semibold text-brand-red', uiRadius.control)}>Block A</div>
                    <div className={token.className} />
                    <div className={uiCx('bg-brand-red/10 px-2 py-1 text-[10px] font-semibold text-brand-red', uiRadius.control)}>Block B</div>
                  </div>
                </div>
              ))}
            </div>
          </AppCard>

          <AppCard title="Typography Rules" subtitle="Standardized title/body/helper hierarchy.">
            <div className="space-y-2">
              <p className={uiTypography.pageTitle}>Page Title / text-lg semibold</p>
              <p className={uiTypography.sectionTitle}>Section Title / text-sm semibold</p>
              <p className={uiTypography.body}>Body text / text-sm regular for paragraphs and supporting content.</p>
              <p className={uiTypography.helper}>Helper text / text-xs for guidance and microcopy.</p>
              <p className={uiTypography.overline}>Overline / text-[10px] uppercase</p>
            </div>
          </AppCard>
        </div>
      </div>

      <AppModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Review Cycle Reminder"
        description="This example demonstrates the shared modal shell only."
        footer={
          <div className="flex justify-end gap-2">
            <AppButton variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton onClick={() => setIsModalOpen(false)} leftIcon={<UserRound className="h-4 w-4" />}>
              Confirm
            </AppButton>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-gray-700">
          <p>Use this modal style for confirmations, forms, and focused workflows.</p>
          <p className="text-xs text-gray-600">Backdrop, border radius, spacing, and title hierarchy remain consistent.</p>
        </div>
      </AppModal>
    </main>
  );
}
