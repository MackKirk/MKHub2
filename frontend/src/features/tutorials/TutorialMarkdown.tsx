import { uiCx } from '@/components/ui';
import { renderTutorialMarkdown } from './markdown';

type TutorialMarkdownProps = {
  markdown: string;
  className?: string;
};

export function TutorialMarkdown({ markdown, className }: TutorialMarkdownProps) {
  const html = renderTutorialMarkdown(markdown);
  if (!html) return null;
  return (
    <div
      className={uiCx(
        'tutorial-md space-y-2.5 text-[15px] leading-relaxed text-gray-700',
        '[&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:space-y-1.5 [&_ol]:space-y-1.5 [&_ul]:pl-5 [&_ol]:pl-5',
        '[&_strong]:font-semibold [&_strong]:text-gray-800',
        '[&_a]:font-medium [&_a]:text-brand-red [&_a]:underline',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
