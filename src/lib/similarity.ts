export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const normId = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** 1 = identical identifier, 0 = nothing in common. */
export function identifierSimilarity(a: string, b: string): number {
  const x = normId(a), y = normId(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 1));

/** Token Jaccard similarity — robust to word order and punctuation. */
export function textSimilarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

/** Hamming distance between two 64-bit perceptual hashes (16 hex chars). */
export function hammingHex(a: string, b: string): number {
  let v = BigInt('0x' + a) ^ BigInt('0x' + b);
  let d = 0;
  while (v) { d += Number(v & 1n); v >>= 1n; }
  return d;
}
