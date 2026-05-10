import type { LLMProvider } from '../provider';

/** Options for the OpenRouter provider. */
export interface OpenRouterProviderOptions {
  /** OpenRouter API key. In Node SSR falls back to `OPENROUTER_API_KEY` env var. */
  apiKey?: string;
  /**
   * Model slug accepted by OpenRouter.
   *
   * @default 'anthropic/claude-3-5-sonnet'
   * @example 'openai/gpt-4o'
   */
  model?: string;
  /**
   * Base URL override.
   *
   * @default 'https://openrouter.ai/api/v1'
   */
  baseUrl?: string;
}

/**
 * Creates an OpenRouter streaming provider.
 *
 * @example
 * import { openRouterProvider } from 'ngx-ai-agent';
 *
 * const provider = openRouterProvider({
 *   apiKey: 'sk-or-...',
 *   model: 'anthropic/claude-3-5-sonnet',
 * });
 */
export function openRouterProvider(
  _options?: OpenRouterProviderOptions,
): LLMProvider {
  throw new Error('Not implemented — Phase 2');
}
