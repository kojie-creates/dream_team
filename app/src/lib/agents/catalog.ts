import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type AgentGroup =
  | 'Orchestrator'
  | 'Coordinators'
  | 'Build Specialists'
  | 'Research Specialists'
  | 'Operate Specialists'
  | 'Distribution Specialists'
  | 'Learning Specialists'
  | 'Packager';

export interface AgentEntry {
  slug: string;
  name: string;
  title: string;
  description: string;
  group: AgentGroup;
  sourcePath: string;
}

const GROUP_ORDER: AgentGroup[] = [
  'Orchestrator',
  'Coordinators',
  'Build Specialists',
  'Research Specialists',
  'Operate Specialists',
  'Distribution Specialists',
  'Learning Specialists',
  'Packager',
];

function repoRoot(): string {
  return path.resolve(process.cwd(), '..');
}

function groupFromRelPath(rel: string): AgentGroup {
  const parts = rel.split(/[\\/]/);
  if (parts[0] === 'orchestrator') return 'Orchestrator';
  if (parts[0] === 'coordinators') return 'Coordinators';
  if (parts[0] === 'packager') return 'Packager';
  if (parts[0] === 'specialists') {
    switch (parts[1]) {
      case 'build':
        return 'Build Specialists';
      case 'research':
        return 'Research Specialists';
      case 'operate':
        return 'Operate Specialists';
      case 'distribution':
        return 'Distribution Specialists';
      case 'learning':
        return 'Learning Specialists';
    }
  }
  return 'Orchestrator';
}

function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  if (!src.startsWith('---')) return { meta: {}, body: src };
  const end = src.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: src };
  const block = src.slice(3, end).replace(/^\r?\n/, '');
  const body = src.slice(end + 4).replace(/^\r?\n/, '');
  const meta: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m && m[1] && m[2] !== undefined) meta[m[1]] = m[2].trim();
  }
  return { meta, body };
}

function deriveTitle(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  if (m && m[1]) return m[1].trim();
  return fallback;
}

function deriveSummary(body: string, fmDescription: string | undefined): string {
  if (fmDescription) return clip(fmDescription, 320);
  const afterHeading = body.replace(/^#\s+.+$/m, '');
  const paragraphs = afterHeading.split(/\r?\n\r?\n/);
  for (const p of paragraphs) {
    const t = p.trim();
    if (!t) continue;
    if (t.startsWith('#')) continue;
    if (t.startsWith('---')) continue;
    return clip(t.replace(/\s+/g, ' '), 320);
  }
  return '';
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

async function walk(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const r = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) out.push(...(await walk(full, r)));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(r);
  }
  return out;
}

export async function loadAgentCatalog(): Promise<AgentEntry[]> {
  const root = path.join(repoRoot(), 'agents');
  const rels = await walk(root);
  const entries: AgentEntry[] = [];
  for (const rel of rels) {
    const abs = path.join(root, rel);
    const src = await fs.readFile(abs, 'utf8');
    const { meta, body } = parseFrontmatter(src);
    const fileSlug = path.basename(rel, '.md');
    const slug = (meta.name || fileSlug).trim();
    const title = deriveTitle(body, slug);
    const description = deriveSummary(body, meta.description);
    const group = groupFromRelPath(rel);
    entries.push({
      slug,
      name: title,
      title,
      description,
      group,
      sourcePath: `agents/${rel.replace(/\\/g, '/')}`,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

export interface AgentCatalogGroup {
  group: AgentGroup;
  agents: AgentEntry[];
}

export function groupAgents(entries: AgentEntry[]): AgentCatalogGroup[] {
  const buckets = new Map<AgentGroup, AgentEntry[]>();
  for (const e of entries) {
    const arr = buckets.get(e.group) ?? [];
    arr.push(e);
    buckets.set(e.group, arr);
  }
  return GROUP_ORDER.filter((g) => buckets.has(g)).map((group) => ({
    group,
    agents: buckets.get(group)!,
  }));
}
