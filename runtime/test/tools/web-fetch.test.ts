// web_fetch — SSRF guard is the load-bearing property. These tests prove that
// every private/loopback/link-local/metadata target and every unsafe scheme is
// refused BEFORE any network call (the fetch spy records 0 calls), and that a
// public target succeeds with a byte cap.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { webFetchTool } from '../../src/tools/web-fetch.ts';
import type { ToolExecContext } from '../../src/tools/types.ts';

const ctx = { boundary: { workspaceRoot: '/ws', readAllowlist: [] } } as ToolExecContext;

afterEach(() => vi.unstubAllGlobals());

function fakeResponse(opts: { status?: number; headers?: Record<string, string>; body?: string }) {
  const status = opts.status ?? 200;
  const h = new Map(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const body = opts.body ?? '';
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () => {
      const b = Buffer.from(body, 'utf8');
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
  };
}

describe('web_fetch — declaration', () => {
  it('is NETr / T2 with no pathArg', () => {
    expect(webFetchTool.capability).toBe('NETr');
    expect(webFetchTool.actionTier).toBe('T2');
    expect(webFetchTool.pathArg).toBeUndefined();
  });
});

describe('web_fetch — SSRF refusals (network NEVER touched)', () => {
  const blocked = [
    'http://localhost/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata
    'http://10.0.0.1/',
    'http://192.168.1.1/',
    'http://[::1]/',
    'file:///etc/passwd',
    'ftp://example.com/',
    'http://user:pass@1.1.1.1/', // userinfo
  ];

  for (const url of blocked) {
    it(`refuses ${url} and makes 0 fetch calls`, async () => {
      const spy = vi.fn();
      vi.stubGlobal('fetch', spy);
      const obs = await webFetchTool.execute({ url }, ctx);
      expect(obs.ok).toBe(false);
      expect(obs.is_error).toBe(true);
      expect(spy).toHaveBeenCalledTimes(0);
    });
  }
});

describe('web_fetch — public target succeeds + caps bytes', () => {
  it('returns status/contentType/body for a public IP literal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      fakeResponse({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'hello world' }),
    ));
    const obs = await webFetchTool.execute({ url: 'http://1.1.1.1/' }, ctx);
    expect(obs.ok).toBe(true);
    const data = obs.data as { status: number; contentType: string; body: string };
    expect(data.status).toBe(200);
    expect(data.contentType).toBe('text/plain');
    expect(data.body).toBe('hello world');
  });

  it('truncates the body at maxBytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ body: 'abcdefghij' })));
    const obs = await webFetchTool.execute({ url: 'http://1.1.1.1/', maxBytes: 4 }, ctx);
    const data = obs.data as { body: string; bytes: number };
    expect(data.body).toBe('abcd');
    expect(data.bytes).toBe(4);
  });
});

describe('web_fetch — timeout maps to execution_error', () => {
  it('an AbortError becomes a timeout execution_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    }));
    const obs = await webFetchTool.execute({ url: 'http://1.1.1.1/' }, ctx);
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/timeout/);
  });
});
