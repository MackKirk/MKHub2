/** Element that can be placed on a document page (Canva-style) */
export type DocElement = {
  id: string;
  type: 'text' | 'image';
  /** For text: the text content. For image: file_id (UUID string) */
  content: string;
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
  fontSize?: number;
};

/** Page in the document: background + libre elements */
export type DocumentPage = {
  template_id: string | null;
  /** New format: libre elements (text, image) */
  elements?: DocElement[];
  /** Legacy: template areas + content (for backward compat) */
  areas_content?: Record<string, string>;
};

export function createTextElement(): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'text',
    content: 'Novo texto',
    x_pct: 10,
    y_pct: 20,
    width_pct: 80,
    height_pct: 8,
    fontSize: 12,
  };
}

export function createImageElement(fileId: string): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'image',
    content: fileId,
    x_pct: 10,
    y_pct: 30,
    width_pct: 40,
    height_pct: 25,
  };
}
