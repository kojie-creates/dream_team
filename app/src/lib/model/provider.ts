// SERVER-ONLY. Never import from a client component.
// Model provider boundary for Phase 2. The Anthropic API key (when present)
// must never reach client code. Callers MUST be inside a server action or
// route handler and MUST have already authorized the user via RLS.

import 'server-only';
import { env } from '@/env';

export const CLASSIFY_PROMPT_VERSION = 'classify/v1';

export const CLASSIFY_LAYERS = ['build', 'research', 'operate', 'distribution', 'learning'] as const;
export type ClassifyLayer = (typeof CLASSIFY_LAYERS)[number];

export type ClassifyInput = {
  rawText: string;
  mode?: 'dry' | 'anthropic';
};

export type ClassifyResult = {
  mode: 'dry' | 'anthropic';
  model: string;
  prompt_version: string;
  classification: ClassifyLayer;
  verdict: 'ready_for_coordinator' | 'needs_input';
  reason: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
};

export type ProviderError = {
  kind: 'input_missing' | 'input_invalid' | 'dependency_unavailable' | 'execution_error';
  detail: string;
};

export class ModelProviderError extends Error {
  readonly kind: ProviderError['kind'];
  constructor(kind: ProviderError['kind'], detail: string) {
    super(`[model:${kind}] ${detail}`);
    this.kind = kind;
  }
}

const DRY_MODEL_ID = 'dry-run/no-op';

function dryClassify(rawText: string): ClassifyResult {
  // Deterministic, no network. Keyword-based default; falls back to 'build'.
  const t = rawText.toLowerCase();
  let classification: ClassifyLayer = 'build';
  if (/\b(research|investigate|market|competitor)\b/.test(t)) classification = 'research';
  else if (/\b(deploy|ops|ci\b|infra|incident|security)\b/.test(t)) classification = 'operate';
  else if (/\b(launch|marketing|content|sales|community)\b/.test(t)) classification = 'distribution';
  else if (/\b(analytics|experiment|insight|metric|strategy)\b/.test(t)) classification = 'learning';

  return {
    mode: 'dry',
    model: DRY_MODEL_ID,
    prompt_version: CLASSIFY_PROMPT_VERSION,
    classification,
    verdict: 'ready_for_coordinator',
    reason: 'Dry-run classification (no model call). Keyword-based fallback.',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
  };
}

export async function classifyBrief(input: ClassifyInput): Promise<ClassifyResult> {
  const rawText = (input.rawText ?? '').trim();
  if (rawText.length === 0) {
    throw new ModelProviderError('input_missing', 'rawText is empty.');
  }
  if (rawText.length > 20_000) {
    throw new ModelProviderError('input_invalid', 'rawText exceeds 20000 chars.');
  }

  const mode = input.mode ?? env.MODEL_PROVIDER_MODE;

  if (mode === 'dry') return dryClassify(rawText);

  if (mode === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new ModelProviderError(
        'dependency_unavailable',
        'ANTHROPIC_API_KEY not set; cannot run mode=anthropic.',
      );
    }
    return await anthropicClassify(rawText);
  }

  throw new ModelProviderError('input_invalid', `unknown mode: ${String(mode)}`);
}

// ---------------------------------------------------------------------------
// Anthropic Messages API path. No SDK dependency — raw fetch keeps the
// boundary minimal and the failure modes explicit.
// ---------------------------------------------------------------------------

const CLASSIFY_SYSTEM_PROMPT = `You are the Central Orchestrator of an agent system with five layers: build, research, operate, distribution, learning.

Your job: read the brief and classify which layer should handle it.

Rules:
- Output ONLY a single JSON object. No preamble, no markdown, no code fence.
- Schema: {"classification":"<layer>","verdict":"ready_for_coordinator"|"needs_input","reason":"<one short sentence>"}
- classification MUST be one of: build, research, operate, distribution, learning.
- verdict is "ready_for_coordinator" if the brief is actionable as written, "needs_input" only if a blocking ambiguity prevents routing.
- reason is one sentence, under 200 chars, plain prose.
- Do not invent fields. Do not call tools. No external lookups.`;

// Rough USD-per-million-token pricing snapshot. Used only for cost telemetry.
// If model is unknown, cost_usd stays 0 — never block on pricing math.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
  'claude-opus-4-7': { in: 15.0, out: 75.0 },
};

function computeCost(model: string, inTok: number, outTok: number): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  const cost = (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out;
  return Math.round(cost * 10_000) / 10_000;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  // Tolerate accidental ```json fences even though prompt forbids them.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced && fenced[1] ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new ModelProviderError('execution_error', `model output is not a JSON object: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch (e) {
    throw new ModelProviderError(
      'execution_error',
      `model output failed to parse as JSON: ${(e as Error).message}`,
    );
  }
}

function validateClassification(obj: unknown): {
  classification: ClassifyLayer;
  verdict: 'ready_for_coordinator' | 'needs_input';
  reason: string;
} {
  if (!obj || typeof obj !== 'object') {
    throw new ModelProviderError('execution_error', 'parsed value is not an object');
  }
  const o = obj as Record<string, unknown>;
  const cls = o.classification;
  const vd = o.verdict;
  const reason = o.reason;
  if (typeof cls !== 'string' || !(CLASSIFY_LAYERS as readonly string[]).includes(cls)) {
    throw new ModelProviderError(
      'execution_error',
      `classification must be one of ${CLASSIFY_LAYERS.join('|')}; got ${String(cls)}`,
    );
  }
  if (vd !== 'ready_for_coordinator' && vd !== 'needs_input') {
    throw new ModelProviderError(
      'execution_error',
      `verdict must be ready_for_coordinator|needs_input; got ${String(vd)}`,
    );
  }
  if (typeof reason !== 'string' || reason.length === 0) {
    throw new ModelProviderError('execution_error', 'reason must be a non-empty string');
  }
  return {
    classification: cls as ClassifyLayer,
    verdict: vd,
    reason: reason.length > 500 ? reason.slice(0, 500) : reason,
  };
}

async function anthropicClassify(rawText: string): Promise<ClassifyResult> {
  const model = env.ANTHROPIC_CLASSIFY_MODEL;
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model,
    max_tokens: 256,
    system: CLASSIFY_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Brief:\n\n${rawText}`,
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new ModelProviderError(
      'dependency_unavailable',
      `anthropic fetch failed: ${(e as Error).message}`,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ModelProviderError(
      res.status >= 500 ? 'dependency_unavailable' : 'execution_error',
      `anthropic api status ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  let json: {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  try {
    json = (await res.json()) as typeof json;
  } catch (e) {
    throw new ModelProviderError('execution_error', `anthropic response not json: ${(e as Error).message}`);
  }

  const text = (json.content ?? []).find((c) => c.type === 'text')?.text ?? '';
  if (!text) {
    throw new ModelProviderError('execution_error', 'anthropic response had no text content');
  }

  const parsed = validateClassification(extractJsonObject(text));
  const inTok = json.usage?.input_tokens ?? 0;
  const outTok = json.usage?.output_tokens ?? 0;

  return {
    mode: 'anthropic',
    model,
    prompt_version: CLASSIFY_PROMPT_VERSION,
    classification: parsed.classification,
    verdict: parsed.verdict,
    reason: parsed.reason,
    input_tokens: inTok,
    output_tokens: outTok,
    cost_usd: computeCost(model, inTok, outTok),
  };
}
