# ngx-ai-agent

[![npm](https://img.shields.io/npm/v/ngx-ai-agent)](https://www.npmjs.com/package/ngx-ai-agent)
[![license](https://img.shields.io/npm/l/ngx-ai-agent)](https://github.com/your-org/ngx-ai-agent/blob/main/LICENSE)
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
import { Component } from '@angular/core';
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

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `LLMProvider` | Streaming provider. Defaults to `openRouterProvider()`. |
| `tools` | `ToolDefinition[] \| Signal<ToolDefinition[]>` | Tools available to the model. Hot-swappable via Signal. |
| `systemPrompt` | `string` | System prompt injected as the first message. |

**`AgentRef`** signals: `messages`, `status`, `error`  
**`AgentRef`** methods: `send(text)`, `reset()`

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
openRouterProvider({ apiKey: 'sk-or-…', model: 'anthropic/claude-3-5-sonnet' })
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
| DI required | ❌ Plain factory | ❌ Hook |
| Bundle size | ~14 kB packed | ~30 kB (React runtime) |

## License

MIT — see [LICENSE](https://github.com/your-org/ngx-ai-agent/blob/main/LICENSE)
