import { useMemo, useState } from 'react';
import {
  AppBadge,
  AppButton,
  AppCalendarBase,
  AppCombobox,
  AppDatePicker,
  AppUserSelect,
  AppCard,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppHeroEditButton,
  AppInput,
  AppListCreateItem,
  AppModal,
  AppPageBackButton,
  AppPageHeader,
  AppSectionHeader,
  APP_SECTION_PRESET_KEYS,
  appSectionPresetProps,
  AppMultiSelect,
  AppProjectSelect,
  AppSelect,
  AppTable,
  AppTabs,
  AppTextarea,
  AppTooltip,
  uiBorders,
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
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { createRequestQuickInfo, filtersModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';

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
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isFiltersQuickInfoModalOpen, setIsFiltersQuickInfoModalOpen] = useState(false);
  const [showcaseJob, setShowcaseJob] = useState('');
  const [showcaseProjectId, setShowcaseProjectId] = useState('');
  const [showcaseDepartment, setShowcaseDepartment] = useState('');
  const [showcasePriority, setShowcasePriority] = useState('');
  const [showcaseOperator, setShowcaseOperator] = useState('');
  const [showcaseDepartmentsMulti, setShowcaseDepartmentsMulti] = useState<string[]>([]);
  const [showcaseDueDate, setShowcaseDueDate] = useState('');
  const [showcaseUserId, setShowcaseUserId] = useState('');
  const [showcaseUserIds, setShowcaseUserIds] = useState<string[]>([]);
  const [showcaseAttachment, setShowcaseAttachment] = useState<File | null>(null);
  const [showcaseAttachments, setShowcaseAttachments] = useState<File[]>([]);
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
      <div className={uiCx('w-full', uiSpacing.pageStack)}>
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

        <AppCard
          title="Page header"
          subtitle="AppPageHeader on gray page shells. Child pages: onBack + icon (back arrow, then blue tile, then title). Parent pages: icon only."
        >
          <div className="space-y-6">
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>With back + decorative icon</p>
              <AppPageHeader
                title="Opportunities"
                subtitle="Create, edit and track bids and quotes"
                onBack={() => undefined}
                backLabel="Back to Business"
                icon={<LayoutGrid className="h-4 w-4" />}
                actions={
                  <div className="text-right">
                    <div className={uiTypography.overline}>Today</div>
                    <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>
                      {new Date().toLocaleDateString('en-CA', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                }
              />
              <p className={uiCx(uiTypography.helper, 'mt-2')}>
                Props: <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">onBack</code>,{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">backLabel</code>,{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">icon</code> (Lucide inside blue tile),{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">actions</code> (e.g. Today).
              </p>
            </div>
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>With decorative icon (no back)</p>
              <AppPageHeader
                title="Customers"
                subtitle="Manage your customer list and sites"
                icon={<LayoutGrid className="h-4 w-4" />}
                actions={
                  <div className="text-right">
                    <div className={uiTypography.overline}>Today</div>
                    <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>
                      {new Date().toLocaleDateString('en-CA', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                }
              />
            </div>
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>AppPageBackButton alone</p>
              <AppPageBackButton onClick={() => undefined} label="Back to Business" />
            </div>
          </div>
        </AppCard>

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
          title="Hero edit button"
          subtitle="Inline pencil control next to field labels or values — same pattern as opportunity/project hero (e.g. /opportunities/:id)."
        >
          <div className="space-y-4">
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>size=&quot;field&quot; (default)</p>
              <div className="flex items-center gap-1.5">
                <span className={uiTypography.overline}>Clock-in Time</span>
                <AppHeroEditButton title="Edit clock-in time" aria-label="Edit clock-in time" onClick={() => undefined} />
              </div>
              <p className={uiCx(uiTypography.helper, 'mt-2')}>
                Gray pencil, <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">hover:text-brand-red</code>, 12px icon (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">w-3 h-3</code>),{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">p-0.5</code>. Use beside labels or inline values.
              </p>
            </div>
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>size=&quot;title&quot;</p>
              <div className="flex items-center gap-1.5">
                <h3 className={uiTypography.sectionTitle}>Opportunity Name</h3>
                <AppHeroEditButton size="title" title="Edit project name" aria-label="Edit project name" onClick={() => undefined} />
              </div>
              <p className={uiCx(uiTypography.helper, 'mt-2')}>
                Slightly larger icon (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">w-3.5 h-3.5</code>) for heading rows.
              </p>
            </div>
          </div>
        </AppCard>

        <AppCard
          title="Form section cards (detail tabs)"
          subtitle="AppCard + AppSectionHeader with semantic icons — User Details, Customer General, and similar edit tabs."
        >
          <p className={uiCx(uiTypography.helper, 'mb-4')}>
            Use{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">appSectionPresetProps(&apos;company&apos;)</code>{' '}
            from <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">@/components/ui</code> on{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">AppSectionHeader</code>. Pair with{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">AppHeroEditButton</code> in{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">action</code> when the section is read-only until edit.
            Stack sections with <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">space-y-6</code> inside the tab body.
          </p>
          <div className={uiSpacing.sectionStack}>
            <AppCard>
              <AppSectionHeader
                title="Company"
                description="Core company identity details."
                {...appSectionPresetProps('company')}
                action={<AppHeroEditButton title="Edit Company" onClick={() => undefined} />}
              />
              <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
                <AppInput label="Display name *" placeholder="Public name" />
                <AppInput label="Legal name *" placeholder="Registered name" />
              </div>
            </AppCard>
            <AppCard>
              <AppSectionHeader
                title="Address"
                description="Primary mailing and location address."
                {...appSectionPresetProps('address')}
                action={<AppHeroEditButton title="Edit Address" onClick={() => undefined} />}
              />
              <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
                <AppInput label="City" placeholder="City" />
                <AppInput label="Postal code" placeholder="Postal code" />
              </div>
            </AppCard>
          </div>
          <div className={uiCx('mt-6 border-t border-gray-100 pt-4')}>
            <p className={uiCx(uiTypography.overline, 'mb-3')}>Preset keys</p>
            <div className="flex flex-wrap gap-2">
              {APP_SECTION_PRESET_KEYS.map((key) => (
                <AppSectionHeader
                  key={key}
                  title={key}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                  {...appSectionPresetProps(key)}
                />
              ))}
            </div>
          </div>
        </AppCard>

        <AppCard
          title="Entity form modals (contacts, sites)"
          subtitle="AppFormModal + field hints (?) — narrow comfortable for contacts, wide for address-heavy forms."
        >
          <p className={uiCx(uiTypography.helper, 'mb-4')}>
            Customer tab grids open encapsulated modals on card click (no inline edit). Reuse these components:
          </p>
          <ul className={uiCx(uiTypography.helper, 'mb-4 list-disc space-y-1 pl-5')}>
            <li>
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">NewContactModal</code> /{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">EditContactModal</code> —{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">formWidth=&quot;comfortable&quot;</code>
            </li>
            <li>
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">SiteFormModal</code> —{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">formWidth=&quot;wide&quot;</code> +{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">AddressAutocomplete</code> via{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">AppControlLabelRow</code>
            </li>
          </ul>
          <p className={uiTypography.helper}>
            Cover/photo: left column + <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">ImagePicker</code> nested
            with <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">uiModalLayer.nestedPicker</code>. Footer: Delete
            (edit only, left), Cancel + Save/Create (right).
          </p>
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

        <AppCard
          title="Hover tooltip"
          subtitle="Dark label on hover/focus — Opportunities estimator avatars, Business filter icons. Portaled so overflow-hidden does not clip."
        >
          <p className={uiCx(uiTypography.helper, 'mb-4')}>
            Wrap any trigger with <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">AppTooltip</code>. Do
            not use native <code className="text-[11px]">title</code> on the same element. For form help, use{' '}
            <code className="text-[11px]">fieldHint</code> / <code className="text-[11px]">AppFieldHint</code> (light
            panel).
          </p>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-6')}>
            <AppTooltip content="Callum">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                C
              </span>
            </AppTooltip>
            <AppTooltip content="Show All">
              <AppButton type="button" variant="secondary" size="sm" className="h-10 w-10 p-0" aria-label="Show all">
                <LayoutGrid className="h-5 w-5" />
              </AppButton>
            </AppTooltip>
            <AppTooltip content="Roofing" placement="bottom">
              <AppButton type="button" variant="secondary" size="sm">
                Bottom placement
              </AppButton>
            </AppTooltip>
          </div>
        </AppCard>

        <div className={uiLayout.sectionGrid2}>
          <AppCard
            title="Form Controls"
            subtitle="Unified inputs, selects, and textareas — pages, cards, and modals."
          >
            <div className={uiCx('mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3', uiRadius.control)}>
              <p className={uiTypography.body}>
                <strong className="font-semibold text-gray-800">Field hint (?)</strong> — use prop{' '}
                <code className="rounded bg-white px-1 py-0.5 text-[11px]">fieldHint</code> on{' '}
                <code className="text-[11px]">AppInput</code>, <code className="text-[11px]">AppSelect</code>, or{' '}
                <code className="text-[11px]">AppTextarea</code> anywhere in the app (not only inside modals). Same red
                ? icon and tooltip as in <strong className="font-semibold text-gray-800">AppFormModal</strong> and Director
                Meetings.
              </p>
              <p className={uiTypography.helper}>
                String format: <code className="text-[11px]">{'Title\\n\\nExplanation body.'}</code> (title + body).
                Labels: uppercase 10px semibold gray; trailing <code className="text-[11px]">*</code> on the label string
                renders in brand red for required fields.
              </p>
              <p className={uiTypography.helper}>
                Standalone: <code className="text-[11px]">AppFieldHint</code> or legacy{' '}
                <code className="text-[11px]">FieldHint</code> next to custom labels when not using App* controls.
              </p>
              <p className={uiTypography.helper}>
                <strong className="font-semibold text-gray-800">Dropdown — with search</strong> —{' '}
                <code className="text-[11px]">AppCombobox</code> (single), searchable{' '}
                <code className="text-[11px]">AppMultiSelect</code>, <code className="text-[11px]">AppUserSelect</code>,{' '}
                <code className="text-[11px]">AppProjectSelect</code>, <code className="text-[11px]">AppClientSelect</code>.
                Type in the field (optional left icon); portaled list is <code className="text-[11px]">uiDropdown.menu</code>{' '}
                with no search bar inside the panel. Use when the list is long or users need to find by name/code/address.
              </p>
              <p className={uiTypography.helper}>
                <strong className="font-semibold text-gray-800">Dropdown — without search</strong> —{' '}
                <code className="text-[11px]">AppSelect</code> (default; do not pass <code className="text-[11px]">searchable</code>).
                Button + chevron trigger; open the list and pick. Use for short enums (priority, operator, a few statuses).
                Avoid <code className="text-[11px]">AppSelect searchable</code> on new screens — prefer{' '}
                <code className="text-[11px]">AppCombobox</code> when search is required.
              </p>
              <p className={uiTypography.helper}>
                Dates: <code className="text-[11px]">AppDatePicker</code> — click the month label to pick month/year, then
                choose a day. Portaled panel uses <code className="text-[11px]">uiDatePicker</code> (not the native browser
                picker).
              </p>
              <p className={uiTypography.helper}>
                Projects: <code className="text-[11px]">AppProjectSelect</code> — searchable jobs from{' '}
                <code className="text-[11px]">/projects</code> (name, code, address); same pattern as Clock In project
                rows. Use <code className="text-[11px]">JobSearchCombobox</code> when predefined jobs (Shop/Yard) are
                included. Optional: <code className="text-[11px]">allowEmpty</code>.
              </p>
              <p className={uiTypography.helper}>
                Users: <code className="text-[11px]">AppUserSelect</code> —{' '}
                <code className="text-[11px]">mode=&quot;single&quot;</code> (default) or{' '}
                <code className="text-[11px]">mode=&quot;multiple&quot;</code>. Loads active users from{' '}
                <code className="text-[11px]">/auth/users/options</code> (alphabetical, search, infinite scroll, profile
                photo). Single shows the user in the field only (no chip below); multiple keeps the menu open with
                checkboxes and chips.
              </p>
            </div>
            <div className="space-y-3">
              <AppInput
                id="showcase-title"
                label="Title *"
                placeholder="Short summary"
                fieldHint="Title\n\nA short summary shown in lists and notifications."
              />
              <AppInput
                id="showcase-search"
                label="Search"
                placeholder="Search by employee, project, or ID"
                leftIcon={<Search className="h-4 w-4" />}
                fieldHint="Search\n\nMatches employee name, project code, or internal ID."
              />
              <AppProjectSelect
                id="showcase-project"
                label="Project (optional)"
                value={showcaseProjectId}
                onChange={setShowcaseProjectId}
                allowEmpty
                emptyOptionLabel="No project"
                placeholder="Search by name, code, or address…"
                fieldHint="Project\n\nReal projects from the API (excludes bidding by default). Clock In uses JobSearchCombobox when Shop/Yard jobs are included."
              />
              <AppCombobox
                id="showcase-job"
                label="Job * (static demo)"
                placeholder="Search by name, code, or address…"
                fieldHint="Job\n\nStatic AppCombobox demo only — production Clock In uses JobSearchCombobox."
                options={[
                  { value: 'shop', label: 'Shop / Yard', description: 'Predefined · SHOP' },
                  { value: 'p1', label: 'North Tower Renovation', description: 'PRJ-1042 · Vancouver, BC' },
                  { value: 'p2', label: 'Warehouse Leak Investigation', description: 'PRJ-2088 · Burnaby, BC' },
                ]}
                value={showcaseJob}
                onChange={setShowcaseJob}
              />
              <AppDatePicker
                id="showcase-due-date"
                label="Due date (optional)"
                placeholder="yyyy-mm-dd"
                value={showcaseDueDate}
                onChange={(e) => setShowcaseDueDate(e.target.value)}
                fieldHint="Due date\n\nOptional deadline for the task or request."
              />
              <AppUserSelect
                id="showcase-assignee"
                mode="single"
                label="Assign to user *"
                placeholder="Search or select user…"
                value={showcaseUserId}
                onChange={setShowcaseUserId}
                fieldHint="Assign to user\n\nSingle user target for a task or request (Task Requests / Equipment assign pattern)."
              />
              <AppUserSelect
                id="showcase-signers"
                mode="multiple"
                label="Additional signers"
                placeholder="Search users to add…"
                value={showcaseUserIds}
                onChange={setShowcaseUserIds}
                fieldHint="Additional signers\n\nMultiple users who must sign a document (Safety / approvals pattern)."
              />
              <AppSectionHeader
                title="Dropdown with search"
                description="AppCombobox — long lists, type to filter."
                className="pt-2"
              />
              <AppCombobox
                id="showcase-department"
                label="Department"
                placeholder="Search or select department…"
                value={showcaseDepartment}
                onChange={setShowcaseDepartment}
                leftIcon={<Layers className="h-4 w-4" />}
                fieldHint="Department\n\nUse AppCombobox when the user should search in the field."
                options={[
                  { value: 'hr', label: 'Human Resources' },
                  { value: 'operations', label: 'Operations' },
                  { value: 'fleet', label: 'Fleet' },
                  { value: 'estimating', label: 'Estimating' },
                  { value: 'safety', label: 'Safety' },
                  { value: 'sales', label: 'Sales' },
                ]}
              />
              <AppSectionHeader
                title="Dropdown without search"
                description="AppSelect — short lists, chevron only (no typing)."
                className="pt-2"
              />
              <AppSelect
                id="showcase-priority"
                label="Priority *"
                value={showcasePriority}
                onChange={(e) => setShowcasePriority(e.target.value)}
                placeholder="Select priority…"
                fieldHint="Priority\n\nShort enum — AppSelect (default). Same as Create Request modal below."
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
              <AppSelect
                id="showcase-operator"
                label="Operator"
                value={showcaseOperator}
                onChange={(e) => setShowcaseOperator(e.target.value)}
                placeholder="Select operator…"
                fieldHint="Operator\n\nFilter-style rule operator (Is / Is not) — no search needed."
                options={[
                  { value: 'is', label: 'Is' },
                  { value: 'is_not', label: 'Is not' },
                  { value: 'is_before', label: 'Is before' },
                  { value: 'is_after', label: 'Is after' },
                ]}
              />
              <AppMultiSelect
                id="showcase-departments-multi"
                label="Departments (multi)"
                placeholder="Search departments to add…"
                searchable
                value={showcaseDepartmentsMulti}
                onChange={setShowcaseDepartmentsMulti}
                fieldHint="Departments (multi)\n\nMultiple enums — search in the field, checkboxes in menu, chips below (same as Additional signers / AppUserSelect multiple)."
                options={[
                  { value: 'hr', label: 'Human Resources' },
                  { value: 'operations', label: 'Operations' },
                  { value: 'fleet', label: 'Fleet' },
                  { value: 'estimating', label: 'Estimating' },
                  { value: 'safety', label: 'Safety' },
                ]}
              />
              <AppTextarea
                id="showcase-notes"
                label="Notes"
                placeholder="Write concise internal notes..."
                fieldHint="Notes\n\nVisible to internal staff only; keep factual and action-oriented."
                helperText="Helper text stays visible below the field; fieldHint is hover/focus on ?."
              />
              <AppFileUpload
                mode="multiple"
                value={showcaseAttachments}
                onChange={setShowcaseAttachments}
                accept="image/*,.pdf,.doc,.docx"
                label="Attachments (optional – multiple allowed)"
                fieldHint="Attachments\n\nDrag, click, or Ctrl+V. Same control as Opportunities → Notes → New Note."
              />
              <AppFileUpload
                mode="single"
                value={showcaseAttachment}
                onChange={setShowcaseAttachment}
                label="Single attachment"
                fieldHint="Single file\n\nOne file with preview; non-images show as file row."
              />
            </div>
          </AppCard>

          <AppCard
            title="Modals"
            subtitle="AppModal for confirmations; AppFormModal for create/edit flows. Backdrop uses blur + dim (Task Requests pattern)."
          >
            <p className={uiTypography.body}>
              Import from <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">@/components/ui</code>. Changes
              here propagate everywhere these components are used.
            </p>
            <ul className={uiCx(uiTypography.helper, 'mt-2 list-inside list-disc space-y-1')}>
              <li>
                <strong className="font-semibold text-gray-800">AppFormModal</strong> — scrollable form body, optional{' '}
                <code className="text-[11px]">quickInfo</code> panel toggled via ? next to close. See{' '}
                <strong className="font-semibold text-gray-800">Quick Info</strong> below for copy structure. Wide wizards
                (New Customer, New Opportunity): <code className="text-[11px]">formWidth=&quot;wide&quot;</code>,{' '}
                <code className="text-[11px]">headerExtra</code> for step pills.
              </li>
              <li>
                <strong className="font-semibold text-gray-800">fieldHint</strong> — light ? on a single field;{' '}
                <strong className="font-semibold text-gray-800">Quick Info</strong> — whole-modal help in the side panel;{' '}
                <strong className="font-semibold text-gray-800">AppTooltip</strong> — dark hover on lists and icons
              </li>
            </ul>
            <div className={uiCx('mt-4 flex flex-wrap gap-2', uiLayout.actionsRow)}>
              <AppButton onClick={() => setIsModalOpen(true)} variant="secondary" leftIcon={<ClipboardList className="h-4 w-4" />}>
                Simple modal
              </AppButton>
              <AppButton onClick={() => setIsFormModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
                Form modal — Create Request
              </AppButton>
              <AppButton
                onClick={() => setIsFiltersQuickInfoModalOpen(true)}
                variant="secondary"
                leftIcon={<SlidersHorizontal className="h-4 w-4" />}
              >
                Form modal — Filters
              </AppButton>
            </div>
          </AppCard>

          <AppCard
            title="Quick Info (AppFormModal)"
            subtitle="Standard help copy for the ? panel — user-facing only, four short paragraphs."
          >
            <p className={uiTypography.body}>
              Build copy with{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">formModalQuickInfo()</code> from{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">@/lib/formModalQuickInfo</code>. Highlight
              visible labels with <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">uiLabel()</code>.
            </p>
            <ol className={uiCx(uiTypography.helper, 'mt-3 list-decimal space-y-2 pl-5')}>
              <li>
                <strong className="font-semibold text-gray-800">Purpose</strong> — What this window is for, with one or two
                real examples (e.g. “only projects in progress”).
              </li>
              <li>
                <strong className="font-semibold text-gray-800">How to use</strong> — Steps the user takes; name buttons and
                sections exactly as they appear in the UI.
              </li>
              <li>
                <strong className="font-semibold text-gray-800">Behavior</strong> <span className="text-gray-500">(optional)</span>{' '}
                — Multiple filters, combined rules, what happens after submit, etc.
              </li>
              <li>
                <strong className="font-semibold text-gray-800">Actions</strong> — What {uiLabel('Cancel')}, the primary
                button, and any extras ({uiLabel('Clear All')}, etc.) do.
              </li>
            </ol>
            <div className={uiCx('mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3', uiRadius.control)}>
              <div className={uiTypography.overline}>Do</div>
              <ul className={uiCx(uiTypography.helper, 'mt-1 list-inside list-disc space-y-0.5')}>
                <li>Plain language, short sentences, concrete examples</li>
                <li>Match button and field labels shown in the modal</li>
                <li>
                  Reuse shared copy when the flow is identical (e.g.{' '}
                  <code className="text-[11px]">filtersModalQuickInfo</code>)
                </li>
              </ul>
              <div className={uiCx(uiTypography.overline, 'mt-3')}>Avoid</div>
              <ul className={uiCx(uiTypography.helper, 'mt-1 list-inside list-disc space-y-0.5')}>
                <li>Component names (AppSelect, AppUserSelect, props, tokens)</li>
                <li>Developer jargon (“rules”, “operators”) without explaining them in user terms</li>
                <li>One long paragraph — split into the four blocks above</li>
              </ul>
            </div>
            <pre
              className={uiCx(
                'mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100',
                uiRadius.control,
              )}
            >{`import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';

quickInfo={formModalQuickInfo({
  purpose: <>Use this window to …</>,
  howToUse: <>Tap {uiLabel('Add filter')} to …</>,
  behavior: <>Optional: combined rules, multiple items, …</>,
  actions: <>{uiLabel('Apply')} saves … {uiLabel('Cancel')} closes …</>,
})}`}</pre>
            <p className={uiCx(uiTypography.helper, 'mt-3')}>
              Exported references: <code className="text-[11px]">filtersModalQuickInfo</code>,{' '}
              <code className="text-[11px]">createRequestQuickInfo</code>. Open the demo modals above and toggle ? to
              preview.
            </p>
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

        <AppCard
          title="Page two-column layout"
          subtitle="Schedule and Clock In/Out — equal-height columns via items-stretch + h-full cards."
        >
          <p className={uiCx(uiTypography.helper, 'mb-4')}>
            Use <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">uiLayout.pageTwoColumn</code> (Schedule,
            Clock In/Out) or <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">uiLayout.pageOverview</code>{' '}
            (Overview feed + sidebar; <code className="text-[11px]">items-stretch</code> keeps both columns equal height).
            Stack cards inside the sidebar with{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">uiSpacing.sectionStack</code>; give the primary
            card <code className="text-[11px]">h-full flex flex-col</code>. Do{' '}
            <strong className="font-semibold text-gray-800">not</strong> put{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">space-y-*</code> on the grid wrapper — it
            misaligns column tops.
          </p>
          <div className={uiLayout.pageTwoColumn}>
            <div className={uiSpacing.sectionStack}>
              <div className={uiCx(uiRadius.card, uiBorders.subtle, 'bg-white p-4', uiTypography.helper)}>
                Primary column (e.g. Clock Actions + Today Status)
              </div>
              <div className={uiCx(uiRadius.card, uiBorders.subtle, 'bg-white p-4', uiTypography.helper)}>
                Stacked card in primary column
              </div>
            </div>
            <div className={uiCx(uiRadius.card, uiBorders.subtle, 'bg-white p-4', uiTypography.helper)}>
              Sidebar column (e.g. Weekly Summary) — top aligned with gap-2 from primary
            </div>
          </div>
          <div className={uiCx('mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900', uiRadius.control)}>
            <strong className="font-semibold">Avoid:</strong>{' '}
            <code className="text-[11px]">grid … items-start space-y-3</code> on the two-column wrapper.
          </div>
        </AppCard>

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

      <AppFormModal
        open={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title="Create Request"
        description="Start a conversation that may become a task"
        quickInfo={createRequestQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={() => setIsFormModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={() => setIsFormModalOpen(false)}>
              Create Request
            </AppButton>
          </div>
        }
      >
        <AppInput
          label="Title *"
          placeholder="Short summary"
          fieldHint="Title\n\nA short summary shown in lists and notifications."
        />
        <AppSelect
          label="Priority *"
          placeholder="Select priority…"
          fieldHint={'Priority\n\nShort enum — AppSelect without search (design system default).'}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
          ]}
        />
        <AppTextarea
          label="Description"
          rows={4}
          placeholder="Explain what needs to be done..."
          fieldHint="Description\n\nOptional detail for the recipient before the request becomes a task."
        />
      </AppFormModal>

      <AppFormModal
        open={isFiltersQuickInfoModalOpen}
        onClose={() => setIsFiltersQuickInfoModalOpen(false)}
        title="Filters"
        description="Show only the items that match what you need."
        formWidth="wide"
        quickInfo={filtersModalQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={() => setIsFiltersQuickInfoModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={() => setIsFiltersQuickInfoModalOpen(false)}>
              Apply Filters
            </AppButton>
          </div>
        }
      >
        <p className={uiTypography.helper}>
          Demo shell only — full filter UI lives on Projects / Opportunities. Toggle ? to preview standard Quick Info
          copy.
        </p>
      </AppFormModal>
    </main>
  );
}
