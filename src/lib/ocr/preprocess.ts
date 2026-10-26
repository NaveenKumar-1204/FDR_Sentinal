// Cleans a photo or scan before OCR: resize, grayscale, remove shadows, stretch contrast, straighten.
import type { CanvasFactory, CanvasLike } from '../fdrdoc/augment';

export interface Prepared {
  canvas: CanvasLike;
  /** Degrees the page was rotated to straighten it. */
  skew: number;
  /** Resize factor applied to the original. */
  scale: number;
}

const TARGET_WIDTH = 2000;
const MAX_WIDTH = 2600;

/** Grayscale + shadow removal (divide by local paper brightness) + contrast stretch, in place. */
export function normalizeGray(img: ImageData) {
  const { data, width: w, height: h } = img;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; p < w * h; i += 4, p++) gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  // Paper brightness per 48px block (upper percentile ≈ background), bilinearly interpolated.
  const B = 48, gw = Math.ceil(w / B), gh = Math.ceil(h / B);
  const bg = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
    hist.fill(0);
    let n = 0;
    for (let y = by * B; y < Math.min(h, (by + 1) * B); y += 2) for (let x = bx * B; x < Math.min(w, (bx + 1) * B); x += 2) { hist[gray[y * w + x] | 0]++; n++; }
    let acc = 0, v = 255;
    for (let k = 255; k >= 0; k--) { acc += hist[k]; if (acc >= n * 0.1) { v = k; break; } }
    bg[by * gw + bx] = Math.max(v, 60);
  }
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1, Math.max(0, y / B - 0.5)), y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1, Math.max(0, x / B - 0.5)), x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const b = (bg[y0 * gw + x0] * (1 - tx) + bg[y0 * gw + x1] * tx) * (1 - ty) + (bg[y1 * gw + x0] * (1 - tx) + bg[y1 * gw + x1] * tx) * ty;
      gray[y * w + x] = Math.min(255, (gray[y * w + x] / b) * 255);
    }
  }

  // Stretch so the darkest 0.5% is black and paper is white.
  const h2 = new Uint32Array(256);
  for (let p = 0; p < w * h; p++) h2[gray[p] | 0]++;
  let lo = 0, acc = 0;
  for (let k = 0; k < 256; k++) { acc += h2[k]; if (acc >= w * h * 0.005) { lo = k; break; } }
  const hi = 245;
  const span = Math.max(1, hi - lo);
  // Contrast curve: pale grey print (small labels, ruling lines) is pushed dark so Tesseract's global threshold
  // keeps it, while anything nearly as light as the paper (faint watermarks, security tint) becomes pure white.
  //   0 – 0.6 of paper brightness → 0 – 0.2      0.6 – 0.9 → 0.2 – 1      ≥ 0.9 → white
  const curve = new Uint8Array(256);
  for (let k = 0; k < 256; k++) {
    const v = Math.max(0, Math.min(1, (k - lo) / span));
    const o = v <= 0.6 ? (v / 0.6) * 0.2 : v >= 0.9 ? 1 : 0.2 + ((v - 0.6) / 0.3) * 0.8;
    curve[k] = Math.round(255 * o);
  }
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    const v = curve[Math.max(0, Math.min(255, gray[p] | 0))];
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
}

/** Estimates page tilt in degrees from how sharply text rows line up (projection profile). */
export function estimateSkew(img: ImageData): number {
  const { data, width: w, height: h } = img;
  const step = Math.max(1, Math.round(w / 700));
  const pts: number[] = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4] < 110) pts.push(x, y);
  if (pts.length < 200) return 0;
  let best = 0, bestScore = -1;
  const rows = new Float64Array(Math.ceil((h + w) / step) + 10);
  for (let deg = -4; deg <= 4.001; deg += 0.2) {
    const a = (deg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a);
    rows.fill(0);
    for (let i = 0; i < pts.length; i += 2) {
      const yy = (pts[i + 1] * cos - pts[i] * sin) / step + w / step / 2;
      const k = yy | 0;
      if (k >= 0 && k < rows.length) rows[k]++;
    }
    let score = 0;
    for (let k = 0; k < rows.length; k++) score += rows[k] * rows[k];
    if (score > bestScore) { bestScore = score; best = deg; }
  }
  return Math.round(best * 10) / 10;
}

/**
 * Removes isolated dark specks (scanner dust, sensor noise): a dark pixel with at most one dark neighbour.
 * Letter strokes — even 1px-thin typewriter serifs — always have neighbours along the stroke, so they survive.
 * (A 3×3 median was tried first and erased thin Courier strokes: clean typewriter accuracy fell to 31%.)
 */
export function despeckle(img: ImageData) {
  const { data, width: w, height: h } = img;
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < w * h; i += 4, p++) g[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  const DARK = 165;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (g[p] >= DARK) continue;
    let dark = 0, bright = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const v = g[p + dy * w + dx];
      if (v < DARK) dark++; else bright = Math.max(bright, v);
    }
    if (dark <= 1) { const i = p * 4; data[i] = data[i + 1] = data[i + 2] = bright; }
  }
}

/**
 * Erases table rules: horizontal or vertical dark runs much longer than any letter. Grid lines in receipt tables
 * otherwise read as "|", "—" or junk words and split rows apart.
 */
export function removeRules(img: ImageData, minRun: number, maxThick = 8) {
  const { data, width: w, height: h } = img;
  const dark = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) dark[p] = data[p * 4] < 140 ? 1 : 0;
  // Length of the horizontal / vertical dark run through each pixel.
  const hRun = new Uint16Array(w * h), vRun = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!dark[y * w + x]) { x++; continue; }
      let e = x;
      while (e < w && dark[y * w + e]) e++;
      for (let k = x; k < e; k++) hRun[y * w + k] = Math.min(65535, e - x);
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!dark[y * w + x]) { y++; continue; }
      let e = y;
      while (e < h && dark[e * w + x]) e++;
      for (let k = y; k < e; k++) vRun[k * w + x] = Math.min(65535, e - y);
      y = e;
    }
  }
  // Thin and long = a ruling line. Thick filled bands (white-on-colour headers) are left alone.
  for (let p = 0; p < w * h; p++) {
    if (!dark[p]) continue;
    if ((hRun[p] >= minRun && vRun[p] <= maxThick) || (vRun[p] >= minRun && hRun[p] <= maxThick)) {
      const i = p * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
  }
}

export function prepareForOcr(src: CanvasLike, make: CanvasFactory): Prepared {
  // De-speckle at the original size (speckles are 1px there), then enlarge.
  const c0 = make(src.width, src.height);
  const ctx0 = c0.getContext('2d')!;
  ctx0.drawImage(src as unknown as CanvasImageSource, 0, 0);
  const img0 = ctx0.getImageData(0, 0, src.width, src.height);
  despeckle(img0);
  ctx0.putImageData(img0, 0, 0);

  const scale = src.width < TARGET_WIDTH ? TARGET_WIDTH / src.width : src.width > MAX_WIDTH ? MAX_WIDTH / src.width : 1;
  const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  const c1 = make(w, h);
  const ctx1 = c1.getContext('2d')!;
  ctx1.imageSmoothingEnabled = true;
  // Browsers default to low-quality (bilinear) enlarging; the evaluation was measured with high-quality resampling.
  ctx1.imageSmoothingQuality = 'high';
  ctx1.drawImage(c0 as unknown as CanvasImageSource, 0, 0, w, h);
  const img = ctx1.getImageData(0, 0, w, h);
  normalizeGray(img);
  ctx1.putImageData(img, 0, 0);

  const skew = estimateSkew(img);
  let out = c1;
  if (Math.abs(skew) >= 0.3) {
    out = make(w, h);
    const ctx2 = out.getContext('2d')!;
    ctx2.fillStyle = '#ffffff';
    ctx2.fillRect(0, 0, w, h);
    ctx2.translate(w / 2, h / 2);
    ctx2.rotate((-skew * Math.PI) / 180);
    ctx2.drawImage(c1 as unknown as CanvasImageSource, -w / 2, -h / 2);
  }
  // Rules are removed after straightening, when they run truly horizontal/vertical.
  const ctxOut = out.getContext('2d')!;
  const finalImg = ctxOut.getImageData(0, 0, w, h);
  removeRules(finalImg, Math.max(120, Math.round(w * 0.07)));
  ctxOut.putImageData(finalImg, 0, 0);
  return { canvas: out, skew: Math.abs(skew) >= 0.3 ? skew : 0, scale };
}
