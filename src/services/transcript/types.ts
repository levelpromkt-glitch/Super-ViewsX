export interface TranscriptLine {
  time: string;
  seconds: number;
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptMetadata {
  title?: string | null;
  channelTitle?: string | null;
  channelId?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  language?: string | null;
  publishedAt?: string | null;
}

export type ProviderErrorReason =
  | 'timeout'
  | 'captcha'
  | 'no_captions'
  | 'network_error'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'invalid_video'
  | 'unknown';

export type ProviderResult =
  | {
      success: true;
      lines: TranscriptLine[];
      qualityScore: number;
      rawResponse: Record<string, unknown>;
    }
  | {
      success: false;
      reason: ProviderErrorReason;
    };

export interface TranscriptProvider {
  name: string;
  getTranscript(videoId: string): Promise<ProviderResult>;
}

export interface MetadataProvider {
  name: string;
  getMetadata(videoId: string): Promise<TranscriptMetadata>;
}

export interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority: number;
  timeoutMs: number;
}
