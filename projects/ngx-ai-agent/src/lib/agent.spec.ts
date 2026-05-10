import { signal } from '@angular/core';
import { agent } from './agent';
import { defineTool } from './tool';
import type { LLMProvider, StreamChunk } from './provider';
import { z } from 'zod';

function mockProvider(chunks: StreamChunk[]): LLMProvider {
  return {
    async *stream() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('agent()', () => {
  it('starts in idle state with empty messages', () => {
    const chat = agent({ provider: mockProvider([]) });
    expect(chat.status()).toBe('idle');
    expect(chat.messages()).toEqual([]);
    expect(chat.error()).toBeNull();
  });

  it('send() adds user message and streams text tokens', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text_delta', delta: 'Hello' },
      { type: 'text_delta', delta: ' world' },
      { type: 'message_stop' },
    ];
    const chat = agent({ provider: mockProvider(chunks) });

    chat.send('Hi');

    expect(chat.messages()[0].role).toBe('user');
    expect(chat.messages()[0].content).toBe('Hi');
    expect(chat.status()).toBe('streaming');

    await flushPromises();

    const msgs = chat.messages();
    expect(msgs).toHaveLength(2);
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('Hello world');
    expect(chat.status()).toBe('idle');
  });

  it('send() no-ops when status is not idle', async () => {
    let resolveStream!: () => void;
    const provider: LLMProvider = {
      async *stream() {
        await new Promise<void>(r => { resolveStream = r; });
        yield { type: 'message_stop' };
      },
    };

    const chat = agent({ provider });
    chat.send('first');
    chat.send('second'); // should be ignored

    expect(chat.messages()).toHaveLength(2); // user + empty assistant placeholder

    resolveStream();
    await flushPromises();
    // Only one assistant turn — 'second' was ignored
    expect(chat.messages().filter(m => m.role === 'user')).toHaveLength(1);
  });

  it('reset() clears all messages and returns to idle', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text_delta', delta: 'Hi' },
      { type: 'message_stop' },
    ];
    const chat = agent({ provider: mockProvider(chunks) });

    chat.send('Hello');
    await flushPromises();

    expect(chat.messages()).toHaveLength(2);

    chat.reset();
    expect(chat.messages()).toEqual([]);
    expect(chat.status()).toBe('idle');
    expect(chat.error()).toBeNull();
  });

  it('sets status to error when provider throws', async () => {
    const provider: LLMProvider = {
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new Error('Network failure');
      },
    };

    const chat = agent({ provider });
    chat.send('Hello');
    await flushPromises();

    expect(chat.status()).toBe('error');
    expect(chat.error()).toBe('Network failure');
  });

  it('accepts a tools Signal that can be hot-swapped', () => {
    const weatherTool = defineTool({
      name: 'get_weather',
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      handler: async ({ city }) => `Sunny in ${city}`,
    });

    const tools = signal([weatherTool]);
    const chat = agent({ provider: mockProvider([]), tools });
    // No assertion needed — this just verifies the type compiles without error.
    expect(chat).toBeDefined();
  });

  it('executes a tool call and continues conversation', async () => {
    const weatherTool = defineTool({
      name: 'get_weather',
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      handler: async ({ city }) => `Sunny in ${city}`,
    });

    // First stream: tool call
    // Second stream: text after tool result
    let callCount = 0;
    const provider: LLMProvider = {
      async *stream() {
        callCount++;
        if (callCount === 1) {
          yield { type: 'tool_call_start', toolCallId: 'tc1', name: 'get_weather' };
          yield { type: 'tool_call_delta', toolCallId: 'tc1', delta: '{"city":"Tokyo"}' };
          yield { type: 'tool_call_end', toolCallId: 'tc1' };
          yield { type: 'message_stop' };
        } else {
          yield { type: 'text_delta', delta: 'The weather in Tokyo is Sunny in Tokyo.' };
          yield { type: 'message_stop' };
        }
      },
    };

    const chat = agent({ provider, tools: [weatherTool] });
    chat.send('Weather in Tokyo?');
    await flushPromises();

    const msgs = chat.messages();
    // user → assistant(tool call) → tool_result → assistant(final text)
    expect(msgs.find(m => m.role === 'user')?.content).toBe('Weather in Tokyo?');
    expect(msgs.find(m => m.role === 'tool_result')?.content).toBe('Sunny in Tokyo');
    expect(msgs.find(m => m.role === 'tool_result')?.toolName).toBe('get_weather');
    expect(msgs[msgs.length - 1].content).toBe('The weather in Tokyo is Sunny in Tokyo.');
    expect(chat.status()).toBe('idle');
  });
});
