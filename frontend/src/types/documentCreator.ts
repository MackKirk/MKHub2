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
  /** Vertical alignment within the text box */
  verticalAlign?: 'top' | 'center' | 'bottom';
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  /** Font family: Montserrat or Open Sans */
  fontFamily?: 'Montserrat' | 'Open Sans';
  /** Text color (hex, e.g. #000000) */
  color?: string;
  /** Image only: how the image fits inside its box (CSS object-fit) */
  imageFit?: 'contain' | 'cover' | 'fill' | 'none';
  /** Image only: where the image is anchored inside its box (CSS object-position, e.g. "50% 50%") */
  imagePosition?: string;
  /** When true, element cannot be moved, resized, or edited until unlocked */
  locked?: boolean;
};

/** Content area margins (percent). Elements cannot be placed outside. */
export type PageMargins = {
  left_pct?: number;
  right_pct?: number;
  top_pct?: number;
  bottom_pct?: number;
};

/** Page in the document: background (template) + optional margins + elements */
export type DocumentPage = {
  template_id: string | null;
  /** Margins for this page (content area). Defined on the document, not the template. */
  margins?: PageMargins | null;
  /** Libre elements (text, image, image placeholder, block) */
  elements?: DocElement[];
  /** Legacy: template areas + content (for backward compat) */
  areas_content?: Record<string, string>;
};

export const DOCUMENT_EDITOR_FONTS = ['Montserrat', 'Open Sans'] as const;
export type DocumentEditorFont = (typeof DOCUMENT_EDITOR_FONTS)[number];

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
    fontFamily: 'Montserrat',
    fontWeight: 'bold',
    color: '#000000',
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
