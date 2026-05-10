import { openRouterProvider } from './open-router';
import { z } from 'zod';
import { defineTool } from '../tool';

function sseLines(...events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`data: ${e}\n\n`));
      }
      controller.close();
    },
  });
}

function mockFetch(body: ReadableStream<Uint8Array>, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(body, {
      status,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
}

describe('openRouterProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('yields text_delta chunks for a plain text response', async () => {
    const body = sseLines(
      JSON.stringify({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }] }),
    );
    mockFetch(body);

    const provider = openRouterProvider({ apiKey: 'test', model: 'test-model' });
    const chunks = [];
    for await (const chunk of provider.stream({ messages: [], tools: [] })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({ type: 'text_delta', delta: 'Hello' });
    expect(chunks).toContainEqual({ type: 'text_delta', delta: ' world' });
    expect(chunks[chunks.length - 1].type).toBe('message_stop');
  });

  it('yields tool_call chunks for a tool use response', async () => {
    const body = sseLines(
      JSON.stringify({
        choices: [{
          delta: { tool_calls: [{ index: 0, id: 'tc1', function: { name: 'get_weather', arguments: '' } }] },
          finish_reason: null,
        }],
      }),
      JSON.stringify({
        choices: [{
          delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":"Tokyo"}' } }] },
          finish_reason: null,
        }],
      }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
    );
    mockFetch(body);

    const tool = defineTool({
      name: 'get_weather',
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      handler: async ({ city }) => `Sunny in ${city}`,
    });

    const provider = openRouterProvider({ apiKey: 'test' });
    const chunks = [];
    for await (const chunk of provider.stream({ messages: [], tools: [tool] })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({ type: 'tool_call_start', toolCallId: 'tc1', name: 'get_weather' });
    expect(chunks).toContainEqual({ type: 'tool_call_delta', toolCallId: 'tc1', delta: '{"city":"Tokyo"}' });
    expect(chunks).toContainEqual({ type: 'tool_call_end', toolCallId: 'tc1' });
    expect(chunks[chunks.length - 1].type).toBe('message_stop');
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const provider = openRouterProvider({ apiKey: 'bad-key' });
    await expect(async () => {
      for await (const _ of provider.stream({ messages: [], tools: [] })) { /* empty */ }
    }).rejects.toThrow('401');
  });
});
