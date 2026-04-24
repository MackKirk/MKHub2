import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Youtube from '@tiptap/extension-youtube';
import toast from 'react-hot-toast';
import './LessonRichTextEditor.css';
import { withFileAccessToken } from '@/lib/api';
import { injectFileAccessTokensInHtml, stripFileAccessTokensFromHtml } from '@/lib/trainingRichText';
import { uploadTrainingContentFile } from '@/lib/trainingFileUpload';
import { LessonImage } from '@/pages/training/lessonImageExtension';

type EditorMode = 'visual' | 'html';

type Props = {
  /** Remount editor when lesson / draft identity changes */
  lessonKey: string;
  initialHtml: string;
  /** Persisted after user stops typing (debounced) */
  onSave: (html: string) => void;
  /** Debounce ms for auto-save */
  saveDebounceMs?: number;
  placeholder?: string;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-xs rounded border transition-colors ${
        active ? 'bg-[#7f1010] text-white border-[#7f1010]' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

export default function LessonRichTextEditor({
  lessonKey,
  initialHtml,
  onSave,
  saveDebounceMs = 1600,
  placeholder = 'Write lesson content… Use the toolbar for headings, lists, links, images, and colors.',
}: Props) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [sourceHtml, setSourceHtml] = useState(initialHtml || '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(initialHtml || '');
  const editorRef = useRef<Editor | null>(null);
  const [, bumpSelection] = useReducer((x: number) => x + 1, 0);

  const flushSave = useCallback(
    (html: string) => {
      const canonical = stripFileAccessTokensFromHtml(html);
      if (canonical === lastSavedRef.current) return;
      lastSavedRef.current = canonical;
      setSaveState('saving');
      onSave(canonical);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    },
    [onSave],
  );

  const scheduleSave = useCallback(
    (html: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        flushSave(html);
      }, saveDebounceMs);
    },
    [flushSave, saveDebounceMs],
  );

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
            class: 'text-[#7f1010] underline',
            rel: 'noopener noreferrer',
          },
        }),
        LessonImage,
        Youtube.configure({
          addPasteHandler: true,
          controls: true,
          nocookie: true,
          modestBranding: true,
          width: 640,
          height: 360,
          HTMLAttributes: { class: 'lesson-youtube-iframe' },
        }),
        Placeholder.configure({ placeholder }),
      ],
      content: injectFileAccessTokensInHtml(initialHtml || '<p></p>'),
      editorProps: {
        attributes: {
          class: 'focus:outline-none',
        },
        handlePaste: (_view, event) => {
          const items = Array.from(event.clipboardData?.items || []);
          const img = items.find((i) => i.type.startsWith('image/'));
          if (!img) return false;
          const file = img.getAsFile();
          if (!file) return false;
          void (async () => {
            try {
              const id = await uploadTrainingContentFile(file);
              editorRef.current
                ?.chain()
                .focus()
                .setImage({ src: withFileAccessToken(`/files/${id}`), alt: file.name })
                .run();
            } catch {
              toast.error('Image upload failed');
            }
          })();
          return true;
        },
      },
      onUpdate: ({ editor: ed }) => {
        scheduleSave(ed.getHTML());
      },
    },
    [lessonKey],
  );

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    const onSel = () => bumpSelection();
    editor.on('selectionUpdate', onSel);
    editor.on('transaction', onSel);
    return () => {
      editor.off('selectionUpdate', onSel);
      editor.off('transaction', onSel);
    };
  }, [editor]);

  useEffect(() => {
    const canonical = stripFileAccessTokensFromHtml(initialHtml || '');
    lastSavedRef.current = canonical;
    setSourceHtml(canonical);
  }, [lessonKey, initialHtml]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setModeVisual = useCallback(() => {
    if (!editor) return;
    try {
      editor.commands.setContent(injectFileAccessTokensInHtml(sourceHtml || '<p></p>'));
      setMode('visual');
      scheduleSave(editor.getHTML());
    } catch {
      setMode('visual');
    }
  }, [editor, sourceHtml, scheduleSave]);

  const setModeHtml = useCallback(() => {
    if (!editor) return;
    setSourceHtml(stripFileAccessTokensFromHtml(editor.getHTML()));
    setMode('html');
  }, [editor]);

  const insertImageFromDisk = async (file: File | null) => {
    if (!file) return;
    try {
      const id = await uploadTrainingContentFile(file);
      editorRef.current
        ?.chain()
        .focus()
        .setImage({ src: withFileAccessToken(`/files/${id}`), alt: file.name })
        .run();
    } catch {
      toast.error('Image upload failed');
    }
  };

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (https://… or mailto:)', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  if (!editor) {
    return <div className="text-sm text-gray-500 py-8">Loading editor…</div>;
  }

  return (
    <div className="lesson-richtext-editor border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-100 bg-slate-50">
        <div className="flex flex-wrap gap-1 mr-2">
          <button
            type="button"
            className={`px-2 py-1 text-xs rounded font-medium ${mode === 'visual' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200'}`}
            onClick={() => (mode === 'html' ? setModeVisual() : undefined)}
          >
            Visual
          </button>
          <button
            type="button"
            className={`px-2 py-1 text-xs rounded font-medium ${mode === 'html' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200'}`}
            onClick={() => (mode === 'visual' ? setModeHtml() : undefined)}
          >
            HTML
          </button>
        </div>

        {mode === 'visual' && (
          <>
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
            <ToolbarButton
              title="Underline"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={editor.isActive('underline')}
            >
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
            <ToolbarButton title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}>
              H1
            </ToolbarButton>
            <ToolbarButton title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
              H2
            </ToolbarButton>
            <ToolbarButton title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
              H3
            </ToolbarButton>
            <ToolbarButton title="Paragraph" onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')}>
              ¶
            </ToolbarButton>
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
              • List
            </ToolbarButton>
            <ToolbarButton title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
              1. List
            </ToolbarButton>
            <ToolbarButton title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
              “ ”
            </ToolbarButton>
            <ToolbarButton title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')}>
              {'</>'}
            </ToolbarButton>
            <ToolbarButton title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              —
            </ToolbarButton>
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton title="Align left" onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })}>
              L
            </ToolbarButton>
            <ToolbarButton title="Align center" onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })}>
              C
            </ToolbarButton>
            <ToolbarButton title="Align right" onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })}>
              R
            </ToolbarButton>
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton title="Link" onClick={setLink} active={editor.isActive('link')}>
              Link
            </ToolbarButton>
            <ToolbarButton title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()} disabled={!editor.isActive('link')}>
              Unlink
            </ToolbarButton>
            <ToolbarButton title="Insert image" onClick={() => fileRef.current?.click()}>
              Image
            </ToolbarButton>
            <ToolbarButton
              title="Embed YouTube video"
              onClick={() => {
                const raw = window.prompt('YouTube URL or video ID', 'https://www.youtube.com/watch?v=');
                if (raw === null || !raw.trim()) return;
                const ok = editor.chain().focus().setYoutubeVideo({ src: raw.trim() }).run();
                if (!ok) toast.error('Could not embed — paste a valid YouTube link or ID');
              }}
            >
              YouTube
            </ToolbarButton>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                void insertImageFromDisk(f ?? null);
                e.target.value = '';
              }}
            />
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <label className="flex items-center gap-1 text-xs text-gray-600 px-1" title="Text color">
              <span>A</span>
              <input
                type="color"
                className="h-7 w-8 cursor-pointer border rounded"
                onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
              />
            </label>
            <ToolbarButton title="Clear color" onClick={() => editor.chain().focus().unsetColor().run()}>
              A̶
            </ToolbarButton>
            <label className="flex items-center gap-1 text-xs text-gray-600 px-1" title="Highlight">
              <span>Hi</span>
              <input
                type="color"
                className="h-7 w-8 cursor-pointer border rounded"
                defaultValue="#fef08a"
                onInput={(e) =>
                  editor.chain().focus().setHighlight({ color: (e.target as HTMLInputElement).value }).run()
                }
              />
            </label>
            <ToolbarButton title="Remove highlight" onClick={() => editor.chain().focus().unsetHighlight().run()}>
              Clear hi
            </ToolbarButton>
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
              Undo
            </ToolbarButton>
            <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
              Redo
            </ToolbarButton>
          </>
        )}

        <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Auto-save'}
        </span>
      </div>

      {mode === 'visual' ? (
        <EditorContent editor={editor} className="lesson-richtext-editor-content max-h-[min(640px,65vh)] overflow-y-auto bg-white" />
      ) : (
        <textarea
          className="w-full min-h-[320px] font-mono text-sm p-3 border-0 focus:ring-0 focus:outline-none"
          spellCheck={false}
          value={sourceHtml}
          onChange={(e) => setSourceHtml(e.target.value)}
          onBlur={() => {
            try {
              editor.commands.setContent(injectFileAccessTokensInHtml(sourceHtml || '<p></p>'));
              scheduleSave(editor.getHTML());
            } catch {
              /* invalid html */
            }
          }}
        />
      )}

      <p className="text-[11px] text-gray-500 px-3 py-2 border-t border-gray-100 bg-slate-50">
        Images use <code className="bg-white px-1 rounded">/files/…</code> for learners. Insert the next image while the cursor is still right after the previous one (same paragraph) — two or more images in one paragraph form a row; drag corners to set width (e.g. ~33% each).
        Align icons move the whole row when the paragraph has only images. <strong>YouTube</strong>: toolbar or paste URL. Paste screenshots in visual mode.
      </p>
    </div>
  );
}
