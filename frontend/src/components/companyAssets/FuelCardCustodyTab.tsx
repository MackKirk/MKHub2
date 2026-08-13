import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type AssignmentRow = {
  id: string;
  assigned_to_user_id: string;
  assigned_at: string;
  returned_at?: string | null;
  assigned_to_name?: string | null;
  notes?: string | null;
  notes_in?: string | null;
  reason_out?: string | null;
  reason_in?: string | null;
  is_active: boolean;
};

type Props = {
  activeAssignment: AssignmentRow | undefined;
  assignments: AssignmentRow[];
};

export function FuelCardCustodyTab({ activeAssignment, assignments }: Props) {
  return (
    <div className={uiSpacing.sectionStack}>
      <AppCard>
        <AppSectionHeader
          title="Current custody"
          description="Who currently holds this fuel card. Use Assign or Return on the hero to update custody."
          {...appSectionPresetProps('employment')}
        />
        {activeAssignment ? (
          <>
            <p className={uiCx(uiTypography.sectionTitle, 'mt-4 text-gray-900')}>
              {activeAssignment.assigned_to_name || activeAssignment.assigned_to_user_id}
            </p>
            <p className={uiCx(uiTypography.helper, 'mt-1')}>
              Assigned {new Date(activeAssignment.assigned_at).toLocaleString()}
            </p>
            {activeAssignment.reason_out?.trim() ? (
              <p className={uiCx(uiTypography.helper, 'mt-1')}>Reason: {activeAssignment.reason_out.trim()}</p>
            ) : null}
          </>
        ) : (
          <p className={uiCx(uiTypography.helper, 'mt-4')}>Available — not assigned to anyone.</p>
        )}
      </AppCard>

      <AppCard bodyClassName="!p-0">
        <div className={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Custody history"
            description="Who held the physical card and when it was returned."
            {...appSectionPresetProps('notesHistory')}
          />
        </div>
        {assignments.length === 0 ? (
          <div className={uiCx(uiSpacing.cardPadding, 'border-t border-gray-100 pt-0')}>
            <AppEmptyState
              title="No assignments yet"
              description="Use Assign on the hero when someone receives the card."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {assignments.map((a) => (
              <li
                key={a.id}
                className={uiCx(
                  uiLayout.actionsRow,
                  'flex-wrap items-start justify-between gap-3 px-4 py-4 transition-colors hover:bg-gray-50/80 sm:px-5',
                )}
              >
                <div className="min-w-0">
                  <p className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>
                    {a.assigned_to_name || a.assigned_to_user_id}
                  </p>
                  <p className={uiCx(uiTypography.helper, 'mt-1')}>
                    Out {new Date(a.assigned_at).toLocaleString()}
                    {a.returned_at
                      ? ` · Returned ${new Date(a.returned_at).toLocaleString()}`
                      : ' · Still active'}
                  </p>
                  {a.reason_out?.trim() ? (
                    <p className={uiCx(uiTypography.helper, 'mt-1')}>Assign reason: {a.reason_out.trim()}</p>
                  ) : null}
                  {a.notes?.trim() ? (
                    <p className={uiCx(uiTypography.body, 'mt-2 whitespace-pre-wrap text-gray-600')}>{a.notes.trim()}</p>
                  ) : null}
                  {a.reason_in?.trim() ? (
                    <p className={uiCx(uiTypography.helper, 'mt-1')}>Return reason: {a.reason_in.trim()}</p>
                  ) : null}
                  {a.notes_in?.trim() ? (
                    <p className={uiCx(uiTypography.body, 'mt-1 whitespace-pre-wrap text-gray-600')}>{a.notes_in.trim()}</p>
                  ) : null}
                </div>
                <AppBadge variant={a.is_active ? 'info' : 'neutral'} className="shrink-0 !normal-case">
                  {a.is_active ? 'Active' : 'Closed'}
                </AppBadge>
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </div>
  );
}
