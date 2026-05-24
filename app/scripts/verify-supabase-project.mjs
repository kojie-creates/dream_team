#!/usr/bin/env node
// Phase 0 isolation guard: refuse to run if env vars target the Orin Supabase project.
// See app/docs/supabase-project-isolation.md

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BANNED_REF = 'fwexgqktxdfiajpqlgvz';

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const txt = readFileSync(path, 'utf8');
  const out = {};
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function decodeJwtPayload(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4));
    return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function containsBanned(value) {
  return typeof value === 'string' && value.toLowerCase().includes(BANNED_REF);
}

const cliArgs = process.argv.slice(2);
const fileFlag = cliArgs.indexOf('--file');
const envFile = fileFlag !== -1 ? cliArgs[fileFlag + 1] : resolve(process.cwd(), '.env.local');

const fileEnv = loadDotEnv(envFile);
const merged = { ...fileEnv, ...process.env };

const candidates = [
  ['NEXT_PUBLIC_SUPABASE_URL', merged.NEXT_PUBLIC_SUPABASE_URL],
  ['SUPABASE_URL', merged.SUPABASE_URL],
];

const tokenFields = [
  ['SUPABASE_SERVICE_ROLE_KEY', merged.SUPABASE_SERVICE_ROLE_KEY],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', merged.NEXT_PUBLIC_SUPABASE_ANON_KEY],
];

const failures = [];

for (const [name, value] of candidates) {
  if (containsBanned(value)) failures.push(`${name} contains banned project ref: ${value}`);
}

for (const [name, value] of tokenFields) {
  const claims = decodeJwtPayload(value);
  if (claims) {
    const iss = typeof claims.iss === 'string' ? claims.iss : '';
    const ref = typeof claims.ref === 'string' ? claims.ref : '';
    if (containsBanned(iss)) failures.push(`${name} JWT iss claim references banned ref: ${iss}`);
    if (containsBanned(ref)) failures.push(`${name} JWT ref claim is banned: ${ref}`);
  }
}

if (failures.length > 0) {
  console.error('verify-supabase-project: FAIL');
  for (const f of failures) console.error('  - ' + f);
  console.error('');
  console.error(`Banned Supabase project ref: ${BANNED_REF}`);
  console.error('See app/docs/supabase-project-isolation.md for next steps.');
  process.exit(2);
}

const url = merged.NEXT_PUBLIC_SUPABASE_URL ?? '(unset)';
console.log('verify-supabase-project: OK');
console.log(`  NEXT_PUBLIC_SUPABASE_URL = ${url}`);
console.log(`  Banned ref ${BANNED_REF} not present.`);
process.exit(0);
