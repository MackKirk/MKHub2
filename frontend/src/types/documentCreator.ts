/** Element that can be placed on a document page (Canva-style) */
export type DocElement = {
  id: string;
  type: 'text' | 'image' | 'block';
  /** For text: the text content. For image: file_id (UUID string), empty = placeholder. Ignored for block. */
  content: string;
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
  /** Text only */
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
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
    content: 'New text',
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

/** Empty image area: user can add/replace image later or delete. */
export function createImagePlaceholder(): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'image',
    content: '',
    x_pct: 10,
    y_pct: 35,
    width_pct: 40,
    height_pct: 25,
  };
}

/** Blocking area: nothing else can be placed here (e.g. margin or background zone). */
export function createBlockElement(): DocElement {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'block',
    content: '',
    x_pct: 5,
    y_pct: 5,
    width_pct: 20,
    height_pct: 10,
  };
}
