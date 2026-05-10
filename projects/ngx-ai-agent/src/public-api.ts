/*
 * Public API Surface of ngx-ai-agent
 */

// Core
export { agent } from './lib/agent';
export type { AgentRef, AgentOptions, AgentStatus } from './lib/agent';

// Messages
export type { Message, MessageRole, ToolCall } from './lib/message';

// Tools
export { defineTool } from './lib/tool';
export type { ToolDefinition } from './lib/tool';

// Provider interface
export type { LLMProvider, StreamRequest, StreamChunk } from './lib/provider';

// Built-in providers
export { openRouterProvider } from './lib/providers/open-router';
export type { OpenRouterProviderOptions } from './lib/providers/open-router';

export { anthropicProvider } from './lib/providers/anthropic';
export type { AnthropicProviderOptions } from './lib/providers/anthropic';
