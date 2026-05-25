import { z } from 'zod';

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  // Model provider — Phase 2. Optional in dry mode; required when MODEL_PROVIDER_MODE=anthropic.
  MODEL_PROVIDER_MODE: z.enum(['dry', 'anthropic']).default('dry'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_CLASSIFY_MODEL: z.string().min(1).default('claude-haiku-4-5'),
  // OpenAI key reserved for future provider parity. Not wired in Phase 2.
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Phase 5 T3 — Google Calendar OAuth + connector token encryption.
  // All three are server-only. Optional so non-OAuth dev paths keep working;
  // the OAuth start route enforces presence at request time.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // Hex-encoded 32 bytes (64 hex chars) for AES-256-GCM. Server-only.
  CONNECTOR_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
});

function parse<T extends z.ZodTypeAny>(schema: T, source: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ');
    throw new Error(
      `Invalid environment variables — check app/.env.local against app/.env.example:\n  ${missing}`,
    );
  }
  return result.data;
}

export const env = parse(serverSchema, process.env);
export const publicEnv = parse(clientSchema, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
