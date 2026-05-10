import type { Message } from './message';
import type { ToolDefinition } from './tool';

/** A single streaming chunk emitted by a provider. */
export type StreamChunk =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start'; toolCallId: string; name: string }
  | { type: 'tool_call_delta'; toolCallId: string; delta: string }
  | { type: 'tool_call_end'; toolCallId: string }
  | { type: 'message_stop' };

/** The full request sent to a provider's stream method. */
export interface StreamRequest {
  messages: Message[];
  tools: ToolDefinition[];
  systemPrompt?: string;
}

/**
 * Implement this interface to add a new LLM backend.
 *
 * @example
 * class MyProvider implements LLMProvider {
 *   async *stream(request: StreamRequest): AsyncIterable<StreamChunk> {
 *     // yield StreamChunk objects
 *   }
 * }
 */
export interface LLMProvider {
  stream(request: StreamRequest): AsyncIterable<StreamChunk>;
}
