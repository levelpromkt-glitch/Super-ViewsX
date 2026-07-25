import { fetch } from 'undici';

async function test() {
  const res = await fetch('http://localhost:8080/_server/?_serverFnId=fetchTranscriptWithFallbackFn&_serverFnName=fetchTranscriptWithFallbackFn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([
      {
        data: {
          videoId: '_ZBUZSap3yI'
        }
      }
    ])
  });

  const text = await res.text();
  console.log(res.status);
  console.log(text);
}

test();
