import { Component, signal, computed } from '@angular/core';
import { agent, defineTool, openRouterProvider } from 'ngx-ai-agent';
import type { AgentRef, AgentStatus } from 'ngx-ai-agent';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Real weather tool — Open-Meteo (no API key required)
// Swap this out for a Composio tool by replacing the handler below.
// ---------------------------------------------------------------------------

interface GeoResult {
  results?: { latitude: number; longitude: number; name: string; country: string }[];
}

interface OpenMeteoResponse {
  current_weather?: { temperature: number; windspeed: number; weathercode: number };
}

function weatherCodeToText(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 49) return 'Foggy';
  if (code <= 69) return 'Rainy';
  if (code <= 79) return 'Snowy';
  if (code <= 99) return 'Stormy';
  return 'Unknown';
}

const weatherTool = defineTool({
  name: 'get_weather',
  description:
    'Get the current weather conditions for any city. Use this whenever the user asks about weather.',
  inputSchema: z.object({
    city: z.string().describe('City name to look up, e.g. "Tokyo" or "New York"'),
  }),
  async handler({ city }) {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
    );
    const geoData = (await geoRes.json()) as GeoResult;
    const loc = geoData.results?.[0];
    if (!loc) return `Could not find location data for "${city}".`;

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${String(loc.latitude)}&longitude=${String(loc.longitude)}&current_weather=true`,
    );
    const wxData = (await wxRes.json()) as OpenMeteoResponse;
    const w = wxData.current_weather;
    if (!w) return `No current weather data for ${loc.name}.`;

    return (
      `${loc.name}, ${loc.country}: ${weatherCodeToText(w.weathercode)}, ` +
      `${String(w.temperature)}°C, wind ${String(w.windspeed)} km/h`
    );
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly apiKey = signal(localStorage.getItem('ngx-agent-apiKey') ?? '');
  protected readonly model = signal(localStorage.getItem('ngx-agent-model') ?? 'anthropic/claude-3-5-sonnet');
  protected readonly inputText = signal('');
  protected readonly activeChat = signal<AgentRef | null>(null);

  protected readonly isConnected = computed(() => this.activeChat() !== null);

  protected readonly statusLabel = computed((): string => {
    const status = this.activeChat()?.status() ?? 'idle';
    const labels: Record<AgentStatus, string> = {
      idle: '',
      streaming: 'Thinking…',
      tool_call: 'Calling tool…',
      error: 'Error',
    };
    return labels[status];
  });

  protected connect(): void {
    const key = this.apiKey().trim();
    if (!key) return;
    this.activeChat.set(
      agent({
        provider: openRouterProvider({ apiKey: key, model: this.model() }),
        tools: [weatherTool],
        systemPrompt:
          'You are a helpful assistant. When asked about weather, use the get_weather tool.',
      }),
    );
  }

  protected disconnect(): void {
    this.activeChat.set(null);
  }

  protected updateApiKey(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.apiKey.set(value);
    localStorage.setItem('ngx-agent-apiKey', value);
  }

  protected updateModel(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.model.set(value);
    localStorage.setItem('ngx-agent-model', value);
  }

  protected updateInput(event: Event): void {
    this.inputText.set((event.target as HTMLTextAreaElement).value);
  }

  protected send(): void {
    const chat = this.activeChat();
    const text = this.inputText().trim();
    if (!chat || !text || chat.status() !== 'idle') return;
    this.inputText.set('');
    chat.send(text);
  }

  protected onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  protected resetChat(): void {
    this.activeChat()?.reset();
  }
}
