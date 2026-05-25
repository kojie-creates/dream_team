import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ContractEntry {
  slug: string;
  title: string;
  status: string | null;
  excerpt: string;
  sourcePath: string;
}

export interface ContractDetail extends ContractEntry {
  body: string;
}

const KNOWN_SLUGS = [
  'trace-emitter-contract',
  'failure-packet-contract',
  'loop-termination-contract',
] as const;

const DISPLAY_ORDER: readonly string[] = [
  'failure-packet-contract',
  'trace-emitter-contract',
  'loop-termination-contract',
];

function repoRoot(): string {
  return path.resolve(process.cwd(), '..');
}

function deriveTitle(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  if (m && m[1]) return m[1].trim();
  return fallback;
}

function deriveStatus(body: string): string | null {
  const m = body.match(/^\*\*Status:\*\*\s*(.+?)\s*$/m);
  if (m && m[1]) return m[1].trim();
  return null;
}

function deriveExcerpt(body: string): string {
  const purposeIdx = body.search(/^##\s+Purpose\s*$/m);
  const region = purposeIdx >= 0 ? body.slice(purposeIdx) : body;
  const paragraphs = region.split(/\r?\n\r?\n/);
  for (const p of paragraphs) {
    const t = p.trim();
    if (!t) continue;
    if (t.startsWith('#')) continue;
    if (t.startsWith('---')) continue;
    if (t.startsWith('**Status:')) continue;
    return clip(t.replace(/\s+/g, ' '), 280);
  }
  return '';
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

async function readContract(slug: string): Promise<ContractDetail | null> {
  const filename = `${slug}.md`;
  const abs = path.join(repoRoot(), 'contracts', filename);
  let src: string;
  try {
    src = await fs.readFile(abs, 'utf8');
  } catch {
    return null;
  }
  return {
    slug,
    title: deriveTitle(src, slug),
    status: deriveStatus(src),
    excerpt: deriveExcerpt(src),
    sourcePath: `contracts/${filename}`,
    body: src,
  };
}

export async function loadContractCatalog(): Promise<ContractEntry[]> {
  const entries: ContractEntry[] = [];
  for (const slug of DISPLAY_ORDER) {
    const detail = await readContract(slug);
    if (!detail) continue;
    const { body, ...meta } = detail;
    void body;
    entries.push(meta);
  }
  return entries;
}

export async function loadContractBySlug(slug: string): Promise<ContractDetail | null> {
  if (!(KNOWN_SLUGS as readonly string[]).includes(slug)) return null;
  return readContract(slug);
}

export function contractSlugs(): readonly string[] {
  return KNOWN_SLUGS;
}
