// Phase 2 T1 — model provider boundary smoke.
// Static-checks the provider module without importing the Next.js runtime
// (which requires a fully-populated Supabase env). Asserts:
//   1. The module declares `import 'server-only'` at the top.
//   2. The module does NOT reference NEXT_PUBLIC_ prefix anywhere
//      (the key must never be exposable through a public env var).
//   3. The module exports the documented Phase 2 T1 surface.
//   4. The anthropic branch refuses to run when the key is absent.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const providerPath = path.resolve(here, '..', 'src', 'lib', 'model', 'provider.ts');
const envPath = path.resolve(here, '..', 'src', 'env.ts');

const src = readFileSync(providerPath, 'utf8');
const envSrc = readFileSync(envPath, 'utf8');

const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
}

check(
  'server-only import',
  /^import 'server-only';/m.test(src),
  "provider.ts must start with import 'server-only';",
);

check(
  'no NEXT_PUBLIC reference in provider',
  !/NEXT_PUBLIC_/.test(src),
  'provider.ts must not reference any NEXT_PUBLIC_* variable',
);

check(
  'no NEXT_PUBLIC_ANTHROPIC in env schema',
  !/NEXT_PUBLIC_ANTHROPIC/i.test(envSrc),
  'env.ts must not expose Anthropic key as a public client variable',
);

check(
  'exports classifyBrief',
  /export\s+async\s+function\s+classifyBrief\s*\(/.test(src),
  'provider.ts must export async function classifyBrief',
);

check(
  'exports CLASSIFY_PROMPT_VERSION',
  /export\s+const\s+CLASSIFY_PROMPT_VERSION/.test(src),
  'provider.ts must export CLASSIFY_PROMPT_VERSION',
);

check(
  'dry mode declared',
  /'dry'/.test(src) && /dryClassify\(/.test(src),
  'provider.ts must declare a dry-run classifier path',
);

check(
  'anthropic mode guarded by key',
  /if \(!env\.ANTHROPIC_API_KEY\)/.test(src) &&
    /ModelProviderError\([\s\S]*?'dependency_unavailable'/.test(src),
  'anthropic mode must check ANTHROPIC_API_KEY and emit dependency_unavailable when absent',
);

check(
  'anthropic mode calls api.anthropic.com',
  /https:\/\/api\.anthropic\.com\/v1\/messages/.test(src),
  'provider.ts must POST to anthropic Messages API',
);

check(
  'anthropic auth header uses x-api-key',
  /'x-api-key':\s*env\.ANTHROPIC_API_KEY/.test(src),
  'provider.ts must send x-api-key header sourced from env.ANTHROPIC_API_KEY',
);

check(
  'anthropic call has timeout',
  /AbortSignal\.timeout\(/.test(src),
  'anthropic fetch must use AbortSignal.timeout to bound the call',
);

check(
  'classifier output validated',
  /validateClassification\(/.test(src),
  'parsed model output must be schema-validated before return',
);

check(
  'env schema declares MODEL_PROVIDER_MODE default dry',
  /MODEL_PROVIDER_MODE: z\.enum\(\['dry', 'anthropic'\]\)\.default\('dry'\)/.test(envSrc),
  "env.ts must default MODEL_PROVIDER_MODE to 'dry'",
);

check(
  'env schema declares ANTHROPIC_API_KEY optional',
  /ANTHROPIC_API_KEY: z\.string\(\)\.min\(1\)\.optional\(\)/.test(envSrc),
  'env.ts must declare ANTHROPIC_API_KEY as optional',
);

let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`  ok  - ${c.name}`);
  } else {
    failed++;
    console.error(`  FAIL- ${c.name}: ${c.detail}`);
  }
}

if (failed > 0) {
  console.error(`model-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log(`model-smoke: OK (${checks.length} checks)`);
