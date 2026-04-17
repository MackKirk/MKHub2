export type ChangelogEntry = {
  id: string;
  date: string;
  title: string;
  newItems: string[];
  improved: string[];
  fixed: string[];
  knownIssues: string[];
};

const SECTION_KEYS: Record<string, keyof Pick<ChangelogEntry, 'newItems' | 'improved' | 'fixed' | 'knownIssues'>> = {
  New: 'newItems',
  Improved: 'improved',
  Fixed: 'fixed',
  'Known issues': 'knownIssues',
};

function stripHtmlComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, '\n');
}

function parseMetadata(lines: string[]): { meta: { id: string; date: string; title: string }; bodyStart: number } | null {
  const meta: { id?: string; date?: string; title?: string } = {};
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (trimmed.startsWith('###')) {
      break;
    }
    const m = trimmed.match(/^(id|date|title)\s*:\s*(.*)$/i);
    if (m) {
      const key = m[1].toLowerCase() as 'id' | 'date' | 'title';
      meta[key] = m[2].trim();
      i++;
      continue;
    }
    i++;
  }
  if (!meta.id?.trim() || !meta.date?.trim()) {
    return null;
  }
  return {
    meta: {
      id: meta.id.trim(),
      date: meta.date.trim(),
      title: (meta.title ?? '').trim(),
    },
    bodyStart: i,
  };
}

function parseSectionBullets(sectionText: string): string[] {
  const out: string[] = [];
  for (const line of sectionText.split('\n')) {
    const t = line.trim();
    const bullet = t.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      const text = bullet[1].trim();
      if (text && text !== '-') {
        out.push(text);
      }
    }
  }
  return out;
}

function parseBodySections(bodyLines: string[]): Pick<ChangelogEntry, 'newItems' | 'improved' | 'fixed' | 'knownIssues'> {
  const body = bodyLines.join('\n');
  const empty = (): Pick<ChangelogEntry, 'newItems' | 'improved' | 'fixed' | 'knownIssues'> => ({
    newItems: [],
    improved: [],
    fixed: [],
    knownIssues: [],
  });

  const headerRe = /^###\s*(New|Improved|Fixed|Known issues)\s*$/gm;
  const positions: { name: keyof typeof SECTION_KEYS; headerStart: number; headerEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(body)) !== null) {
    const name = m[1] as keyof typeof SECTION_KEYS;
    if (SECTION_KEYS[name]) {
      positions.push({
        name,
        headerStart: m.index,
        headerEnd: m.index + m[0].length,
      });
    }
  }

  if (positions.length === 0) {
    return empty();
  }

  const result = empty();
  for (let i = 0; i < positions.length; i++) {
    const sliceStart = positions[i].headerEnd;
    const sliceEnd = i + 1 < positions.length ? positions[i + 1].headerStart : body.length;
    const sectionText = body.slice(sliceStart, sliceEnd);
    const key = SECTION_KEYS[positions[i].name];
    if (key) {
      result[key] = parseSectionBullets(sectionText);
    }
  }
  return result;
}

function parseReleaseBlock(block: string): ChangelogEntry | null {
  const lines = block.split('\n');
  const metaResult = parseMetadata(lines);
  if (!metaResult) {
    return null;
  }
  const bodyLines = lines.slice(metaResult.bodyStart);
  const sections = parseBodySections(bodyLines);
  return {
    id: metaResult.meta.id,
    date: metaResult.meta.date,
    title: metaResult.meta.title,
    ...sections,
  };
}

/** Parses changelog markdown: strip HTML comments, split by <<<RELEASE>>>, newest blocks first in file. */
export function parseChangelog(raw: string): ChangelogEntry[] {
  const cleaned = stripHtmlComments(raw);
  const chunks = cleaned
    .split('<<<RELEASE>>>')
    .map((c) => c.trim())
    .filter(Boolean);

  const entries: ChangelogEntry[] = [];
  for (const chunk of chunks) {
    const entry = parseReleaseBlock(chunk);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}
