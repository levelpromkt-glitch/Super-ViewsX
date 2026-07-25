import { ProviderConfig } from './types';

export const providerConfigs: Record<string, ProviderConfig> = {
  YoutubeTranscript: {
    name: 'YoutubeTranscript',
    enabled: true,
    priority: 10,
    timeoutMs: 5000,
  },
  RapidAPI: {
    name: 'RapidAPI',
    enabled: true,
    priority: 50,
    timeoutMs: 10000,
  },
  Whisper: {
    name: 'Whisper',
    enabled: false,
    priority: 100,
    timeoutMs: 20000,
  },
};

export function getProviderConfig(name: string): ProviderConfig {
  return (
    providerConfigs[name] || {
      name,
      enabled: false,
      priority: 0,
      timeoutMs: 5000,
    }
  );
}
