import type { z } from 'zod';

/** A registered tool the model can invoke. */
export interface ToolDefinition<TInput = unknown> {
  /** Unique machine-readable name (snake_case). */
  name: string;
  /** Human-readable description sent to the model. */
  description: string;
  /** Zod schema describing the JSON input the model will provide. */
  inputSchema: z.ZodType<TInput>;
  /**
   * Executes the tool and returns a plain string the model reads as the result.
   */
  handler: (input: TInput) => Promise<string>;
}

/**
 * Helper that creates a fully-typed {@link ToolDefinition}.
 *
 * @example
 * import { z } from 'zod';
 *
 * const weatherTool = defineTool({
 *   name: 'get_weather',
 *   description: 'Returns current weather for a city.',
 *   inputSchema: z.object({ city: z.string() }),
 *   handler: async ({ city }) => `Sunny, 22 °C in ${city}`,
 * });
 */
export function defineTool<TInput>(
  definition: ToolDefinition<TInput>,
): ToolDefinition<TInput> {
  return definition;
}
