import { defineTool } from './tool';
import { agent } from './agent';
import { z } from 'zod';

describe('public-api smoke tests (Phase 1 stubs)', () => {
  it('defineTool returns the definition unchanged', () => {
    const tool = defineTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: z.object({ value: z.string() }),
      handler: async ({ value }) => value,
    });
    expect(tool.name).toBe('test_tool');
  });

  it('agent() throws until Phase 2 is implemented', () => {
    expect(() => agent()).toThrow('Not implemented');
  });
});
