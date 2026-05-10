import { z } from 'zod';
import { defineTool } from './tool';

describe('defineTool()', () => {
  it('returns the definition object unchanged', () => {
    const schema = z.object({ city: z.string() });
    const handler = async ({ city }: { city: string }) => `Weather in ${city}`;

    const tool = defineTool({
      name: 'get_weather',
      description: 'Get the current weather for a city.',
      inputSchema: schema,
      handler,
    });

    expect(tool.name).toBe('get_weather');
    expect(tool.description).toBe('Get the current weather for a city.');
    expect(tool.inputSchema).toBe(schema);
    expect(tool.handler).toBe(handler);
  });

  it('validates input at runtime via inputSchema.parse', async () => {
    const tool = defineTool({
      name: 'add',
      description: 'Add two numbers.',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }) => String(a + b),
    });

    const input = tool.inputSchema.parse({ a: 1, b: 2 });
    const result = await tool.handler(input);
    expect(result).toBe('3');
  });

  it('throws when input fails schema validation', () => {
    const tool = defineTool({
      name: 'greet',
      description: 'Greet a user.',
      inputSchema: z.object({ name: z.string() }),
      handler: async ({ name }) => `Hello, ${name}!`,
    });

    expect(() => tool.inputSchema.parse({ name: 42 })).toThrow();
  });
});
