export type Sentence = { start: number; end: number; text: string };
export type LineLike = { text: string; start: number; duration: number };
// [word, start, end] for every spoken word, in order.
export type WordTiming = [string, number, number];

// The VM's transcript "lines" are whole speaker utterances (some run 60s), far
// too coarse to cut on: a boundary snapped to a line edge lands mid-thought or
// drags in a whole extra paragraph. When word timings are available, split each
// line into sentences and time every sentence from the words it contains.
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-ZÀ-Ü0-9"“¿¡])/;

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const countTokens = (t: string) => t.split(/\s+/).filter(Boolean).length;

// The formatted line text ("147 reais", "1 curso") and the raw words ("cento
// e quarenta e sete reais", "um curso") disagree on numbers, so counting words
// drifts. Instead walk the text tokens and match each one to the next equal
// word within a short window; an unmatched token (a number) just holds its
// place until the next token re-syncs. Returns, for each token, the index of
// the word it starts at.
const alignTokens = (tokens: string[], wordNorms: string[], from: number, to: number): number[] => {
  const map: number[] = new Array(tokens.length);
  let wp = from;
  let misses = 0;
  for (let ti = 0; ti < tokens.length; ti++) {
    const tk = norm(tokens[ti]);
    let found = -1;
    if (tk) {
      const limit = Math.min(to, wp + (misses >= 2 ? 24 : 8));
      for (let j = wp; j < limit; j++) {
        if (wordNorms[j] === tk) { found = j; break; }
      }
    }
    if (found >= 0) {
      map[ti] = found;
      wp = found + 1;
      misses = 0;
    } else {
      map[ti] = Math.min(wp, Math.max(from, to - 1));
      misses++;
    }
    if (ti > 0 && map[ti] < map[ti - 1]) map[ti] = map[ti - 1];
  }
  return map;
};

export const buildSentences = (lines: LineLike[], words?: WordTiming[]): Sentence[] => {
  const byLine = (): Sentence[] => lines.map((l) => ({ start: l.start, end: l.start + l.duration, text: l.text }));
  if (!words || words.length === 0) return byLine();

  const wordNorms = words.map((w) => norm(String(w[0])));
  const out: Sentence[] = [];
  let wi = 0;

  for (const l of lines) {
    const lineEnd = l.start + l.duration;
    while (wi < words.length && words[wi][1] < l.start - 0.1) wi++;
    let wj = wi;
    while (wj < words.length && words[wj][2] <= lineEnd + 0.1) wj++;
    const from = wi;
    const to = wj;
    wi = wj;

    const rawParts = l.text.split(SENTENCE_SPLIT).map((p) => p.trim()).filter(Boolean);
    // Glue tiny fragments ("Sim.", "Uhum.") onto the previous sentence.
    const parts: string[] = [];
    for (const p of rawParts) {
      if (parts.length > 0 && countTokens(p) < 3) parts[parts.length - 1] += ' ' + p;
      else parts.push(p);
    }

    if (to <= from || parts.length <= 1) {
      out.push({ start: l.start, end: lineEnd, text: l.text });
      continue;
    }

    const tokens = l.text.split(/\s+/).filter(Boolean);
    const map = alignTokens(tokens, wordNorms, from, to);

    let tokenIdx = 0;
    for (let k = 0; k < parts.length; k++) {
      const n = countTokens(parts[k]);
      const firstTok = Math.min(tokenIdx, tokens.length - 1);
      const startWord = map[firstTok];
      tokenIdx += n;
      const nextStartWord = k + 1 < parts.length ? map[Math.min(tokenIdx, tokens.length - 1)] : to;
      const endWord = Math.max(startWord, nextStartWord - 1);
      out.push({
        start: words[startWord][1],
        end: Math.max(words[startWord][1], words[Math.min(endWord, words.length - 1)][2]),
        text: parts[k],
      });
    }
  }
  return out;
};
