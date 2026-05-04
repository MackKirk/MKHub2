import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { LessonImage } from '@/pages/training/lessonImageExtension';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Youtube from '@tiptap/extension-youtube';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { CommunityEditorColorToolbar } from '@/components/community/CommunityEditorColorToolbar';
import {
  CommunityMention,
  createMentionSuggestionRender,
  fetchMentionItems,
} from '@/components/community/communityEditorMentions';
import '@/pages/training/LessonRichTextEditor.css';

async function uploadCommunityPhotoFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('original_name', file.name);
  formData.append('content_type', file.type || 'application/octet-stream');
  formData.append('project_id', '');
  formData.append('client_id', '');
  formData.append('employee_id', '');
  formData.append('category_id', 'community-photo');

  const conf = await api<{ id?: string }>('POST', '/files/upload-proxy', formData);
  if (!conf || !conf.id) {
    throw new Error('Invalid upload response');
  }
  return conf.id;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
  className = '',
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center px-2 py-1 text-xs rounded border transition-colors ${
        active ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/** Word-style align icons (three horizontal bars). */
function AlignIconLeft() {
  return (
    <svg className="h-3.5 w-4 shrink-0" viewBox="0 0 16 14" aria-hidden>
      <rect x="0" y="1" width="14" height="1.65" rx="0.3" fill="currentColor" />
      <rect x="0" y="6.2" width="9" height="1.65" rx="0.3" fill="currentColor" />
      <rect x="0" y="11.35" width="11" height="1.65" rx="0.3" fill="currentColor" />
    </svg>
  );
}

function AlignIconCenter() {
  return (
    <svg className="h-3.5 w-4 shrink-0" viewBox="0 0 16 14" aria-hidden>
      <rect x="1" y="1" width="14" height="1.65" rx="0.3" fill="currentColor" />
      <rect x="4" y="6.2" width="8" height="1.65" rx="0.3" fill="currentColor" />
      <rect x="2.5" y="11.35" width="11" height="1.65" rx="0.3" fill="currentColor" />
    </svg>
  );
}

function AlignIconRight() {
  return (
    <svg className="h-3.5 w-4 shrink-0" viewBox="0 0 16 14" aria-hidden>
      <rect x="2" y="1" width="14" height="1.65" rx="0.3" fill="currentColor" />
      <rect x="7" y="6.2" width="9" height="1.65" rx="0.3" fill="currentColor" />
      <rect x="5" y="11.35" width="11" height="1.65" rx="0.3" fill="currentColor" />
    </svg>
  );
}

/** Curved arrow icons (Word-style undo / redo). */
function UndoIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <polyline
        points="1 4 1 10 7 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <polyline
        points="23 4 23 10 17 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  editorKey: string;
  initialHtml: string;
  onChangeHtml: (html: string) => void;
  onEditorReady?: (editor: Editor | null) => void;
  placeholder?: string;
  className?: string;
};

export default function CommunityPostRichTextEditor({
  editorKey,
  initialHtml,
  onChangeHtml,
  onEditorReady,
  placeholder = 'Write your announcement…',
  className = '',
}: Props) {
  const onChangeHtmlRef = useRef(onChangeHtml);
  onChangeHtmlRef.current = onChangeHtml;
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkDialogRef = useRef<HTMLDialogElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const insertImageFromFile = useCallback(async (file: File | null, dropPos?: number | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const ed = editorRef.current;
    if (!ed) return;
    try {
      const id = await uploadCommunityPhotoFile(file);
      /* Path only — LessonImage node view adds access_token for display; sanitizer keeps stable URLs. */
      const src = `/files/${id}`;
      const chain = ed.chain().focus();
      if (dropPos != null && Number.isFinite(dropPos)) {
        chain.setTextSelection(dropPos);
      }
      chain.setImage({ src, alt: file.name }).run();
      toast.success('Image inserted');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.response?.data?.detail || e?.message || 'Image upload failed');
    }
  }, []);

  const openLinkDialog = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const prev = ed.getAttributes('link').href as string | undefined;
    setLinkDraft(prev && typeof prev === 'string' ? prev : 'https://');
    linkDialogRef.current?.showModal();
    requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });
  }, []);

  const applyLinkFromDialog = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const url = linkDraft.trim();
    if (url === '') {
      ed.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    linkDialogRef.current?.close();
  }, [linkDraft]);

  const cancelLinkDialog = useCallback(() => {
    linkDialogRef.current?.close();
  }, []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Underline,
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto', 'tel'],
          HTMLAttributes: {
            class: 'text-brand-red underline',
            rel: 'noopener noreferrer',
          },
        }),
        Youtube.configure({
          addPasteHandler: false,
          controls: true,
          nocookie: true,
          modestBranding: true,
          width: 640,
          height: 360,
          HTMLAttributes: { class: 'lesson-youtube-iframe' },
        }),
        LessonImage.configure({
          inline: true,
          allowBase64: false,
          HTMLAttributes: {
            class: 'max-w-full h-auto rounded-lg border border-gray-200 align-middle',
          },
        }),
        Placeholder.configure({ placeholder }),
        CommunityMention.configure({
          HTMLAttributes: {
            class:
              'rounded bg-red-50 px-1 py-0.5 font-medium text-brand-red ring-1 ring-red-100 not-italic',
          },
          suggestion: {
            char: '@',
            allowedPrefixes: null,
            items: async ({ query }) => fetchMentionItems(query),
            render: () => createMentionSuggestionRender(),
          },
        }),
      ],
      content: initialHtml || '<p></p>',
      editorProps: {
        attributes: {
          class: 'focus:outline-none min-h-[220px]',
        },
        handlePaste: (_view, event) => {
          const items = Array.from(event.clipboardData?.items || []);
          const imgItem = items.find((i) => i.type.startsWith('image/'));
          if (!imgItem) return false;
          const file = imgItem.getAsFile();
          if (!file) return false;
          event.preventDefault();
          void insertImageFromFile(file);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;
          /* In-editor drag of existing nodes (ProseMirror sets view.dragging). Do not treat as OS file drop. */
          const dragging = (view as unknown as { dragging?: { slice?: unknown } | null }).dragging;
          if (dragging?.slice != null) return false;
          const dt = event.dataTransfer;
          if (!dt?.files?.length) return false;
          const file = Array.from(dt.files).find((f) => f.type.startsWith('image/'));
          if (!file) return false;
          event.preventDefault();
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const pos = coords?.pos ?? null;
          void insertImageFromFile(file, pos);
          return true;
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChangeHtmlRef.current(ed.getHTML());
        bump();
      },
    },
    [editorKey, insertImageFromFile]
  );

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    onEditorReadyRef.current?.(editor ?? null);
    return () => {
      onEditorReadyRef.current?.(null);
    };
  }, [editor]);

  if (!editor) {
    return <div className="text-sm text-gray-500 py-6">Loading editor…</div>;
  }

  return (
    <div className={`lesson-richtext-editor community-post-rich-text border border-gray-200 rounded-lg bg-white ${className}`}>
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-100 bg-slate-50">
        <ToolbarButton
          title="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          disabled={!editor.can().toggleBold()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          disabled={!editor.can().toggleItalic()}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          title="Strike"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
        >
          S
        </ToolbarButton>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <ToolbarButton
          title="Heading 1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
        >
          H3
        </ToolbarButton>
        <ToolbarButton title="Paragraph" onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')}>
          ¶
        </ToolbarButton>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
          • List
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
          “ ”
        </ToolbarButton>
        <ToolbarButton title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          —
        </ToolbarButton>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <ToolbarButton
          title="Align left"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
        >
          <AlignIconLeft />
        </ToolbarButton>
        <ToolbarButton
          title="Align center"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
        >
          <AlignIconCenter />
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
        >
          <AlignIconRight />
        </ToolbarButton>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <ToolbarButton title="Link" onClick={openLinkDialog} active={editor.isActive('link')}>
          Link
        </ToolbarButton>
        <ToolbarButton title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()} disabled={!editor.isActive('link')}>
          Unlink
        </ToolbarButton>
        <ToolbarButton title="Insert image" onClick={() => fileInputRef.current?.click()}>
          Image
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            void insertImageFromFile(f ?? null);
            e.target.value = '';
          }}
        />
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <CommunityEditorColorToolbar editor={editor} />
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <ToolbarButton title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <UndoIcon />
        </ToolbarButton>
        <ToolbarButton title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <RedoIcon />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="lesson-richtext-editor-content max-h-[min(520px,55vh)] overflow-y-auto bg-white" />
      <p className="text-[11px] text-gray-500 px-3 py-2 border-t border-gray-100 bg-slate-50">
        Type <strong>@</strong> to mention someone. Paste or drop images, or use <strong>Image</strong>.
      </p>

      <dialog
        ref={linkDialogRef}
        className="w-[min(100%,26rem)] rounded-xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-gray-900/50"
      >
        <form
          className="p-4"
          onSubmit={(e) => {
            e.preventDefault();
            applyLinkFromDialog();
          }}
        >
          <h3 className="text-sm font-semibold text-gray-900">Insert link</h3>
          <p className="mt-0.5 text-xs text-gray-500">Use https://, mailto:, or tel:</p>
          <label htmlFor="community-editor-link-url" className="mt-3 block text-xs font-medium text-gray-700">
            Address
          </label>
          <input
            id="community-editor-link-url"
            ref={linkInputRef}
            type="text"
            inputMode="url"
            autoComplete="url"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm shadow-sm focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/25"
            placeholder="https://"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelLinkDialog}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-brand-red px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
            >
              OK
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
