export type BugReportView = {
  isBugReport: boolean;
  description: string;
  severity: string;
  pageUrl: string;
  screen: string;
  reportedBy: string;
  userAgent: string;
};

export function parseBugReport(raw: string | null | undefined): BugReportView {
  const lines = (raw || "").split("\n");
  const mainDescription: string[] = [];
  const details = {
    severity: "",
    pageUrl: "",
    screen: "",
    reportedBy: "",
    userAgent: ""
  };
  let inBugSection = false;
  let inMetadata = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("═") || trimmed.startsWith("─") || trimmed === "") {
      continue;
    }

    if (trimmed.includes("BUG REPORT INFORMATION")) {
      inBugSection = true;
      continue;
    }

    if (trimmed.includes("Technical Metadata")) {
      inMetadata = true;
      continue;
    }

    if (inMetadata && trimmed.startsWith("{")) {
      const jsonLines = [line];
      let braceCount = line.split("{").length - line.split("}").length;
      i++;
      while (i < lines.length && braceCount > 0) {
        jsonLines.push(lines[i]);
        braceCount += lines[i].split("{").length - lines[i].split("}").length;
        i++;
      }
      try {
        const parsed = JSON.parse(jsonLines.join("\n")) as Record<string, unknown>;
        if (!details.severity && typeof parsed.severity === "string") {
          details.severity = parsed.severity;
        }
        if (!details.pageUrl && typeof parsed.report_page === "string") {
          details.pageUrl = parsed.report_page;
        }
        if (!details.userAgent && typeof parsed.report_user_agent === "string") {
          details.userAgent = parsed.report_user_agent;
        }
        const screen = parsed.report_screen;
        if (!details.screen && screen && typeof screen === "object") {
          const size = screen as { width?: unknown; height?: unknown };
          if (size.width != null && size.height != null) {
            details.screen = `${size.width} × ${size.height}`;
          }
        }
      } catch {
        // Metadata is optional. The labeled lines above it are enough.
      }
      continue;
    }

    if (inBugSection && !inMetadata) {
      const severityMatch = trimmed.match(/Severity:\s*(.+)/i);
      if (severityMatch) {
        details.severity = severityMatch[1].trim();
        continue;
      }
      const pageMatch = trimmed.match(/Page URL:\s*(.+)/i);
      if (pageMatch) {
        details.pageUrl = pageMatch[1].trim();
        continue;
      }
      const screenMatch = trimmed.match(/Screen Resolution:\s*(.+)/i);
      if (screenMatch) {
        details.screen = screenMatch[1].trim();
        continue;
      }
      const reportedMatch = trimmed.match(/Reported by:\s*(.+)/i);
      if (reportedMatch) {
        details.reportedBy = reportedMatch[1].trim();
        continue;
      }
      if (trimmed.includes("Browser & Device Information")) {
        i++;
        while (i < lines.length && lines[i].trim() === "") i++;
        if (i < lines.length && !lines[i].trim().startsWith("─")) {
          details.userAgent = lines[i].trim();
        }
        continue;
      }
    }

    if (!inBugSection && trimmed && !trimmed.includes("Browser & Device Information")) {
      mainDescription.push(line);
    }
  }

  return {
    isBugReport: inBugSection,
    description: mainDescription.join("\n").trim(),
    ...details
  };
}
