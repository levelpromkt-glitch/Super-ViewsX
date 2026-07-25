import { ProviderResult, TranscriptProvider } from '../types';
import { formatTime } from '../utils';

export class ExternalTranscriptProvider implements TranscriptProvider {
  name = 'RapidAPI';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getTranscript(videoId: string): Promise<ProviderResult> {
    if (!this.apiKey) {
      return { success: false, reason: 'provider_unavailable' };
    }

    try {
      // Implementação mockada. Quando for assinar a API, basta substituir a URL e Headers.
      // Exemplo usando "YouTube Transcript API" do RapidAPI
      const url = `https://youtube-transcript3.p.rapidapi.com/api/transcript-with-url?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}&flat_text=false`;
      const options = {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'youtube-transcript3.p.rapidapi.com'
        }
      };

      const response = await fetch(url, options);

      if (response.status === 429) {
        return { success: false, reason: 'rate_limit' };
      }
      if (!response.ok) {
        return { success: false, reason: 'network_error' };
      }

      const json = await response.json();
      
      if (!json || !json.success || !Array.isArray(json.transcript)) {
        return { success: false, reason: 'no_captions' };
      }

      const lines = json.transcript.map((item: any) => {
        const startNum = parseFloat(item.offset) || 0;
        const durationNum = parseFloat(item.duration) || 0;
        return {
          time: formatTime(startNum),
          seconds: startNum,
          text: item.text,
          start: startNum,
          duration: durationNum,
        };
      });

      return {
        success: true,
        lines,
        qualityScore: 75, // RapidAPI geralmente usa o mesmo parser do YT
        rawResponse: json,
      };

    } catch (error: any) {
      if (error?.message?.includes('timeout') || error?.name === 'AbortError') {
        return { success: false, reason: 'timeout' };
      }
      return { success: false, reason: 'network_error' };
    }
  }
}
