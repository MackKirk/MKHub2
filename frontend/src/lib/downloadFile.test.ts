import { describe, expect, it } from 'vitest';
import { buildZipStore, uniqueZipEntryNames } from '@/lib/downloadFile';

describe('uniqueZipEntryNames', () => {
  it('keeps unique names and suffixes duplicates', () => {
    expect(uniqueZipEntryNames(['roof.jpg', 'notes.pdf', 'roof.jpg', 'roof.jpg'])).toEqual([
      'roof.jpg',
      'notes.pdf',
      'roof (2).jpg',
      'roof (3).jpg',
    ]);
  });
});

describe('buildZipStore', () => {
  it('writes a ZIP local header signature', () => {
    const zip = buildZipStore([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]);
    expect(String.fromCharCode(zip[0], zip[1], zip[2], zip[3])).toBe('PK\u0003\u0004');
    expect(zip.length).toBeGreaterThan(30);
  });
});
