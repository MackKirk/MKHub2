import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import '@/components/community/communityCommentRichText.css';
import {
  CommunityMention,
  createMentionSuggestionRender,
  fetchMentionItems,
} from '@/components/community/communityEditorMentions';

type Props = {
  editorKey: string;
  initialHtml?: string;
  onChangeHtml: (html: string) => void;
  onEditorReady?: (editor: Editor | null) => void;
  placeholder?: string;
  className?: string;
};

/** Compact TipTap field for post comments: paragraph text + @ mentions (no full post toolbar). */
export default function CommunityCommentRichTextEditor({
  editorKey,
  initialHtml = '<p></p>',
  onChangeHtml,
  onEditorReady,
  placeholder = 'Add comment…',
  className = '',
}: Props) {
  const onChangeHtmlRef = useRef(onChangeHtml);
  onChangeHtmlRef.current = onChangeHtml;
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
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
          class: 'focus:outline-none text-sm',
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChangeHtmlRef.current(ed.getHTML());
      },
    },
    [editorKey]
  );

  useEffect(() => {
    onEditorReadyRef.current?.(editor ?? null);
    return () => {
      onEditorReadyRef.current?.(null);
    };
  }, [editor]);

  if (!editor) {
    return (
      <div
        className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-500 ${className}`}
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      className={`community-comment-rich-text rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-[#7f1010] focus-within:border-transparent ${className}`}
    >
      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}
