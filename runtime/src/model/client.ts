// Injectable model-client seam for the runtime loop (ADR-001 Decision 3, §3).
//
// The real loop (T5) will hand-roll a tool-use loop on @anthropic-ai/sdk. T0
// only establishes the SEAM so the loop and its tests can depend on an
// interface, not a concrete SDK client. Tests inject a `tapeModelClient`
// (see test/harness/tape.ts); production wires the real SDK in a later task.
//
// The request/response shapes here are a minimal subset of the Anthropic
// Messages API (model id `claude-opus-4-8` per ADR Decision 3) — only the
// fields the loop reads: content blocks, stop_reason, usage. We deliberately
// do NOT re-export the full SDK types; the loop and harness need exactly this
// much. No `electron` import (ADR §4 decoupling rule).

/** A content block in an assistant turn. Mirrors the Messages API subset the loop consumes. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

/** Why the model stopped. Subset of Messages API `stop_reason` the loop branches on (ADR Decision 3 step 4). */
export type StopReason = 'end_turn' | 'tool_use' | 'pause_turn' | 'max_tokens';

/** Token usage, read for cost accounting + budget hard-stop (ADR Decision 10). */
export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** A request to the model. Minimal subset; the loop owns max_tokens/system/tools/messages. */
export interface CreateMessageRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: unknown[]; // opaque to the seam; the loop owns the message-history contract
  tools?: unknown[];
}

/** A model response. Subset of Messages API `Message` the loop reads. */
export interface CreateMessageResponse {
  content: ContentBlock[];
  stop_reason: StopReason;
  usage: ModelUsage;
}

/**
 * The injectable seam. A single async method so a fake (tape) can be swapped in
 * for tests with zero network. The loop depends only on this interface.
 */
export interface ModelClient {
  createMessage(req: CreateMessageRequest): Promise<CreateMessageResponse>;
}

/**
 * Unwired placeholder. Intentionally throws — kept so a caller that forgot to
 * supply a key fails loud rather than silently no-op. Tests inject a tape; the
 * desktop builds `anthropicModelClient(key)` (below) from the BYOK key.
 */
export function realModelClient(): ModelClient {
  return {
    createMessage(): Promise<CreateMessageResponse> {
      throw new Error('realModelClient: not wired. Use anthropicModelClient(apiKey) or inject a fake.');
    },
  };
}

/**
 * Production ModelClient over `@anthropic-ai/sdk` (T6). The Electron adapter builds
 * this from the user's BYOK Anthropic key (loaded via `safeStorage`); the key never
 * leaves main. Maps the SDK `Message` onto this seam's minimal subset — only the
 * fields the loop reads (text/tool_use blocks, stop_reason, usage). No `electron`
 * import: this is a pure SDK wrapper, injected into the loop like any ModelClient.
 */
export function anthropicModelClient(apiKey: string): ModelClient {
  // Imported lazily-typed to keep this module dependency-light for the seam itself;
  // the dependency is declared in package.json (ADR §3).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return {
    async createMessage(req: CreateMessageRequest): Promise<CreateMessageResponse> {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: req.model,
        max_tokens: req.max_tokens,
        ...(req.system ? { system: req.system } : {}),
        // The loop owns the message-history + tool-spec contracts; the SDK param
        // types are structurally compatible with what the loop builds.
        messages: req.messages as Parameters<typeof client.messages.create>[0]['messages'],
        ...(req.tools ? { tools: req.tools as Parameters<typeof client.messages.create>[0]['tools'] } : {}),
      });
      // Narrow to the two block kinds the loop consumes; drop others (thinking, etc.).
      const content: ContentBlock[] = [];
      for (const block of res.content) {
        if (block.type === 'text') {
          content.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
        }
      }
      return {
        content,
        stop_reason: mapStopReason(res.stop_reason),
        usage: {
          input_tokens: res.usage.input_tokens,
          output_tokens: res.usage.output_tokens,
          cache_read_input_tokens: res.usage.cache_read_input_tokens ?? undefined,
          cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? undefined,
        },
      };
    },
  };
}

/** Map the SDK's wider stop_reason onto this seam's subset (unknowns → terminal end_turn). */
function mapStopReason(reason: string | null): StopReason {
  switch (reason) {
    case 'tool_use':
    case 'pause_turn':
    case 'max_tokens':
      return reason;
    default:
      // end_turn, stop_sequence, refusal, null → treat as a clean terminal stop.
      return 'end_turn';
  }
}
