type Props = { description: string };

export default function BugReportDescription({ description }: Props) {
  // Parse bug report description to extract structured information
  const lines = description.split('\n');
  const mainDescription: string[] = [];
  const bugDetails: Record<string, string> = {};
  let inBugSection = false;
  let inMetadata = false;
  let metadataJson = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip separator lines
    if (trimmed.startsWith('═') || trimmed.startsWith('─') || trimmed === '') {
      continue;
    }

    // Detect start of bug report section
    if (trimmed.includes('BUG REPORT INFORMATION')) {
      inBugSection = true;
      continue;
    }

    // Detect metadata section
    if (trimmed.includes('Technical Metadata')) {
      inMetadata = true;
      continue;
    }

    // Parse JSON metadata
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
      } catch (e) {
        // Ignore JSON parse errors
      }
      continue;
    }

    // Parse bug details lines
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

      // Browser info section
      if (trimmed.includes('Browser & Device Information')) {
        // Next non-empty line is the user agent
        i++;
        while (i < lines.length && lines[i].trim() === '') i++;
        if (i < lines.length && !lines[i].trim().startsWith('─')) {
          bugDetails.user_agent = lines[i].trim();
        }
        continue;
      }
    }

    // Collect main description (before bug section)
    if (!inBugSection && trimmed) {
      mainDescription.push(line);
    }
  }

  const mainDescText = mainDescription.join('\n').trim();

  return (
    <div className="space-y-4">
      {mainDescText && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wide">Description</div>
          <div className="text-gray-900 whitespace-pre-wrap leading-relaxed bg-white rounded p-3 border border-gray-200">
            {mainDescText}
          </div>
        </div>
      )}

      {(bugDetails.severity || bugDetails.page_url || bugDetails.screen || bugDetails.reported_by) && (
        <div className="border-t pt-4">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">Bug Report Details</div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            {bugDetails.severity && (
              <div className="flex items-center gap-3">
                <span className="text-gray-500 font-medium text-xs min-w-[90px]">Severity:</span>
                <span
                  className={`font-semibold text-sm px-2 py-1 rounded ${
                    bugDetails.severity === 'High'
                      ? 'bg-red-100 text-red-700'
                      : bugDetails.severity === 'Medium'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                  }`}
                >
                  {bugDetails.severity}
                </span>
              </div>
            )}

            {bugDetails.page_url && (
              <div className="flex items-start gap-3">
                <span className="text-gray-500 font-medium text-xs min-w-[90px] pt-1">Page URL:</span>
                <a
                  href={bugDetails.page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline break-all text-sm flex-1"
                >
                  {bugDetails.page_url}
                </a>
              </div>
            )}

            {bugDetails.screen && (
              <div className="flex items-center gap-3">
                <span className="text-gray-500 font-medium text-xs min-w-[90px]">Screen:</span>
                <span className="text-gray-700 text-sm font-mono">{bugDetails.screen}</span>
              </div>
            )}

            {bugDetails.reported_by && (
              <div className="flex items-center gap-3">
                <span className="text-gray-500 font-medium text-xs min-w-[90px]">Reported by:</span>
                <span className="text-gray-700 text-sm">{bugDetails.reported_by}</span>
              </div>
            )}

            {bugDetails.user_agent && (
              <div className="flex items-start gap-3 pt-2 border-t">
                <span className="text-gray-500 font-medium text-xs min-w-[90px] pt-1">Browser:</span>
                <span className="text-gray-600 text-xs font-mono break-all flex-1 bg-gray-50 p-2 rounded border">
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

