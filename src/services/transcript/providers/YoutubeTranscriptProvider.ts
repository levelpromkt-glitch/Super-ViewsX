import { ProviderResult, TranscriptProvider } from '../types';
import { YoutubeTranscript } from 'youtube-transcript';
import { formatTime } from '../utils';

export class YoutubeTranscriptProvider implements TranscriptProvider {
  name = 'YoutubeTranscript';

  async getTranscript(videoId: string): Promise<ProviderResult> {
    try {
      const raw = await YoutubeTranscript.fetchTranscript(videoId);
      
      const lines = raw.map((item) => ({
        time: formatTime(item.offset / 1000),
        seconds: item.offset / 1000,
        text: item.text,
        start: item.offset / 1000,
        duration: item.duration / 1000,
      }));

      return {
        success: true,
        lines,
        qualityScore: 70, // Youtube CC gerada automaticamente tem qualidade média
        rawResponse: { data: raw },
      };
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('disabled') || msg.includes('No transcripts')) {
        return { success: false, reason: 'no_captions' };
      }
      if (msg.includes('CAPTCHA') || msg.includes('Sign in')) {
        return { success: false, reason: 'captcha' };
      }
      if (msg.includes('timeout') || error?.code === 'ETIMEDOUT') {
        return { success: false, reason: 'timeout' };
      }
      return { success: false, reason: 'network_error' };
    }
  }
}
