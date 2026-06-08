// Tests for artifact bytes upload (migration 0012): the pure path/content-type
// helpers, the makeArtifactUploadFn orchestration (read → size-cap → upload →
// set storage_path), and the rpcArtifactSink upload CHAIN (append → id → upload).
// All seams injected — no Supabase, no network, no real fs upload.

import { describe, it, expect } from 'vitest';
import {
  buildArtifactObjectPath,
  contentTypeFor,
  makeArtifactUploadFn,
  MAX_ARTIFACT_BYTES,
  type ArtifactStorage,
} from '../../src/artifacts/upload.ts';
import { rpcArtifactSink } from '../../src/artifacts/rpc-sink.ts';

describe('buildArtifactObjectPath', () => {
  it('keys by workspace/ticket/artifact/filename', () => {
    expect(buildArtifactObjectPath('ws1', 'tk1', 'a1', '/ws/root/out/hello.txt')).toBe(
      'ws1/tk1/a1/hello.txt',
    );
  });
  it('uses _no_ticket when ticket is null', () => {
    expect(buildArtifactObjectPath('ws1', null, 'a1', '/ws/root/x.md')).toBe(
      'ws1/_no_ticket/a1/x.md',
    );
  });
  it('sanitizes the filename to a safe charset', () => {
    expect(buildArtifactObjectPath('ws', 'tk', 'a', '/r/we ird$na@me.txt')).toBe(
      'ws/tk/a/we_ird_na_me.txt',
    );
  });
});

describe('contentTypeFor', () => {
  it('explicit mime wins', () => {
    expect(contentTypeFor('file', 'application/pdf')).toBe('application/pdf');
  });
  it('infers from kind when mime is null', () => {
    expect(contentTypeFor('markdown', null)).toBe('text/markdown');
    expect(contentTypeFor('json', null)).toBe('application/json');
    expect(contentTypeFor('file', null)).toBe('application/octet-stream');
  });
});

function fakeStorage(error: { message: string } | null = null): {
  storage: ArtifactStorage;
  uploads: Array<{ path: string; body: Uint8Array; contentType: string }>;
} {
  const uploads: Array<{ path: string; body: Uint8Array; contentType: string }> = [];
  const storage: ArtifactStorage = {
    async upload(path, body, opts) {
      uploads.push({ path, body, contentType: opts.contentType });
      return { error };
    },
  };
  return { storage, uploads };
}

describe('makeArtifactUploadFn', () => {
  const args = {
    artifactId: 'a1',
    workspaceId: 'ws1',
    ticketId: 'tk1',
    absPath: '/ws/root/out/hello.txt',
    bytes: 5,
    mimeType: null,
    kind: 'file' as const,
  };

  it('reads bytes, uploads to the built path, then stamps storage_path', async () => {
    const { storage, uploads } = fakeStorage();
    const setCalls: Array<[string, string]> = [];
    const reads: string[] = [];
    const fn = makeArtifactUploadFn({
      storage,
      setStoragePath: async (id, path) => void setCalls.push([id, path]),
      readBytes: async (p) => { reads.push(p); return new Uint8Array([104, 105]); },
    });

    await fn(args);

    expect(reads).toEqual(['/ws/root/out/hello.txt']);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.path).toBe('ws1/tk1/a1/hello.txt');
    expect(uploads[0]!.contentType).toBe('application/octet-stream');
    expect(setCalls).toEqual([['a1', 'ws1/tk1/a1/hello.txt']]);
  });

  it('rejects an over-cap file BEFORE reading or uploading', async () => {
    const { storage, uploads } = fakeStorage();
    let read = false;
    const fn = makeArtifactUploadFn({
      storage,
      setStoragePath: async () => {},
      readBytes: async (p) => { read = true; return new Uint8Array(); },
    });
    await expect(fn({ ...args, bytes: MAX_ARTIFACT_BYTES + 1 })).rejects.toThrow(/over the .* limit/);
    expect(read).toBe(false);
    expect(uploads).toHaveLength(0);
  });

  it('throws on a storage error and does NOT stamp the path', async () => {
    const { storage } = fakeStorage({ message: 'bucket not found' });
    let stamped = false;
    const fn = makeArtifactUploadFn({
      storage,
      setStoragePath: async () => { stamped = true; },
      readBytes: async () => new Uint8Array([1]),
    });
    await expect(fn(args)).rejects.toThrow(/storage upload failed.*bucket not found/);
    expect(stamped).toBe(false);
  });
});

// ── rpcArtifactSink upload chain ─────────────────────────────────────────────

describe('rpcArtifactSink — upload chain', () => {
  const row = {
    workspace_id: 'ws1',
    ticket_id: 'tk1',
    kind: 'file' as const,
    storage_path: null,
    mime_type: null,
    bytes: 5,
    abs_path: '/ws/root/out/hello.txt',
  };

  it('append → id → upload(id, …); flush resolves', async () => {
    const uploadCalls: Array<{ artifactId: string; absPath: string }> = [];
    const sink = rpcArtifactSink({
      rpc: async () => 'art-1',
      upload: async (a) => void uploadCalls.push({ artifactId: a.artifactId, absPath: a.absPath }),
    });
    sink.append(row);
    await sink.flush();
    expect(uploadCalls).toEqual([{ artifactId: 'art-1', absPath: '/ws/root/out/hello.txt' }]);
    expect(sink.failures).toHaveLength(0);
  });

  it('an upload failure is surfaced by flush (no silent drop)', async () => {
    const sink = rpcArtifactSink({
      rpc: async () => 'art-1',
      upload: async () => { throw new Error('upload boom'); },
    });
    sink.append(row);
    await expect(sink.flush()).rejects.toThrow(/artifact persistence failed/);
    expect(sink.failures).toHaveLength(1);
  });

  it('skips upload when no upload fn is configured (rpc-only behavior)', async () => {
    let rpcCalled = false;
    const sink = rpcArtifactSink({ rpc: async () => { rpcCalled = true; return 'art-1'; } });
    sink.append(row);
    await sink.flush();
    expect(rpcCalled).toBe(true);
    expect(sink.failures).toHaveLength(0);
  });

  it('skips upload when the record carries no abs_path', async () => {
    let uploaded = false;
    const sink = rpcArtifactSink({
      rpc: async () => 'art-1',
      upload: async () => { uploaded = true; },
    });
    sink.append({ ...row, abs_path: undefined });
    await sink.flush();
    expect(uploaded).toBe(false);
  });
});
