async function test() {
  try {
    const res = await fetch('https://corsproxy.io/?url=' + encodeURIComponent('https://www.youtube.com/watch?v=_ZBUZSap3yI'));
    const html = await res.text();
    console.log("Length of HTML:", html.length);
    console.log("Has captions?", html.includes('captionTracks'));
  } catch(e) {
    console.error(e);
  }
}
test();
