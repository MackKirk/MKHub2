import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/api';
import { canAccessProjectLineMenu, isAdminRole } from '@/lib/projectLinePermissionKeys';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppButton,
  AppCard,
  AppPageHeader,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { TutorialSectionCard } from '@/features/tutorials/TutorialSectionCard';
import { TutorialToc } from '@/features/tutorials/TutorialToc';
import { canAccessTutorial, getTutorial, listAccessibleTutorials, tutorialPath } from '@/features/tutorials/registry';
import { markTutorialSeen } from '@/features/tutorials/progress';
import { useTutorialMediaSlots } from '@/features/tutorials/useTutorialMediaSlots';
import {
  useTutorialContent,
  useUnhideTutorialSection,
} from '@/features/tutorials/useTutorialContent';
import { OPPORTUNITIES_LIST_TUTORIAL_ID } from '@/features/tutorials/content/opportunitiesList';

const EDIT_GUIDE_KEY = 'tutorial-edit-guide';

function opportunitiesCta(permissions: Set<string>, isAdmin: boolean) {
  const construction = canAccessProjectLineMenu(permissions, 'construction', isAdmin);
  const repairs = canAccessProjectLineMenu(permissions, 'repairs', isAdmin);
  if (repairs && !construction) {
    return {
      href: '/rm-opportunities',
      label: 'Open Opportunities',
      hint: 'Opens Repairs & Maintenance Opportunities.',
    };
  }
  return {
    href: '/opportunities',
    label: 'Open Opportunities',
    hint: repairs
      ? 'Opens Construction Opportunities. Use Repairs & Maintenance in the menu for the R&M list.'
      : 'Open the Opportunities list to put this guide into practice.',
  };
}

function readEditGuide(): boolean {
  try {
    return sessionStorage.getItem(EDIT_GUIDE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function TutorialDetail() {
  const { tutorialId: rawId } = useParams<{ tutorialId: string }>();
  const tutorialId = rawId ? decodeURIComponent(rawId) : '';
  const navigate = useNavigate();
  const navigateBack = useNavigateBack('/tutorials');
  const confirm = useConfirm();

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 60_000,
  });
  const permissions = useMemo(
    () => new Set<string>(Array.isArray(me?.permissions) ? me.permissions.map(String) : []),
    [me?.permissions],
  );
  const isAdmin = isAdminRole(me?.roles);

  const tutorial = tutorialId ? getTutorial(tutorialId) : undefined;
  const allowed = Boolean(tutorial && canAccessTutorial(tutorial, permissions, isAdmin));

  const { data: content, isLoading: contentLoading } = useTutorialContent(tutorial?.id, allowed);
  const { data: slotsPayload } = useTutorialMediaSlots(tutorial?.id, allowed);
  const unhide = useUnhideTutorialSection(tutorial?.id || '');

  const sections = content?.sections ?? [];
  const hiddenSections = content?.hidden_sections ?? [];
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);

  const tocItems = useMemo(
    () => sections.map((s) => ({ id: s.id, title: s.title })),
    [sections],
  );

  const guideTutorials = useMemo(() => {
    const accessible = listAccessibleTutorials(permissions, isAdmin).map((item) => ({
      id: item.id,
      title: item.title,
    }));
    if (tutorial && !accessible.some((item) => item.id === tutorial.id)) {
      accessible.unshift({ id: tutorial.id, title: tutorial.title });
    }
    return accessible;
  }, [permissions, isAdmin, tutorial]);

  const cta = useMemo(() => {
    if (tutorial?.id !== OPPORTUNITIES_LIST_TUTORIAL_ID) return null;
    return opportunitiesCta(permissions, isAdmin);
  }, [tutorial?.id, permissions, isAdmin]);

  const [editGuide, setEditGuide] = useState(readEditGuide);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const editMode = Boolean(isAdmin && editGuide);

  const setEditGuidePersisted = (on: boolean) => {
    setEditGuide(on);
    try {
      sessionStorage.setItem(EDIT_GUIDE_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!on) {
      setEditingSectionId(null);
      setIsDirty(false);
    }
  };

  const prepareAction = useCallback(async () => {
    if (!editingSectionId || !isDirty) return true;
    const result = await confirm({
      title: 'Discard unsaved changes?',
      message: 'You have unsaved edits on another step. Discard them to continue?',
      confirmText: 'Discard',
      cancelText: 'Keep editing',
    });
    if (result !== 'confirm') return false;
    setEditingSectionId(null);
    setIsDirty(false);
    return true;
  }, [confirm, editingSectionId, isDirty]);

  const openTutorial = useCallback(
    async (nextId: string) => {
      if (!tutorial || nextId === tutorial.id) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const ok = await prepareAction();
      if (!ok) return;
      navigate(tutorialPath(nextId));
    },
    [navigate, prepareAction, tutorial],
  );

  const requestEdit = useCallback(
    async (sectionId: string) => {
      if (editingSectionId === sectionId) return true;
      const ok = await prepareAction();
      if (!ok) return false;
      setEditingSectionId(sectionId);
      setIsDirty(false);
      return true;
    },
    [editingSectionId, prepareAction],
  );

  const stopEdit = useCallback(() => {
    setEditingSectionId(null);
    setIsDirty(false);
  }, []);

  const onAddedBelow = useCallback((newSectionId: string) => {
    setEditingSectionId(newSectionId);
    setIsDirty(false);
    window.setTimeout(() => {
      document
        .getElementById(`tutorial-section-${newSectionId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  const onDirtyChange = useCallback(
    (dirty: boolean) => {
      setIsDirty(dirty);
    },
    [],
  );

  useEffect(() => {
    if (allowed && tutorial) markTutorialSeen(tutorial.id);
  }, [allowed, tutorial]);

  useEffect(() => {
    if (!editMode) {
      setEditingSectionId(null);
      setIsDirty(false);
    }
  }, [editMode]);

  if (!isLoading && (!tutorial || !allowed)) {
    return <Navigate to="/tutorials" replace />;
  }

  if (isLoading || !tutorial || (allowed && contentLoading && !content)) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Tutorial"
          subtitle="Loading…"
          icon={<BookOpen className="h-4 w-4" />}
          onBack={navigateBack}
          backLabel="Back to tutorials"
        />
      </div>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={tutorial.title}
        subtitle={tutorial.summary}
        icon={<BookOpen className="h-4 w-4" />}
        onBack={navigateBack}
        backLabel="Back to tutorials"
        actions={
          isAdmin ? (
            <AppButton
              type="button"
              variant={editGuide ? 'primary' : 'secondary'}
              size="sm"
              leftIcon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => void (async () => {
                if (editGuide) {
                  const ok = await prepareAction();
                  if (!ok) return;
                  setEditGuidePersisted(false);
                } else {
                  setEditGuidePersisted(true);
                }
              })()}
            >
              {editGuide ? 'Done editing' : 'Edit guide'}
            </AppButton>
          ) : undefined
        }
      />

      <div className="w-full min-w-0">
        <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-5">
          <TutorialToc
            tutorials={guideTutorials}
            activeTutorialId={tutorial.id}
            sections={tocItems}
            onOpenTutorial={(id) => void openTutorial(id)}
          />

          <div className="min-w-0 space-y-6">
            {sections.map((section) => (
              <TutorialSectionCard
                key={section.id}
                tutorialId={tutorial.id}
                section={section}
                sectionIds={sectionIds}
                slots={slotsPayload?.slots}
                editMode={editMode}
                isEditing={editingSectionId === section.id}
                onPrepareAction={prepareAction}
                onRequestEdit={() => requestEdit(section.id)}
                onStopEdit={stopEdit}
                onAddedBelow={onAddedBelow}
                onDirtyChange={
                  editingSectionId === section.id ? onDirtyChange : () => undefined
                }
              />
            ))}

            {editMode && hiddenSections.length > 0 ? (
              <AppCard bodyClassName="!p-5 sm:!p-6">
                <h2 className={uiCx(uiTypography.sectionTitle, 'text-gray-900')}>Hidden steps</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Restore a seed step you previously hid from this guide.
                </p>
                <ul className="mt-4 space-y-2">
                  {hiddenSections.map((h) => (
                    <li
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <span className="text-sm font-medium text-gray-800">{h.title}</span>
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={unhide.isPending}
                        onClick={() =>
                          void (async () => {
                            try {
                              await unhide.mutateAsync(h.id);
                              toast.success('Step restored');
                            } catch (err) {
                              const msg =
                                err instanceof ApiError
                                  ? err.message
                                  : err instanceof Error
                                    ? err.message
                                    : 'Could not restore step';
                              toast.error(msg || 'Could not restore step');
                            }
                          })()
                        }
                      >
                        Restore
                      </AppButton>
                    </li>
                  ))}
                </ul>
              </AppCard>
            ) : null}

            {cta ? (
              <AppCard bodyClassName="!p-5 sm:!p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <h2 className={uiCx(uiTypography.sectionTitle, 'text-gray-900')}>Ready to practice?</h2>
                    <p className="text-[15px] leading-relaxed text-gray-600">{cta.hint}</p>
                  </div>
                  <AppButton
                    type="button"
                    variant="primary"
                    className="shrink-0"
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                    onClick={() => navigate(cta.href)}
                  >
                    {cta.label}
                  </AppButton>
                </div>
              </AppCard>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
