# ngx-ai-agent

[![npm](https://img.shields.io/npm/v/ngx-ai-agent)](https://www.npmjs.com/package/ngx-ai-agent)
[![license](https://img.shields.io/npm/l/ngx-ai-agent)](./LICENSE)
[![Angular](https://img.shields.io/badge/angular-21%2B-red)](https://angular.dev)
[![zoneless](https://img.shields.io/badge/zoneless-✓-green)](https://angular.dev/guide/experimental/zoneless)

**Signals-native LLM agents with tool calling for Angular 21+.**

The Angular ecosystem has great UI libraries but no signals-first LLM client. `ngx-ai-agent` fills that gap: one `agent()` call gives you reactive `Signal<Message[]>` and `Signal<AgentStatus>` that drive fine-grained zoneless change detection — no RxJS, no callbacks, no manual subscriptions.

## Install

```bash
npm install ngx-ai-agent zod
```

## 30-second example

```typescript
import { Component, computed } from '@angular/core';
import { agent, defineTool, openRouterProvider } from 'ngx-ai-agent';
import { z } from 'zod';

// 1. Define a type-safe tool
const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a city.',
  inputSchema: z.object({ city: z.string() }),
  handler: async ({ city }) => `Sunny, 22°C in ${city}`,
});

// 2. Create an agent — returns plain signals, no DI required
const chat = agent({
  provider: openRouterProvider({ apiKey: 'sk-or-…', model: 'anthropic/claude-3-5-sonnet' }),
  tools: [weatherTool],
  systemPrompt: 'You are a helpful assistant.',
});

// 3. Bind signals directly in your component template
@Component({
  standalone: true,
  template: `
    @for (msg of chat.messages(); track msg.id) {
      <div [class]="msg.role">{{ msg.content }}</div>
    }
    <button [disabled]="chat.status() !== 'idle'" (click)="send()">Send</button>
  `,
})
export class ChatComponent {
  protected readonly chat = chat;
  protected send() { this.chat.send('What is the weather in Tokyo?'); }
}
```

## API

### `agent(options?)`

Creates a signals-native LLM agent. Returns an `AgentRef`.

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `LLMProvider` | Streaming provider. Defaults to `openRouterProvider()`. |
| `tools` | `ToolDefinition[] \| Signal<ToolDefinition[]>` | Tools available to the model. Hot-swappable via Signal. |
| `systemPrompt` | `string` | System prompt injected as the first message. |

**`AgentRef`**

| Member | Type | Description |
|--------|------|-------------|
| `messages` | `Signal<Message[]>` | Conversation history, updated token-by-token. |
| `status` | `Signal<AgentStatus>` | `'idle' \| 'streaming' \| 'tool_call' \| 'error'` |
| `error` | `Signal<string \| null>` | Last error message, or `null`. |
| `send(text)` | `void` | Append user message and start streaming. No-ops unless idle. |
| `reset()` | `void` | Clear history and return to `idle`. |

### `defineTool(definition)`

```typescript
const myTool = defineTool({
  name: 'search',
  description: 'Search the web.',
  inputSchema: z.object({ query: z.string() }),
  handler: async ({ query }) => `Results for: ${query}`,
});
```

### Providers

```typescript
// OpenRouter — access 200+ models via a single API key
openRouterProvider({ apiKey: 'sk-or-…', model: 'anthropic/claude-3-5-sonnet' })

// Direct Anthropic
anthropicProvider({ apiKey: 'sk-ant-…', model: 'claude-opus-4-7-20250514' })
```

## How it compares

| Feature | ngx-ai-agent | Vercel AI SDK (`useChat`) |
|---------|-------------|--------------------------|
| Framework | Angular 21+ | React / Svelte / Vue / Solid |
| Reactivity | Angular Signals | React state / hooks |
| Zoneless support | ✅ First-class | N/A |
| Tool calling | ✅ Zod schemas | ✅ Zod schemas |
| Streaming | ✅ Token-by-token signals | ✅ RSC / stream |
| SSR | ✅ | ✅ |
| DI required | ❌ Plain factory | ❌ Hook |
| Bundle (est.) | ~4 kB | ~30 kB (React runtime) |

## Demo

Run the included demo app:

```bash
# Build the library first
npm run build:lib

# Serve the demo
npm run start
```

Then open `http://localhost:4200` and enter your OpenRouter API key.

The demo includes a live weather tool (Open-Meteo, no extra API key required) to demonstrate tool calling.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full public API surface and design decisions.

## Contributing

```bash
npm run build:lib     # build the library
npm run lint          # lint all projects
npm run test          # run vitest
```

## License

MIT
