const ATTACH_BEGIN = "[MKHUB_ATTACHMENTS]";
const ATTACH_END = "[/MKHUB_ATTACHMENTS]";

export function parseTaskDescription(raw: string | null | undefined): {
  description: string;
  fileIds: string[];
} {
  const text = raw || "";
  const startIdx = text.indexOf(ATTACH_BEGIN);
  const endIdx = text.indexOf(ATTACH_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { description: text.trim(), fileIds: [] };
  }
  const before = text.slice(0, startIdx).trim();
  const block = text.slice(startIdx + ATTACH_BEGIN.length, endIdx);
  const fileIds = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith("file_id:"))
    .map((line) => line.split(":").slice(1).join(":").trim())
    .filter(Boolean);
  return { description: before, fileIds };
}

export function descriptionWithAttachments(
  description: string,
  fileIds: string[]
): string {
  const base = description.trim();
  if (fileIds.length === 0) return base ? `${base}\n` : "";
  const block = `${ATTACH_BEGIN}\n${fileIds.map((id) => `file_id: ${id}`).join("\n")}\n${ATTACH_END}`;
  const next = base ? `${base}\n\n${block}` : block;
  return `${next.trim()}\n`;
}
