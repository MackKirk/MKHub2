import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canAccessTutorial,
  getTutorial,
  listAccessibleTutorialGroups,
  listAccessibleTutorials,
  tutorialPath,
} from './registry';
import { isTutorialSeen, markTutorialSeen } from './progress';
import { OPPORTUNITIES_LIST_TUTORIAL_ID } from './content/opportunitiesList';
import { carouselShouldAutoplay, carouselShowsControls } from './carousel';
import { fittedTutorialFrame, frameAfterDrag, frameAfterWheel, tutorialVideoPlaybackStyle } from './frame';
import { resolveTutorialSectionMedia } from './resolveTutorialMedia';
import { renderTutorialMarkdown, tutorialMarkdownToHtml } from './markdown';

const CONSTRUCTION_SECTION = 'business:construction:projects:files:read';
const REPAIRS_SECTION = 'business:rm:projects:files:read';

vi.mock('@/lib/api', () => ({
  withFileAccessTokenIfNeeded: (url: string) => `${url}?access_token=test`,
}));

describe('tutorials registry', () => {
  it('returns opportunities.list metadata without embedded JSX sections', () => {
    const tutorial = getTutorial(OPPORTUNITIES_LIST_TUTORIAL_ID);
    expect(tutorial).toBeDefined();
    expect(tutorial?.title).toBe('Opportunities');
    expect(tutorial?.summary).toMatch(/pipeline|convert|bids/i);
    expect(tutorial?.category).toEqual({ id: 'production', label: 'Production' });
    expect(tutorial?.access).toEqual({
      kind: 'anyProjectLine',
      lines: ['construction', 'repairs'],
    });
    expect((tutorial as { sections?: unknown })?.sections).toBeUndefined();
  });

  it('returns undefined for unknown ids', () => {
    expect(getTutorial('does.not.exist')).toBeUndefined();
  });

  it('builds tutorial paths', () => {
    expect(tutorialPath(OPPORTUNITIES_LIST_TUTORIAL_ID)).toBe('/tutorials/opportunities.list');
  });
});

describe('tutorials access', () => {
  const tutorial = getTutorial(OPPORTUNITIES_LIST_TUTORIAL_ID)!;

  it('allows construction-only users', () => {
    expect(canAccessTutorial(tutorial, new Set([CONSTRUCTION_SECTION]), false)).toBe(true);
  });

  it('allows repairs-only users', () => {
    expect(canAccessTutorial(tutorial, new Set([REPAIRS_SECTION]), false)).toBe(true);
  });

  it('denies users with neither line', () => {
    expect(canAccessTutorial(tutorial, new Set(['fleet:access']), false)).toBe(false);
    expect(listAccessibleTutorials(new Set(['fleet:access']), false)).toEqual([]);
    expect(listAccessibleTutorialGroups(new Set(['fleet:access']), false)).toEqual([]);
  });

  it('allows admins regardless of permissions', () => {
    expect(canAccessTutorial(tutorial, new Set(), true)).toBe(true);
  });

  it('groups accessible tutorials by category', () => {
    const groups = listAccessibleTutorialGroups(new Set([CONSTRUCTION_SECTION]), false);
    expect(groups).toHaveLength(1);
    expect(groups[0].category.id).toBe('production');
    expect(groups[0].tutorials.map((t) => t.id)).toEqual([OPPORTUNITIES_LIST_TUTORIAL_ID]);
  });
});

describe('resolveTutorialSectionMedia', () => {
  const fallback = {
    type: 'image' as const,
    src: '/tutorials/opportunities/toolbar-views.webp',
    alt: 'Toolbar',
  };

  it('uses static fallback when no override', () => {
    const resolved = resolveTutorialSectionMedia('views', fallback, {});
    expect(resolved).toEqual({
      id: 'static',
      src: '/tutorials/opportunities/toolbar-views.webp',
      alt: 'Toolbar',
      caption: null,
      kind: 'image',
      isOverride: false,
    });
  });

  it('prefers API override and tags video by content type', () => {
    const resolved = resolveTutorialSectionMedia('views', fallback, {
      views: {
        file_id: 'abc',
        content_type: 'video/webm',
        url: '/files/abc',
      },
    });
    expect(resolved?.isOverride).toBe(true);
    expect(resolved?.kind).toBe('video');
    expect(resolved?.src).toContain('/files/abc');
    expect(resolved?.src).toContain('access_token=test');
  });

  it('returns null when neither override nor fallback', () => {
    expect(resolveTutorialSectionMedia('views', undefined, {})).toBeNull();
  });
});

describe('tutorial media carousel', () => {
  it('hides carousel chrome for a single slide', () => {
    expect(carouselShowsControls(0)).toBe(false);
    expect(carouselShowsControls(1)).toBe(false);
    expect(carouselShowsControls(2)).toBe(true);
    expect(
      carouselShouldAutoplay({
        count: 1,
        kind: 'image',
        paused: false,
        hovered: false,
        focused: false,
        reducedMotion: false,
      }),
    ).toBe(false);
  });

  it('exposes next for two slides and skips autoplay when reduced motion is on', () => {
    expect(carouselShowsControls(2)).toBe(true);
    expect(
      carouselShouldAutoplay({
        count: 2,
        kind: 'image',
        paused: false,
        hovered: false,
        focused: false,
        reducedMotion: true,
      }),
    ).toBe(false);
    expect(
      carouselShouldAutoplay({
        count: 2,
        kind: 'image',
        paused: false,
        hovered: false,
        focused: false,
        reducedMotion: false,
      }),
    ).toBe(true);
    expect(
      carouselShouldAutoplay({
        count: 2,
        kind: 'video',
        paused: false,
        hovered: false,
        focused: false,
        reducedMotion: false,
      }),
    ).toBe(false);
  });
});

describe('tutorial media frame', () => {
  const start = { frameX: 50, frameY: 0, frameZoom: 1 };

  it('moves the focal point from a drag and clamps the edge', () => {
    const next = frameAfterDrag(start, 100, 0, 200, 100);
    expect(next.frameX).toBe(0);
    expect(next.frameY).toBe(0);
    expect(next.frameZoom).toBe(1);
    const past = frameAfterDrag(next, 50, -40, 200, 100);
    expect(past.frameX).toBe(0);
    expect(past.frameY).toBe(40);
  });

  it('zooms toward the pointer and stops at the cap', () => {
    const zoomed = frameAfterWheel(start, -1, 80, 40);
    expect(zoomed.frameZoom).toBeCloseTo(1.12);
    expect(zoomed.frameX).toBeGreaterThan(50);
    expect(zoomed.frameY).toBeGreaterThan(0);
    const capped = frameAfterWheel({ frameX: 50, frameY: 0, frameZoom: 3 }, -1, 10, 10);
    expect(capped.frameZoom).toBe(3);
    expect(capped.frameX).toBe(50);
    const zoomedOut = frameAfterWheel(start, 1, 10, 10);
    expect(zoomedOut.frameZoom).toBeCloseTo(0.88);
    const floor = frameAfterWheel({ frameX: 50, frameY: 0, frameZoom: 0.1 }, 1, 10, 10);
    expect(floor.frameZoom).toBe(0.1);
  });

  it('fits the whole picture in the frame', () => {
    expect(fittedTutorialFrame(16 / 9)).toEqual({ frameX: 50, frameY: 50, frameZoom: 1 });
    const wide = fittedTutorialFrame(32 / 9);
    expect(wide.frameX).toBe(50);
    expect(wide.frameY).toBe(50);
    expect(wide.frameZoom).toBeCloseTo(0.5);
  });

  it('keeps the video element box fixed so the native bar stays in the frame', () => {
    expect(tutorialVideoPlaybackStyle(start)).toEqual({ objectPosition: '50% 0%' });
    const zoomed = tutorialVideoPlaybackStyle({ frameX: 50, frameY: 0, frameZoom: 2 });
    expect(zoomed.objectViewBox).toBe('inset(0% 25% 50% 25%)');
    const out = tutorialVideoPlaybackStyle({ frameX: 50, frameY: 0, frameZoom: 0.5 });
    expect(out.objectViewBox).toBe('inset(0% -50% -100% -50%)');
  });
});

describe('tutorial markdown', () => {
  it('renders lists and bold safely', () => {
    const html = tutorialMarkdownToHtml('- Use **Convert to Project**\n- Second');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>Convert to Project</strong>');
    expect(renderTutorialMarkdown('Hello <script>alert(1)</script>')).not.toContain('<script>');
  });
});

describe('tutorials progress', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    });
  });

  it('marks and reads seen state', () => {
    expect(isTutorialSeen(OPPORTUNITIES_LIST_TUTORIAL_ID)).toBe(false);
    markTutorialSeen(OPPORTUNITIES_LIST_TUTORIAL_ID);
    expect(isTutorialSeen(OPPORTUNITIES_LIST_TUTORIAL_ID)).toBe(true);
  });
});
