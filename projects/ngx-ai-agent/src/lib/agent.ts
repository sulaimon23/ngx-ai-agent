import { Signal } from '@angular/core';
import type { Message } from './message';
import type { LLMProvider } from './provider';
import type { ToolDefinition } from './tool';

/**
 * Lifecycle state of an agent.
 *
 * - `idle`       — waiting for user input
 * - `streaming`  — receiving tokens from the LLM
 * - `tool_call`  — executing one or more tool handlers
 * - `error`      — last call ended in an unrecoverable error
 */
export type AgentStatus = 'idle' | 'streaming' | 'tool_call' | 'error';

/** The object returned by {@link agent}. */
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

/** Options accepted by the {@link agent} factory. */
export interface AgentOptions {
  /**
   * The LLM provider that handles streaming completions.
   * Defaults to `openRouterProvider()` if omitted.
   */
  provider?: LLMProvider;
  /**
   * Tools available to the model. Accepts a plain array or a live Signal
   * allowing hot-swap without recreating the agent.
   *
   * @example
   * const tools = signal([weatherTool, calendarTool]);
   * const chat = agent({ tools });
   */
  tools?: ToolDefinition[] | Signal<ToolDefinition[]>;
  /**
   * System prompt injected as the first message to the model.
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
 * import { agent, openRouterProvider, defineTool } from 'ngx-ai-agent';
 * import { z } from 'zod';
 *
 * const weatherTool = defineTool({
 *   name: 'get_weather',
 *   description: 'Returns current weather for a city.',
 *   inputSchema: z.object({ city: z.string() }),
 *   handler: async ({ city }) => `Sunny, 22°C in ${city}`,
 * });
 *
 * const chat = agent({
 *   provider: openRouterProvider({ model: 'anthropic/claude-3-5-sonnet' }),
 *   tools: [weatherTool],
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * chat.send('Hello!');
 * // chat.messages() → Signal<Message[]> updated in real time
 * // chat.status()   → 'streaming' → 'idle'
 */
export function agent(_options?: AgentOptions): AgentRef {
  throw new Error('Not implemented — Phase 2');
}
