

async function testRapidAPI() {
  const videoId = 'HO10GrtDzZU';
  const apiKey = '45490ac303msh04ab25a2cb3c9d2p1fc27cjsn31ead2851cc0';

  const url = `https://youtube-transcript3.p.rapidapi.com/api/transcript-with-url?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}&flat_text=false&lang=pt`;
  const options = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'youtube-transcript3.p.rapidapi.com'
    }
  };

  try {
    const response = await fetch(url, options);
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Body:', text.substring(0, 500));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testRapidAPI();
