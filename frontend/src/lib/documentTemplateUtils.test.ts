import { describe, expect, it } from 'vitest';
import type { DocumentTypePreset } from '@/components/DocumentTypePicker';
import type { DocumentPage } from '@/types/documentCreator';
import {
  filterPagesByIndices,
  getTemplatePageCount,
  getTemplateSelectionModalCopy,
  isMultiPageTemplate,
  pageLabel,
} from '@/lib/documentTemplateUtils';
import { buildDocumentCreatePayload } from '@/lib/documentCreateScope';

const multiPageType: DocumentTypePreset = {
  id: 'type-1',
  name: 'Cladding Contract',
  category: 'Contracts',
  page_templates: [
    { template_id: 't1', label: 'Cover' },
    { template_id: 't2', label: '' },
    { template_id: 't3', label: 'Terms' },
  ],
};

describe('documentTemplateUtils', () => {
  it('counts template pages', () => {
    expect(getTemplatePageCount(multiPageType)).toBe(3);
    expect(isMultiPageTemplate(multiPageType)).toBe(true);
    expect(isMultiPageTemplate({ ...multiPageType, page_templates: [multiPageType.page_templates![0]] })).toBe(false);
  });

  it('uses custom page labels when present', () => {
    expect(pageLabel(multiPageType, 0)).toBe('Cover');
    expect(pageLabel(multiPageType, 1)).toBe('Page 2');
    expect(pageLabel(multiPageType, 2)).toBe('Terms');
  });

  it('filters expanded pages by selected indices in order', () => {
    const pages: DocumentPage[] = [
      { template_id: 'a', elements: [] },
      { template_id: 'b', elements: [] },
      { template_id: 'c', elements: [] },
    ];
    expect(filterPagesByIndices(pages, [2, 0])).toEqual([
      { template_id: 'a', elements: [] },
      { template_id: 'c', elements: [] },
    ]);
  });
});

describe('getTemplateSelectionModalCopy', () => {
  it('returns options copy with template name', () => {
    const copy = getTemplateSelectionModalCopy('options', 'create', {
      templateName: 'Cladding Contract',
      pageCount: 9,
    });
    expect(copy.title).toBe('How do you want to use this template?');
    expect(copy.description).toContain('Cladding Contract');
    expect(copy.description).toContain('9');
  });

  it('returns pages copy for add mode', () => {
    const copy = getTemplateSelectionModalCopy('pages', 'add', { templateName: 'Offer' });
    expect(copy.title).toBe('Select pages');
    expect(copy.description).toContain('Offer');
  });

  it('returns grid copy for create mode', () => {
    const copy = getTemplateSelectionModalCopy('grid', 'create');
    expect(copy.title).toBe('Choose layout');
  });
});

describe('buildDocumentCreatePayload preset subset', () => {
  it('includes pages when preset selection carries a subset', () => {
    const pages: DocumentPage[] = [
      { template_id: 't1', elements: [{ type: 'text', content: 'Hi' }] },
      { template_id: 't2', elements: [] },
    ];
    const payload = buildDocumentCreatePayload(
      { kind: 'preset', documentTypeId: 'type-1', pages },
      { kind: 'project', projectId: 'proj-1' },
    );
    expect(payload.document_type_id).toBe('type-1');
    expect(payload.pages).toHaveLength(2);
    expect(payload.pages?.[0].template_id).toBe('t1');
    expect(payload.pages?.[0].elements).toHaveLength(1);
  });

  it('omits pages for full preset (backend expands)', () => {
    const payload = buildDocumentCreatePayload(
      { kind: 'preset', documentTypeId: 'type-1' },
      { kind: 'project', projectId: 'proj-1' },
    );
    expect(payload.document_type_id).toBe('type-1');
    expect(payload.pages).toBeUndefined();
  });
});
