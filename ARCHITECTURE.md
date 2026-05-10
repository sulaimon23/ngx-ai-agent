# ngx-ai-agent — Public API Architecture

> **Phase 1 deliverable**: TypeScript signatures only. No implementations.
> All decisions documented here are open for review before Phase 2 begins.

---

## Core Concepts

```
agent() ─── creates ──► AgentRef
                          ├── messages: Signal<Message[]>
                          ├── status:   Signal<AgentStatus>
                          ├── error:    Signal<string | null>
                          ├── send(text): void
                          └── reset(): void

defineTool() ──► ToolDefinition<TInput>
                   ├── name: string
                   ├── description: string
                   ├── inputSchema: ZodSchema<TInput>
                   └── handler(input: TInput): Promise<string>

LLMProvider (interface)
  └── stream(request: StreamRequest): AsyncIterable<StreamChunk>

OpenRouterProvider ──implements──► LLMProvider
AnthropicProvider  ──implements──► LLMProvider
```

---

## 1. Messages

```typescript
/** Role of a message participant in the conversation. */
export type MessageRole = 'user' | 'assistant' | 'tool_result';

/** A single turn in the conversation. */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Present when this message is a tool result. */
  toolCallId?: string;
  /** Present when this message was the outcome of a tool call. */
  toolName?: string;
}

/** A pending tool call emitted by the LLM during streaming. */
export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string of arguments as emitted by the model. */
  argumentsJson: string;
}
```

---

## 2. Agent Status

```typescript
/**
 * Lifecycle state of an agent.
 *
 * - `idle`       — waiting for user input
 * - `streaming`  — receiving tokens from the LLM
 * - `tool_call`  — executing one or more tool handlers
 * - `error`      — last call ended in an unrecoverable error
 */
export type AgentStatus = 'idle' | 'streaming' | 'tool_call' | 'error';
```

---

## 3. Agent Reference

```typescript
/** The object returned by `agent()`. */
export interface AgentRef {
  /** Live conversation history, updated as tokens arrive. */
  readonly messages: Signal<Message[]>;

  /** Current lifecycle state. */
  readonly status: Signal<AgentStatus>;

  /** Last error message, or null when healthy. */
  readonly error: Signal<string | null>;

  /**
   * Append a user message and begin a streaming LLM call.
   * No-ops while `status()` is not `'idle'`.
   *
   * @example
   * const chat = agent({ provider: openRouterProvider({ model: 'anthropic/claude-3-5-sonnet' }) });
   * chat.send('What is the weather in Tokyo?');
   */
  send(text: string): void;

  /**
   * Clear conversation history and reset status to `'idle'`.
   *
   * @example
   * chat.reset();
   */
  reset(): void;
}
```

---

## 4. `agent()` Factory

```typescript
/** Options accepted by the `agent()` factory. */
export interface AgentOptions {
  /**
   * The LLM provider that handles streaming completions.
   * Defaults to `openRouterProvider()` if omitted.
   */
  provider?: LLMProvider;

  /**
   * Tools available to the model.
   * Can be updated reactively via a `Signal<ToolDefinition[]>`.
   *
   * @example
   * const tools = signal([weatherTool, calendarTool]);
   * const chat = agent({ tools });
   */
  tools?: ToolDefinition[] | Signal<ToolDefinition[]>;

  /**
   * Optional system prompt injected as the first message.
   *
   * @example
   * agent({ systemPrompt: 'You are a helpful assistant.' });
   */
  systemPrompt?: string;
}

/**
 * Creates a signals-native LLM agent.
 *
 * @example
 * import { agent } from 'ngx-ai-agent';
 *
 * const chat = agent({
 *   provider: openRouterProvider({ model: 'anthropic/claude-3-5-sonnet' }),
 *   tools: [weatherTool],
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * chat.send('Hello!');
 * // chat.messages() — Signal<Message[]> updated in real time
 * // chat.status()   — 'streaming' → 'idle'
 */
export declare function agent(options?: AgentOptions): AgentRef;
```

---

## 5. Tool Registry

```typescript
import { z, ZodSchema } from 'zod';

/** A registered tool the model can invoke. */
export interface ToolDefinition<TInput = unknown> {
  /** Unique machine-readable name (snake_case). */
  name: string;
  /** Human-readable description sent to the model. */
  description: string;
  /** Zod schema describing the JSON input the model will provide. */
  inputSchema: ZodSchema<TInput>;
  /**
   * Function that executes the tool.
   * Return a plain string the model can read as the tool result.
   */
  handler: (input: TInput) => Promise<string>;
}

/**
 * Helper that creates a fully-typed `ToolDefinition`.
 *
 * @example
 * const weatherTool = defineTool({
 *   name: 'get_weather',
 *   description: 'Returns current weather for a city.',
 *   inputSchema: z.object({ city: z.string() }),
 *   handler: async ({ city }) => `Sunny, 22 °C in ${city}`,
 * });
 */
export declare function defineTool<TInput>(
  definition: ToolDefinition<TInput>,
): ToolDefinition<TInput>;
```

---

## 6. LLM Provider Interface

```typescript
/** A single streaming chunk from the provider. */
export type StreamChunk =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start'; toolCall: ToolCall }
  | { type: 'tool_call_delta'; toolCallId: string; delta: string }
  | { type: 'tool_call_end'; toolCallId: string }
  | { type: 'message_stop' };

/** The request sent to a provider. */
export interface StreamRequest {
  messages: Message[];
  tools: ToolDefinition[];
  systemPrompt?: string;
}

/**
 * Implement this interface to add a new LLM backend.
 *
 * @example
 * class MyProvider implements LLMProvider {
 *   async *stream(request: StreamRequest): AsyncIterable<StreamChunk> {
 *     // yield StreamChunk objects
 *   }
 * }
 */
export interface LLMProvider {
  stream(request: StreamRequest): AsyncIterable<StreamChunk>;
}
```

---

## 7. Built-in Providers

### OpenRouter (default)

```typescript
/** Options for the OpenRouter provider. */
export interface OpenRouterProviderOptions {
  /** OpenRouter API key. Falls back to `OPENROUTER_API_KEY` env var in SSR. */
  apiKey?: string;
  /**
   * Model slug accepted by OpenRouter.
   * @default 'anthropic/claude-3-5-sonnet'
   * @example 'openai/gpt-4o'
   */
  model?: string;
  /** Base URL override. @default 'https://openrouter.ai/api/v1' */
  baseUrl?: string;
}

/**
 * Creates an OpenRouter streaming provider.
 *
 * @example
 * const provider = openRouterProvider({
 *   apiKey: 'sk-or-...',
 *   model: 'anthropic/claude-3-5-sonnet',
 * });
 */
export declare function openRouterProvider(
  options?: OpenRouterProviderOptions,
): LLMProvider;
```

### Anthropic (direct)

```typescript
/** Options for the direct Anthropic provider. */
export interface AnthropicProviderOptions {
  /** Anthropic API key. Falls back to `ANTHROPIC_API_KEY` env var in SSR. */
  apiKey?: string;
  /**
   * Anthropic model ID.
   * @default 'claude-3-5-sonnet-20241022'
   */
  model?: string;
  /** Maximum tokens in the response. @default 4096 */
  maxTokens?: number;
}

/**
 * Creates a direct Anthropic streaming provider.
 *
 * @example
 * const provider = anthropicProvider({
 *   apiKey: 'sk-ant-...',
 *   model: 'claude-opus-4-7-20250514',
 * });
 */
export declare function anthropicProvider(
  options?: AnthropicProviderOptions,
): LLMProvider;
```

---

## 8. Public API Surface (`public-api.ts`)

```typescript
// Core
export { agent } from './lib/agent';
export type { AgentRef, AgentOptions, AgentStatus } from './lib/agent';

// Messages
export type { Message, MessageRole, ToolCall } from './lib/message';

// Tools
export { defineTool } from './lib/tool';
export type { ToolDefinition } from './lib/tool';

// Provider interface
export type { LLMProvider, StreamRequest, StreamChunk } from './lib/provider';

// Built-in providers
export { openRouterProvider } from './lib/providers/open-router';
export type { OpenRouterProviderOptions } from './lib/providers/open-router';

export { anthropicProvider } from './lib/providers/anthropic';
export type { AnthropicProviderOptions } from './lib/providers/anthropic';
```

---

## 9. File Layout (library)

```
projects/ngx-ai-agent/src/
├── public-api.ts
└── lib/
    ├── agent.ts              ← agent() factory + AgentRef + AgentOptions
    ├── message.ts            ← Message, MessageRole, ToolCall types
    ├── tool.ts               ← ToolDefinition + defineTool()
    ├── provider.ts           ← LLMProvider interface + StreamChunk + StreamRequest
    └── providers/
        ├── open-router.ts    ← OpenRouterProvider
        └── anthropic.ts      ← AnthropicProvider
```

---

## 10. Design Decisions & Open Questions

| # | Decision | Rationale | Alternative considered |
|---|----------|-----------|----------------------|
| 1 | `agent()` returns a plain object (not a class) | Tree-shakeable; composition-friendly | Class with methods — rejected (harder to mock in tests) |
| 2 | `tools` accepts `Signal<ToolDefinition[]>` | Allows hot-swapping tools at runtime without recreating the agent | Plain array only — rejected (would require teardown/recreate) |
| 3 | `StreamChunk` is a discriminated union | Exhaustive type narrowing; zero runtime overhead | Class hierarchy — rejected (verbose, mutable) |
| 4 | Provider is an interface, not an abstract class | Simple to implement; works with plain functions | Abstract class — rejected (unnecessary coupling) |
| 5 | OpenRouter as default provider | Unified endpoint supporting all major models | Direct Anthropic only — too restrictive for a library |
| 6 | Zod for tool input schemas | Validates model output at runtime; familiar DX | JSON Schema + ajv — more verbose, less type-safe |
| 7 | `reset()` clears all history | Simple mental model | `clear(n)` clearing last n messages — deferred to v2 |
| 8 | No Angular injection token for provider | Keeps library usable in non-DI contexts | `InjectionToken<LLMProvider>` — could add as opt-in in v2 |

---

## 11. Proposed additions from analysis of the brief

> These were NOT in the original brief — flagging for explicit approval before implementing.

- **`inject`-friendly factory**: An `injectAgent(options)` variant that registers the agent in the Angular DI tree, enabling it to be reset on route navigation automatically.
- **SSE vs. Fetch streaming**: OpenRouter supports both SSE and `ReadableStream`-based streaming. The implementation will use `fetch` + `ReadableStream` (no external SSE library) — confirm this is acceptable.
- **Error recovery strategy**: On error, the agent currently goes to `'error'` state and stays there until `reset()`. An alternative is auto-retry with backoff. Which do you prefer?
