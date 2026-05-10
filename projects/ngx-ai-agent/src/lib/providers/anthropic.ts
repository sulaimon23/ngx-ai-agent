import type { LLMProvider } from '../provider';

/** Options for the direct Anthropic provider. */
export interface AnthropicProviderOptions {
  /** Anthropic API key. In Node SSR falls back to `ANTHROPIC_API_KEY` env var. */
  apiKey?: string;
  /**
   * Anthropic model ID.
   *
   * @default 'claude-3-5-sonnet-20241022'
   */
  model?: string;
  /**
   * Maximum tokens in the response.
   *
   * @default 4096
   */
  maxTokens?: number;
}

/**
 * Creates a direct Anthropic streaming provider.
 *
 * @example
 * import { anthropicProvider } from 'ngx-ai-agent';
 *
 * const provider = anthropicProvider({
 *   apiKey: 'sk-ant-...',
 *   model: 'claude-opus-4-7-20250514',
 * });
 */
export function anthropicProvider(
  _options?: AnthropicProviderOptions,
): LLMProvider {
  throw new Error('Not implemented — Phase 2');
}
