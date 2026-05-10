import { isSignal, signal, Signal } from '@angular/core';
import type { Message, ToolCall } from './message';
import type { LLMProvider } from './provider';
import type { ToolDefinition } from './tool';
import { openRouterProvider } from './providers/open-router';

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
export function agent(options?: AgentOptions): AgentRef {
  const _messages = signal<Message[]>([]);
  const _status = signal<AgentStatus>('idle');
  const _error = signal<string | null>(null);

  const provider: LLMProvider = options?.provider ?? openRouterProvider();
  const toolsSig: Signal<ToolDefinition[]> = isSignal(options?.tools)
    ? options.tools
    : signal(options?.tools ?? []);

  function send(text: string): void {
    if (_status() !== 'idle') return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    _messages.update(msgs => [...msgs, userMessage]);
    _status.set('streaming');
    _error.set(null);

    // Intentionally fire-and-forget; errors are caught inside runConversation.
    void runConversation();
  }

  async function runConversation(): Promise<void> {
    try {
      await streamTurn();
    } catch (err) {
      _status.set('error');
      _error.set(err instanceof Error ? err.message : String(err));
    }
  }

  async function streamTurn(): Promise<void> {
    const assistantId = crypto.randomUUID();
    let assistantContent = '';
    const toolCallMap = new Map<string, ToolCall>();

    const messagesSnapshot = _messages();

    _messages.update(msgs => [
      ...msgs,
      { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString() },
    ]);

    const stream = provider.stream({
      messages: messagesSnapshot,
      tools: toolsSig(),
      systemPrompt: options?.systemPrompt,
    });

    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'text_delta':
          assistantContent += chunk.delta;
          _messages.update(msgs =>
            msgs.map(m => (m.id === assistantId ? { ...m, content: assistantContent } : m)),
          );
          break;

        case 'tool_call_start':
          _status.set('tool_call');
          toolCallMap.set(chunk.toolCallId, {
            id: chunk.toolCallId,
            name: chunk.name,
            argumentsJson: '',
          });
          break;

        case 'tool_call_delta': {
          const tc = toolCallMap.get(chunk.toolCallId);
          if (tc) tc.argumentsJson += chunk.delta;
          break;
        }

        case 'tool_call_end':
        case 'message_stop':
          break;
      }
    }

    if (assistantContent === '' && toolCallMap.size === 0) {
      _messages.update(msgs => msgs.filter(m => m.id !== assistantId));
      _status.set('idle');
      return;
    }

    if (toolCallMap.size > 0) {
      const toolCalls = [...toolCallMap.values()];

      // Stamp tool calls onto the assistant message so the provider can reconstruct the API request.
      _messages.update(msgs =>
        msgs.map(m => (m.id === assistantId ? { ...m, toolCalls } : m)),
      );

      const tools = toolsSig();
      for (const tc of toolCalls) {
        const tool = tools.find(t => t.name === tc.name);
        if (!tool) throw new Error(`Tool not found: ${tc.name}`);

        const rawInput: unknown = JSON.parse(tc.argumentsJson);
        const validatedInput = tool.inputSchema.parse(rawInput);
        const result = await tool.handler(validatedInput);

        _messages.update(msgs => [
          ...msgs,
          {
            id: crypto.randomUUID(),
            role: 'tool_result',
            content: result,
            createdAt: new Date().toISOString(),
            toolCallId: tc.id,
            toolName: tc.name,
          },
        ]);
      }

      _status.set('streaming');
      await streamTurn();
    } else {
      _status.set('idle');
    }
  }

  function reset(): void {
    _messages.set([]);
    _status.set('idle');
    _error.set(null);
  }

  return {
    messages: _messages.asReadonly(),
    status: _status.asReadonly(),
    error: _error.asReadonly(),
    send,
    reset,
  };
}
