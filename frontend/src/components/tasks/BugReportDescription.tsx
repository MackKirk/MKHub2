import { AppBadge, uiBorders, uiColors, uiCx, uiRadius, uiSpacing, uiTypography } from '@/components/ui';

type Props = { description: string };

function severityVariant(severity: string): 'danger' | 'warning' | 'success' | 'neutral' {
  if (severity === 'High') return 'danger';
  if (severity === 'Medium') return 'warning';
  if (severity === 'Low') return 'success';
  return 'neutral';
}

export default function BugReportDescription({ description }: Props) {
  const lines = description.split('\n');
  const mainDescription: string[] = [];
  const bugDetails: Record<string, string> = {};
  let inBugSection = false;
  let inMetadata = false;
  let metadataJson = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('═') || trimmed.startsWith('─') || trimmed === '') {
      continue;
    }

    if (trimmed.includes('BUG REPORT INFORMATION')) {
      inBugSection = true;
      continue;
    }

    if (trimmed.includes('Technical Metadata')) {
      inMetadata = true;
      continue;
    }

    if (inMetadata && trimmed.startsWith('{')) {
      const jsonLines = [line];
      let braceCount = line.split('{').length - line.split('}').length;
      i++;
      while (i < lines.length && braceCount > 0) {
        jsonLines.push(lines[i]);
        braceCount += lines[i].split('{').length - lines[i].split('}').length;
        i++;
      }
      metadataJson = jsonLines.join('\n');
      try {
        const parsed = JSON.parse(metadataJson);
        if (!bugDetails.severity) bugDetails.severity = parsed.severity || '';
        if (!bugDetails.page_url) bugDetails.page_url = parsed.report_page || '';
        if (!bugDetails.user_agent) bugDetails.user_agent = parsed.report_user_agent || '';
        if (!bugDetails.screen && parsed.report_screen) {
          bugDetails.screen = `${parsed.report_screen.width} × ${parsed.report_screen.height}`;
        }
      } catch {
        // ignore parse errors
      }
      continue;
    }

    if (inBugSection && !inMetadata) {
      const severityMatch = trimmed.match(/[🔴🟡🟢⚪]?\s*Severity:\s*(.+)/i);
      if (severityMatch) {
        bugDetails.severity = severityMatch[1].trim();
        continue;
      }

      const pageMatch = trimmed.match(/📄\s*Page URL:\s*(.+)/i);
      if (pageMatch) {
        bugDetails.page_url = pageMatch[1].trim();
        continue;
      }

      const screenMatch = trimmed.match(/💻\s*Screen Resolution:\s*(.+)/i);
      if (screenMatch) {
        bugDetails.screen = screenMatch[1].trim();
        continue;
      }

      const reportedMatch = trimmed.match(/👤\s*Reported by:\s*(.+)/i);
      if (reportedMatch) {
        bugDetails.reported_by = reportedMatch[1].trim();
        continue;
      }

      if (trimmed.includes('Browser & Device Information')) {
        i++;
        while (i < lines.length && lines[i].trim() === '') i++;
        if (i < lines.length && !lines[i].trim().startsWith('─')) {
          bugDetails.user_agent = lines[i].trim();
        }
        continue;
      }
    }

    if (!inBugSection && trimmed) {
      mainDescription.push(line);
    }
  }

  const mainDescText = mainDescription.join('\n').trim();

  return (
    <div className={uiSpacing.sectionStack}>
      {mainDescText && (
        <div className={uiCx(uiTypography.body, 'whitespace-pre-wrap leading-relaxed')}>{mainDescText}</div>
      )}

      {(bugDetails.severity || bugDetails.page_url || bugDetails.screen || bugDetails.reported_by) && (
        <div className={uiSpacing.sectionStack}>
          <div className={uiTypography.overline}>Bug report details</div>
          <div className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, uiSpacing.compactCardPadding, uiSpacing.sectionStack)}>
            {bugDetails.severity && (
              <div className="flex items-center gap-3">
                <span className={uiCx(uiTypography.helper, 'min-w-[5.5rem] shrink-0 font-medium')}>Severity</span>
                <AppBadge variant={severityVariant(bugDetails.severity)}>{bugDetails.severity}</AppBadge>
              </div>
            )}

            {bugDetails.page_url && (
              <div className="flex items-start gap-3">
                <span className={uiCx(uiTypography.helper, 'min-w-[5.5rem] shrink-0 pt-0.5 font-medium')}>Page URL</span>
                <a
                  href={bugDetails.page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={uiCx(uiTypography.body, 'flex-1 break-all text-brand-red hover:underline')}
                >
                  {bugDetails.page_url}
                </a>
              </div>
            )}

            {bugDetails.screen && (
              <div className="flex items-center gap-3">
                <span className={uiCx(uiTypography.helper, 'min-w-[5.5rem] shrink-0 font-medium')}>Screen</span>
                <span className={uiCx(uiTypography.body, 'font-mono')}>{bugDetails.screen}</span>
              </div>
            )}

            {bugDetails.reported_by && (
              <div className="flex items-center gap-3">
                <span className={uiCx(uiTypography.helper, 'min-w-[5.5rem] shrink-0 font-medium')}>Reported by</span>
                <span className={uiTypography.body}>{bugDetails.reported_by}</span>
              </div>
            )}

            {bugDetails.user_agent && (
              <div className="flex items-start gap-3 border-t border-gray-100 pt-3">
                <span className={uiCx(uiTypography.helper, 'min-w-[5.5rem] shrink-0 pt-0.5 font-medium')}>Browser</span>
                <span
                  className={uiCx(
                    uiTypography.helper,
                    'flex-1 break-all rounded border border-gray-100 bg-gray-50 p-2 font-mono',
                  )}
                >
                  {bugDetails.user_agent}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
