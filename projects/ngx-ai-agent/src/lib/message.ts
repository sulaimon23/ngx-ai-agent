/** Role of a message participant in the conversation. */
export type MessageRole = 'user' | 'assistant' | 'tool_result';

/** A single turn in the conversation. */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Present when this message is a tool result. */
  toolCallId?: string;
  /** Present when this message was the outcome of a tool call. */
  toolName?: string;
}

/** A pending tool call emitted by the LLM during streaming. */
export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string of arguments as emitted by the model. */
  argumentsJson: string;
}
