import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AppCard, uiCx, uiTypography } from '@/components/ui';

export type TutorialTocItem = {
  id: string;
  title: string;
};

export type TutorialGuideEntry = {
  id: string;
  title: string;
};

type TutorialTocProps = {
  tutorials: TutorialGuideEntry[];
  activeTutorialId: string;
  sections: TutorialTocItem[];
  onOpenTutorial: (tutorialId: string) => void;
};

function sectionDomId(sectionId: string) {
  return `tutorial-section-${sectionId}`;
}

export function TutorialToc({
  tutorials,
  activeTutorialId,
  sections,
  onOpenTutorial,
}: TutorialTocProps) {
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? '');
  const firstSectionId = sections[0]?.id ?? '';

  const goToSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    const el = document.getElementById(sectionDomId(sectionId));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    setActiveSectionId(firstSectionId);
  }, [activeTutorialId, firstSectionId]);

  useEffect(() => {
    if (!sections.length || activeTutorialId === '') return;

    const elements = sections
      .map((item) => document.getElementById(sectionDomId(item.id)))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        const top = visible[0];
        if (top?.target?.id) {
          const id = top.target.id.replace(/^tutorial-section-/, '');
          setActiveSectionId(id);
        }
      },
      {
        root: null,
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [activeTutorialId, sections]);

  if (!tutorials.length) return null;

  return (
    <aside className="mb-4 lg:sticky lg:top-5 lg:z-10 lg:mb-0 lg:self-start">
      <AppCard
        className="max-h-[calc(100vh-10rem)] overflow-hidden"
        title="Guide"
        bodyClassName="!p-0"
      >
        <nav
          aria-label="Guide"
          className="max-h-[min(70vh,640px)] overflow-y-auto overscroll-contain p-2"
        >
          <ul className="space-y-0.5">
            {tutorials.map((guide) => {
              const open = guide.id === activeTutorialId;
              return (
                <li key={guide.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => onOpenTutorial(guide.id)}
                    className={uiCx(
                      'flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      open
                        ? 'font-semibold text-gray-900'
                        : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 leading-snug">{guide.title}</span>
                  </button>
                  {open && sections.length > 0 ? (
                    <ul className="mb-1 ml-3 space-y-0.5 border-l border-gray-200 pl-1.5">
                      {sections.map((item, index) => {
                        const active = item.id === activeSectionId;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => goToSection(item.id)}
                              className={uiCx(
                                'flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                active
                                  ? 'bg-brand-red/8 font-semibold text-brand-red'
                                  : 'text-gray-700 hover:bg-gray-50',
                              )}
                            >
                              <span
                                className={uiCx(
                                  'w-5 shrink-0 tabular-nums text-xs',
                                  active ? 'text-brand-red/70' : 'text-gray-400',
                                )}
                              >
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <span className={uiCx('min-w-0 flex-1 leading-snug', uiTypography.body)}>
                                {item.title}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>
      </AppCard>
    </aside>
  );
}
