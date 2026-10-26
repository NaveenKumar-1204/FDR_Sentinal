// Simulates how a document looks after scanning or photographing it.
import type { Rng } from './fields';

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D | null;
}
export type CanvasFactory = (w: number, h: number) => CanvasLike;
/**
 * clean  – digital PDF / perfect scan
 * scan   – office flatbed scan (slight tilt, toner noise)
 * phone  – phone photo (tilt up to 3°, uneven lighting, sensor noise, JPEG)
 * lowres – forwarded/compressed image (≈110 dpi, heavy JPEG) — stress tier
 */
export type Quality = 'clean' | 'scan' | 'phone' | 'lowres';
export const QUALITIES: Quality[] = ['clean', 'scan', 'phone', 'lowres'];
export const JPEG_QUALITY: Record<Quality, number> = { clean: 92, scan: 82, phone: 72, lowres: 55 };

interface Params { scale: [number, number]; angle: number; noise: number; speckle: number; blur: number; shadow: [number, number]; paper: string }
const PARAMS: Record<Exclude<Quality, 'clean'>, Params> = {
  scan: { scale: [0.82, 0.92], angle: 1.2, noise: 6, speckle: 0.0004, blur: 1, shadow: [0.95, 1], paper: '#f3efe6' },
  phone: { scale: [0.95, 1.1], angle: 3, noise: 9, speckle: 0.0006, blur: 1, shadow: [0.72, 0.88], paper: '#e7e4dc' },
  lowres: { scale: [0.6, 0.68], angle: 1.5, noise: 8, speckle: 0.0005, blur: 1, shadow: [0.88, 0.97], paper: '#eeebe4' },
};

function gaussian(r: Rng): number {
  const u = Math.max(r(), 1e-9), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Separable 3-tap box blur, in place, RGB only. */
export function boxBlur(data: Uint8ClampedArray, w: number, h: number, passes = 1) {
  const tmp = new Uint8ClampedArray(data.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, l = (y * w + Math.max(0, x - 1)) * 4, rr = (y * w + Math.min(w - 1, x + 1)) * 4;
      for (let c = 0; c < 3; c++) tmp[i + c] = (data[l + c] + data[i + c] + data[rr + c]) / 3;
      tmp[i + 3] = data[i + 3];
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, u = (Math.max(0, y - 1) * w + x) * 4, d = (Math.min(h - 1, y + 1) * w + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = (tmp[u + c] + tmp[i + c] + tmp[d + c]) / 3;
    }
  }
}

export function degrade(src: CanvasLike, quality: Quality, r: Rng, make: CanvasFactory): CanvasLike {
  if (quality === 'clean') return src;
  const p = PARAMS[quality];
  const s = p.scale[0] + r() * (p.scale[1] - p.scale[0]);
  const angle = (r() * 2 - 1) * p.angle * (Math.PI / 180);
  const w = Math.round(src.width * s), h = Math.round(src.height * s), m = Math.round(28 * s);
  const out = make(w + 2 * m, h + 2 * m);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(angle);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src as unknown as CanvasImageSource, -w / 2, -h / 2, w, h);
  ctx.restore();

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data, W = out.width, H = out.height;
  boxBlur(d, W, H, p.blur);
  // Uneven lighting: one corner darker, like a phone's shadow.
  const [lo, hi] = p.shadow;
  const dark = lo + r() * (hi - lo), corner = Math.floor(r() * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = corner & 1 ? x / W : 1 - x / W, fy = corner & 2 ? y / H : 1 - y / H;
    const light = dark + (1 - dark) * Math.min(1, (fx + fy) / 1.2);
    const n = gaussian(r) * p.noise;
    const i = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * light + n;
    if (r() < p.speckle) { const v = 40 + r() * 80; d[i] = v; d[i + 1] = v; d[i + 2] = v; }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
