/**
 * Adds OverlayPortal import and wraps modal roots: <div ... fixed inset-0 ...> ... </div>
 * Skips z-10 scrims without bg-*.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');

const IMPORT_LINE = "import OverlayPortal from '@/components/OverlayPortal';";

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

function addImport(text) {
  if (text.includes("import OverlayPortal from '@/components/OverlayPortal'")) return text;
  const lines = text.split('\n');
  let lastI = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) lastI = i;
  }
  if (lastI < 0) return text;
  lines.splice(lastI + 1, 0, IMPORT_LINE);
  return lines.join('\n');
}

function findMatchingCloseDiv(s, openPos) {
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = openPos;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[0].startsWith('<div')) depth++;
    else depth--;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/** Start of opening <div tag that contains fixedIdx in its attribute region */
function findOpenDivContaining(text, fixedIdx) {
  let lt = text.lastIndexOf('<div', fixedIdx);
  while (lt !== -1) {
    const tagEnd = text.indexOf('>', lt);
    if (tagEnd !== -1 && tagEnd > fixedIdx) {
      const tag = text.slice(lt, tagEnd + 1);
      const cls = tag.match(/className="([^"]*)"/);
      if (cls && cls[1].includes('fixed') && cls[1].includes('inset-0')) return lt;
    }
    lt = text.lastIndexOf('<div', lt - 1);
  }
  return -1;
}

function shouldSkipScrim(className) {
  if (!/\bz-10\b/.test(className)) return false;
  return !/bg-/.test(className);
}

function extractClassFromOpenDiv(text, openPos) {
  const tagEnd = text.indexOf('>', openPos);
  if (tagEnd === -1) return '';
  const tag = text.slice(openPos, tagEnd + 1);
  const m = tag.match(/className="([^"]*)"/);
  return m ? m[1] : '';
}

function processContent(text) {
  let searchFrom = 0;
  for (let iter = 0; iter < 300; iter++) {
    const fi = text.indexOf('fixed inset-0', searchFrom);
    if (fi === -1) break;
    const openPos = findOpenDivContaining(text, fi);
    if (openPos === -1) {
      searchFrom = fi + 10;
      continue;
    }
    const cls = extractClassFromOpenDiv(text, openPos);
    if (shouldSkipScrim(cls)) {
      searchFrom = fi + 10;
      continue;
    }
    const before = text.slice(Math.max(0, openPos - 50), openPos);
    if (before.includes('OverlayPortal')) {
      searchFrom = fi + 10;
      continue;
    }
    const end = findMatchingCloseDiv(text, openPos);
    if (end === -1) {
      searchFrom = fi + 10;
      continue;
    }
    const chunk = text.slice(openPos, end);
    if (chunk.includes('<OverlayPortal>')) {
      searchFrom = end;
      continue;
    }
    const wrapped = '<OverlayPortal>' + chunk + '</OverlayPortal>';
    text = text.slice(0, openPos) + wrapped + text.slice(end);
    searchFrom = openPos + wrapped.length;
  }
  return text;
}

const skip = new Set(['GlobalSearch.tsx', 'OverlayPortal.tsx']);

for (const file of walk(srcRoot)) {
  if (skip.has(path.basename(file))) continue;
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('fixed inset-0')) continue;
  if (text.includes("import OverlayPortal from '@/components/OverlayPortal'")) continue;

  const processed = processContent(text);
  if (processed === text) continue;
  const out = addImport(processed);
  fs.writeFileSync(file, out);
  console.log('updated', path.relative(srcRoot, file));
}
