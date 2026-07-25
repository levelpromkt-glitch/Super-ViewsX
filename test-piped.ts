async function test() {
  try {
    const res = await fetch('https://pipedapi.kavin.rocks/streams/_ZBUZSap3yI');
    const data = await res.json();
    console.log("Subtitles:", data.subtitles.map((s: any) => s.name));
  } catch(e) {
    console.error(e);
  }
}
test();
