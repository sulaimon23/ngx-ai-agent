import { z } from 'zod';
import type { Message } from '../message';
import type { LLMProvider, StreamChunk, StreamRequest } from '../provider';

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

// Internal types matching Anthropic's streaming SSE event format.

type AntContentBlockType = 'text' | 'tool_use';

interface AntContentBlockStart {
  type: 'content_block_start';
  index: number;
  content_block: { type: AntContentBlockType; id?: string; name?: string; text?: string };
}

interface AntContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'input_json_delta'; partial_json: string };
}

interface AntContentBlockStop {
  type: 'content_block_stop';
  index: number;
}

interface AntMessageStop {
  type: 'message_stop';
}

interface AntMessageDelta {
  type: 'message_delta';
  delta: { stop_reason: string | null };
}

type AntEvent =
  | AntContentBlockStart
  | AntContentBlockDelta
  | AntContentBlockStop
  | AntMessageStop
  | AntMessageDelta
  | { type: string };

function buildAntMessages(msgs: Message[]): unknown[] {
  return msgs.map(m => {
    if (m.role === 'tool_result') {
      return {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content },
        ],
      };
    }
    if (m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.toolCalls.map(tc => ({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.argumentsJson) as unknown,
          })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
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
export function anthropicProvider(options?: AnthropicProviderOptions): LLMProvider {
  const model = options?.model ?? 'claude-3-5-sonnet-20241022';
  const maxTokens = options?.maxTokens ?? 4096;
  const apiKey = options?.apiKey ?? '';

  return {
    async *stream(request: StreamRequest): AsyncIterable<StreamChunk> {
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: buildAntMessages(request.messages),
      };

      if (request.systemPrompt) {
        body['system'] = request.systemPrompt;
      }

      if (request.tools.length > 0) {
        body['tools'] = request.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: z.toJSONSchema(t.inputSchema),
        }));
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Anthropic ${String(response.status)}: ${text}`);
      }

      if (!response.body) {
        throw new Error('Anthropic: response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Map block index → tool call id for the current message.
      const toolIdByIndex = new Map<number, string>();

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

            const event = JSON.parse(data) as AntEvent;

            if (event.type === 'content_block_start') {
              const e = event as AntContentBlockStart;
              if (e.content_block.type === 'tool_use' && e.content_block.id && e.content_block.name) {
                toolIdByIndex.set(e.index, e.content_block.id);
                yield {
                  type: 'tool_call_start',
                  toolCallId: e.content_block.id,
                  name: e.content_block.name,
                };
              }
            } else if (event.type === 'content_block_delta') {
              const e = event as AntContentBlockDelta;
              if (e.delta.type === 'text_delta') {
                yield { type: 'text_delta', delta: e.delta.text };
              } else {
                const tcId = toolIdByIndex.get(e.index);
                if (tcId) {
                  yield { type: 'tool_call_delta', toolCallId: tcId, delta: e.delta.partial_json };
                }
              }
            } else if (event.type === 'content_block_stop') {
              const e = event as AntContentBlockStop;
              const tcId = toolIdByIndex.get(e.index);
              if (tcId) {
                yield { type: 'tool_call_end', toolCallId: tcId };
              }
            } else if (event.type === 'message_delta') {
              const e = event as AntMessageDelta;
              if (e.delta.stop_reason === 'end_turn' || e.delta.stop_reason === 'tool_use') {
                yield { type: 'message_stop' };
                return;
              }
            } else if (event.type === 'message_stop') {
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
