// web_fetch — the first NETr-capability tool. Lets research/content specialists GET
// a public URL (market research, docs, public JSON APIs). Runs in the Node runtime
// process (which has network) — NOT in the docker shell (which is `--network=none`).
//
// Static declaration (Decision 5): capability 'NETr', actionTier 'T2', no pathArg.
// The loop gates NETr against the role's grant before execute() runs.
//
// SSRF is the load-bearing safety property: the tool refuses any URL that resolves
// to a private / loopback / link-local / cloud-metadata address, refuses non-http(s)
// schemes and userinfo URLs, and re-validates every redirect hop. It caps bytes +
// wall-clock so a hostile or huge response can't flood the model or hang the run.
//
// Decoupling: no electron, no app imports.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';

export interface WebFetchInput {
  url: string;
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 1_000_000;
const HARD_MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

export const webFetchTool: ToolDef<WebFetchInput> = {
  name: 'web_fetch',
  capability: 'NETr',
  actionTier: 'T2',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute http(s) URL to GET.' },
      maxBytes: {
        type: 'number',
        description: `Max bytes to read from the body (default ${DEFAULT_MAX_BYTES}, hard cap ${HARD_MAX_BYTES}).`,
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  async execute(input: WebFetchInput, _ctx: ToolExecContext): Promise<ToolObservation> {
    if (typeof input.url !== 'string' || input.url.trim() === '') return fail('empty url');
    const cap = Math.min(Math.max(input.maxBytes ?? DEFAULT_MAX_BYTES, 1), HARD_MAX_BYTES);

    let current = input.url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const guard = await assertPublicHttpUrl(current);
        if (!guard.ok) return fail(guard.reason);

        const res = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': 'dream-team-intern/0.1' },
        });

        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) return fail(`redirect ${res.status} without a Location header`);
          current = new URL(loc, current).toString(); // re-validated at the top of the loop
          continue;
        }

        const contentType = res.headers.get('content-type') ?? '';
        const body = await readCapped(res, cap);
        return {
          ok: res.ok,
          summary: res.ok
            ? `web_fetch ${res.status} ${contentType.split(';')[0]} (${body.length} bytes)`
            : `web_fetch ${res.status}`,
          data: { status: res.status, contentType, bytes: body.length, body },
        };
      }
      return fail(`too many redirects (> ${MAX_REDIRECTS})`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return fail(`timeout after ${TIMEOUT_MS}ms`);
      return fail(`fetch failed: ${describe(err)}`);
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Read up to `cap` bytes of the body and decode as UTF-8. */
async function readCapped(res: Response, cap: number): Promise<string> {
  const ab = await res.arrayBuffer();
  const u8 = new Uint8Array(ab);
  const slice = u8.length > cap ? u8.subarray(0, cap) : u8;
  return Buffer.from(slice).toString('utf8');
}

type Guard = { ok: true } | { ok: false; reason: string };

/** Reject non-http(s), userinfo, and any host that resolves to a non-public address. */
async function assertPublicHttpUrl(raw: string): Promise<Guard> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: `invalid url: ${raw}` };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `unsupported scheme '${u.protocol}' (http/https only)` };
  }
  if (u.username || u.password) {
    return { ok: false, reason: 'url with embedded credentials (userinfo) is not allowed' };
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, reason: `blocked host '${host}'` };
  }
  if (isIP(host) !== 0) {
    return isPrivateIp(host)
      ? { ok: false, reason: `blocked private/loopback IP ${host}` }
      : { ok: true };
  }
  // Hostname → resolve and check EVERY address (block DNS that points inward).
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: `dns lookup failed for '${host}'` };
  }
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      return { ok: false, reason: `'${host}' resolves to a private IP (${a.address})` };
    }
  }
  return { ok: true };
}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) return isPrivateV6(ip.toLowerCase());
  return false;
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // malformed → fail closed
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateV6(ip: string): boolean {
  if (ip === '::1' || ip === '::') return true; // loopback / unspecified
  if (ip.startsWith('fe80')) return true; // link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) → check the embedded v4
  if (ip.includes('.')) {
    const tail = ip.slice(ip.lastIndexOf(':') + 1);
    if (isIP(tail) === 4) return isPrivateV4(tail);
  }
  return false;
}

function fail(detail: string): ToolObservation {
  return { ok: false, is_error: true, summary: `execution_error: ${detail}` };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
