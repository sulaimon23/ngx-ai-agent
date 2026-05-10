/** Role of a message participant in the conversation. */
export type MessageRole = 'user' | 'assistant' | 'tool_result';

/** A single turn in the conversation. */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Present when this is a tool_result message. */
  toolCallId?: string;
  /** Present when this is a tool_result message. */
  toolName?: string;
  /**
   * Present on assistant messages that triggered tool calls.
   * Stored so providers can reconstruct the correct API format for follow-up requests.
   */
  toolCalls?: ToolCall[];
}

/** A pending tool call emitted by the LLM during streaming. */
export interface ToolCall {
  id: string;
  name: string;
  /** Accumulated JSON string of arguments as emitted by the model. */
  argumentsJson: string;
}
