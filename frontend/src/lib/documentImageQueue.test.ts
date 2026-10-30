import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDocumentImageQueueForTests, watchDocumentImage } from '@/lib/documentImageQueue';

type FakeImage = {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
};

const created: FakeImage[] = [];

class FakeImageCtor {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';

  constructor() {
    created.push(this);
  }
}

describe('documentImageQueue', () => {
  beforeEach(() => {
    resetDocumentImageQueueForTests();
    created.length = 0;
    vi.stubGlobal('Image', FakeImageCtor);
  });

  afterEach(() => {
    resetDocumentImageQueueForTests();
    created.length = 0;
    vi.unstubAllGlobals();
  });

  it('loads at most three thumbnails at a time', async () => {
    const urls = ['/a', '/b', '/c', '/d', '/e'].map((id) => `https://hub.test${id}`);
    const pending = urls.map((url) => watchDocumentImage(url).promise);

    expect(created).toHaveLength(3);
    expect(created.map((img) => img.src)).toEqual(urls.slice(0, 3));

    created[0].onload?.();
    await Promise.resolve();

    expect(created).toHaveLength(4);
    expect(created[3].src).toBe(urls[3]);

    created[1].onload?.();
    created[2].onerror?.();
    await Promise.resolve();
    created[3].onload?.();
    await Promise.resolve();
    created[4].onload?.();

    await expect(Promise.all(pending)).resolves.toEqual(['ok', 'ok', 'error', 'ok', 'ok']);
  });

  it('does not start a thumbnail that was cancelled while waiting', () => {
    const first = watchDocumentImage('https://hub.test/keep');
    const second = watchDocumentImage('https://hub.test/drop');
    const third = watchDocumentImage('https://hub.test/also');
    const fourth = watchDocumentImage('https://hub.test/later');
    fourth.cancel();

    expect(created.map((img) => img.src)).toEqual([
      'https://hub.test/keep',
      'https://hub.test/drop',
      'https://hub.test/also',
    ]);

    first.cancel();
    second.cancel();
    third.cancel();
  });
});
