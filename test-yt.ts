import { YoutubeTranscript } from 'youtube-transcript';

async function test() {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript('_ZBUZSap3yI');
    console.log("SUCCESS, found", transcript.length, "lines.");
  } catch (error: any) {
    console.error("ERROR:", error.message);
  }
}

test();
