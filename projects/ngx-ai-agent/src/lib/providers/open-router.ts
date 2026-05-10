import { z } from 'zod';
import type { Message } from '../message';
import type { LLMProvider, StreamChunk, StreamRequest } from '../provider';

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

// Internal types matching the OpenAI streaming SSE format used by OpenRouter.

interface OaiToolCallDelta {
  index: number;
  id?: string;
  function: { name?: string; arguments: string };
}

interface OaiDelta {
  content?: string;
  tool_calls?: OaiToolCallDelta[];
}

interface OaiChoice {
  delta: OaiDelta;
  finish_reason: string | null;
}

interface OaiChunk {
  choices?: OaiChoice[];
}

function buildMessages(msgs: Message[], systemPrompt?: string): unknown[] {
  const out: unknown[] = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });

  for (const m of msgs) {
    if (m.role === 'tool_result') {
      out.push({ role: 'tool', content: m.content, tool_call_id: m.toolCallId });
    } else if (m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.argumentsJson },
        })),
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
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
export function openRouterProvider(options?: OpenRouterProviderOptions): LLMProvider {
  const model = options?.model ?? 'anthropic/claude-3-5-sonnet';
  const baseUrl = options?.baseUrl ?? 'https://openrouter.ai/api/v1';
  const apiKey = options?.apiKey ?? '';

  return {
    async *stream(request: StreamRequest): AsyncIterable<StreamChunk> {
      const body: Record<string, unknown> = {
        model,
        stream: true,
        messages: buildMessages(request.messages, request.systemPrompt),
      };

      if (request.tools.length > 0) {
        body['tools'] = request.tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: z.toJSONSchema(t.inputSchema),
          },
        }));
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`OpenRouter ${String(response.status)}: ${text}`);
      }

      if (!response.body) {
        throw new Error('OpenRouter: response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Track tool call IDs by index since the id is only in the first delta per index.
      const toolCallIdByIndex = new Map<number, string>();

      try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { type: 'message_stop' };
              return;
            }

            const parsed = JSON.parse(data) as OaiChunk;
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const { delta, finish_reason } = choice;

            if (delta.content) {
              yield { type: 'text_delta', delta: delta.content };
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;

                if (tc.id) {
                  toolCallIdByIndex.set(idx, tc.id);
                }

                const tcId = toolCallIdByIndex.get(idx);
                if (!tcId) continue;

                if (tc.function.name) {
                  yield { type: 'tool_call_start', toolCallId: tcId, name: tc.function.name };
                }

                if (tc.function.arguments) {
                  yield { type: 'tool_call_delta', toolCallId: tcId, delta: tc.function.arguments };
                }
              }
            }

            if (finish_reason === 'tool_calls') {
              for (const [, id] of toolCallIdByIndex) {
                yield { type: 'tool_call_end', toolCallId: id };
              }
              yield { type: 'message_stop' };
              return;
            }

            if (finish_reason === 'stop') {
              yield { type: 'message_stop' };
              return;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
