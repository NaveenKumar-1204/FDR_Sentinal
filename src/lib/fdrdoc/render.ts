// Draws a synthetic FDR document on any Canvas 2D context (browser or @napi-rs/canvas in Node).
// Every document carries a "SPECIMEN · SYNTHETIC TEST DOCUMENT" mark so it can never pass as a real receipt.
import { formatIndian, rupeesInWords } from '../ocr/amount';
import { formatDocDate, formatTenure, type DateStyle } from '../ocr/dates';
import type { DocFields, Rng } from './fields';

type Ctx = CanvasRenderingContext2D;
export type TemplateId = 'ledger' | 'certificate' | 'modern' | 'typewriter';
export type LabelKey = 'fdrNumber' | 'accountHolder' | 'amount' | 'amountWords' | 'issueDate' | 'maturityDate' | 'tenure'
  | 'interestRate' | 'maturityValue' | 'ifsc' | 'branch' | 'customerId' | 'linkedAccount' | 'branchCode';

export const LABEL_VARIANTS: Record<LabelKey, string[]> = {
  fdrNumber: ['FDR No.', 'Deposit No.', 'Receipt No.', 'TDR No.', 'FD Account No.', 'Deposit Receipt No.'],
  accountHolder: ['Name of Depositor', 'Depositor', 'Account Holder', 'Depositor Name', 'In the name of'],
  amount: ['Principal Amount', 'Deposit Amount', 'Amount of Deposit', 'Principal'],
  amountWords: ['Amount in Words', 'In Words', 'Sum in Words'],
  issueDate: ['Date of Deposit', 'Deposit Date', 'Value Date', 'Date of Issue', 'Opening Date'],
  maturityDate: ['Maturity Date', 'Date of Maturity', 'Due Date'],
  tenure: ['Period', 'Tenure', 'Term', 'Period of Deposit'],
  interestRate: ['Rate of Interest', 'Interest Rate', 'ROI'],
  maturityValue: ['Maturity Value', 'Maturity Amount', 'Amount Payable on Maturity'],
  ifsc: ['IFSC', 'IFS Code', 'IFSC Code'],
  branch: ['Branch', 'Branch Name'],
  customerId: ['Customer ID', 'CIF No.', 'Customer No.'],
  linkedAccount: ['Linked SB A/c', 'Operative A/c No.', 'Credit A/c No.'],
  branchCode: ['Branch Code', 'Br. Code'],
};

export interface DocStyle {
  template: TemplateId;
  labels: Record<LabelKey, string>;
  dateStyle: DateStyle;
  currency: 'Rs.' | '₹' | 'INR';
  accent: string;
  ifscInHeader: boolean;
  seed: number;
}

const ACCENTS = ['#1d3c78', '#0f5c4d', '#7a1f2b', '#4b2a7a', '#8a4b0f', '#0b4f8a', '#2d4a22'];
const DATE_STYLES: DateStyle[] = ['slash', 'dash', 'dot', 'short', 'upper', 'long'];
const TEMPLATES: TemplateId[] = ['ledger', 'certificate', 'modern', 'typewriter'];

export function randomStyle(r: Rng, template?: TemplateId): DocStyle {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const labels = Object.fromEntries((Object.keys(LABEL_VARIANTS) as LabelKey[]).map((k) => [k, pick(LABEL_VARIANTS[k])])) as Record<LabelKey, string>;
  const t = template ?? pick(TEMPLATES);
  return {
    template: t, labels, dateStyle: pick(DATE_STYLES), currency: t === 'typewriter' ? pick(['Rs.', 'INR'] as const) : pick(['Rs.', 'Rs.', '₹', 'INR'] as const),
    accent: pick(ACCENTS), ifscInHeader: r() < 0.35, seed: Math.floor(r() * 1e9),
  };
}

export const DOC_WIDTH = 1400;

// ── drawing helpers ──────────────────────────────────────────────

function txt(ctx: Ctx, s: string, x: number, y: number, font: string, color = '#151515', align: CanvasTextAlign = 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

/** Wraps text into lines no wider than maxW (measured with the current font). */
function wrap(ctx: Ctx, s: string, font: string, maxW: number): string[] {
  ctx.font = font;
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function initials(name: string) {
  return name.split(' ').filter((w) => !['of', 'and'].includes(w.toLowerCase())).map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}

function emblem(ctx: Ctx, x: number, y: number, r: number, color: string, fg: string, label: string) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fg; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r - 5, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  txt(ctx, label, x, y + r * 0.22, `bold ${Math.round(r * 0.62)}px Arial`, color, 'center');
  ctx.restore();
}

function signature(ctx: Ctx, x: number, y: number, r: Rng, color = '#1b2a6b') {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y);
  let cx = x;
  for (let i = 0; i < 5; i++) {
    const nx = cx + 28 + r() * 30;
    ctx.bezierCurveTo(cx + 10, y - 30 - r() * 20, nx - 10, y + 20 + r() * 10, nx, y - 5 + r() * 10);
    cx = nx;
  }
  ctx.stroke();
  ctx.restore();
}

function stamp(ctx: Ctx, x: number, y: number, radius: number, color: string, lines: string[]) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, radius - 9, 0, Math.PI * 2); ctx.stroke();
  lines.forEach((l, i) => txt(ctx, l, x, y - (lines.length - 1) * 11 + i * 22 + 6, 'bold 15px Arial', color, 'center'));
  ctx.restore();
}

function watermark(ctx: Ctx, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 7);
  txt(ctx, 'SPECIMEN', 0, 40, 'bold 190px Arial', '#000', 'center');
  ctx.restore();
}

function specimenFooter(ctx: Ctx, w: number, h: number) {
  txt(ctx, 'SPECIMEN · SYNTHETIC TEST DOCUMENT · NOT A VALID DEPOSIT RECEIPT', w / 2, h - 26, '15px Arial', '#8a8a8a', 'center');
}

// ── field formatting shared by templates ─────────────────────────

function values(f: DocFields, s: DocStyle) {
  const money = (n: number) => `${s.currency} ${formatIndian(n)}`;
  return {
    fdrNumber: f.fdrNumber,
    accountHolder: f.accountHolder,
    amount: money(f.amount),
    amountWords: rupeesInWords(f.amount),
    issueDate: formatDocDate(f.issueDate, s.dateStyle),
    maturityDate: formatDocDate(f.maturityDate, s.dateStyle),
    tenure: formatTenure(f.tenure),
    interestRate: `${f.interestRate.toFixed(2)}% p.a.`,
    maturityValue: money(f.maturityValue),
    ifsc: f.ifsc,
    branch: f.branch,
    customerId: f.customerId,
    linkedAccount: f.linkedAccount,
    branchCode: f.branchCode,
  } satisfies Record<LabelKey, string>;
}

// ── templates ────────────────────────────────────────────────────

function ledger(ctx: Ctx, f: DocFields, s: DocStyle, r: Rng, draw: boolean): number {
  const W = DOC_WIDTH, v = values(f, s), L = s.labels;
  const rows: LabelKey[] = ['fdrNumber', 'customerId', 'accountHolder', 'amount', 'amountWords', 'issueDate', 'tenure', 'interestRate', 'maturityDate', 'maturityValue', 'branch'];
  if (!s.ifscInHeader) rows.push('ifsc');
  rows.push('linkedAccount');
  const valueFont = 'bold 24px Arial', wordsFont = 'bold 21px Arial', colX = 500, valW = W - 70 - colX - 20;
  const heights = rows.map((k) => (k === 'amountWords' ? Math.max(1, wrap(ctx, v.amountWords, wordsFont, valW).length) * 30 + 26 : 56));
  const H = 250 + heights.reduce((a, b) => a + b, 0) + 230;
  if (!draw) return H;

  ctx.fillStyle = '#fffdf8'; ctx.fillRect(0, 0, W, H);
  watermark(ctx, W, H);
  ctx.fillStyle = s.accent; ctx.fillRect(0, 0, W, 130);
  emblem(ctx, 78, 65, 40, s.accent, '#ffffff', initials(f.bank));
  txt(ctx, f.bank, 140, 62, 'bold 40px Arial', '#ffffff');
  txt(ctx, s.ifscInHeader ? `IFSC: ${f.ifsc}   ·   MICR: ${f.micr}   ·   Ph: ${f.phone}` : `${f.city}   ·   Ph: ${f.phone}`, 140, 100, '20px Arial', '#e8ecf5');
  txt(ctx, 'FIXED DEPOSIT RECEIPT', W / 2, 188, 'bold 32px Arial', '#111', 'center');
  txt(ctx, '(Not transferable · Not negotiable)', W / 2, 218, '18px Arial', '#666', 'center');

  let y = 250;
  ctx.strokeStyle = '#9aa0ab'; ctx.lineWidth = 1.5;
  ctx.strokeRect(70, y, W - 140, heights.reduce((a, b) => a + b, 0));
  ctx.beginPath(); ctx.moveTo(colX - 30, y); ctx.lineTo(colX - 30, y + heights.reduce((a, b) => a + b, 0)); ctx.stroke();
  rows.forEach((k, i) => {
    const h = heights[i];
    txt(ctx, L[k], 92, y + 36, '22px Arial', '#333');
    if (k === 'amountWords') wrap(ctx, v.amountWords, wordsFont, valW).forEach((line, j) => txt(ctx, line, colX, y + 36 + j * 30, wordsFont));
    else txt(ctx, v[k], colX, y + 37, valueFont);
    y += h;
    if (i < rows.length - 1) { ctx.beginPath(); ctx.moveTo(70, y); ctx.lineTo(W - 70, y); ctx.stroke(); }
  });

  txt(ctx, `For ${f.bank}`, W - 90, y + 60, '20px Arial', '#333', 'right');
  signature(ctx, W - 330, y + 120, r);
  txt(ctx, 'Authorised Signatory', W - 90, y + 160, '18px Arial', '#333', 'right');
  stamp(ctx, 220, y + 115, 70, '#3b3fa8', ['BRANCH', 'MANAGER']);
  specimenFooter(ctx, W, H);
  return H;
}

function certificate(ctx: Ctx, f: DocFields, s: DocStyle, r: Rng, draw: boolean): number {
  const W = DOC_WIDTH, v = values(f, s), L = s.labels;
  const para = `Received with thanks from ${f.accountHolder} the sum of ${v.amountWords} (${v.amount}) as a fixed deposit for a period of ${v.tenure} at ${f.interestRate.toFixed(2)}% per annum, subject to the terms and conditions overleaf.`;
  const paraFont = '25px "Times New Roman"';
  const lines = wrap(ctx, para, paraFont, W - 240);
  const left: LabelKey[] = ['fdrNumber', 'issueDate', 'maturityDate', 'customerId'];
  const right: LabelKey[] = ['maturityValue', ...(s.ifscInHeader ? [] : ['ifsc' as LabelKey]), 'branch'];
  const H = 280 + Math.max(lines.length, 4) * 40 + Math.max(left.length, right.length) * 52 + 300;
  if (!draw) return H;

  ctx.fillStyle = '#fbf7ec'; ctx.fillRect(0, 0, W, H);
  watermark(ctx, W, H);
  ctx.strokeStyle = s.accent; ctx.lineWidth = 6; ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.lineWidth = 1.5; ctx.strokeRect(36, 36, W - 72, H - 72);
  for (const [cx, cy] of [[36, 36], [W - 36, 36], [36, H - 36], [W - 36, H - 36]]) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillStyle = s.accent; ctx.fillRect(-9, -9, 18, 18); ctx.restore();
  }
  txt(ctx, f.bank, W / 2, 115, 'bold 44px "Times New Roman"', s.accent, 'center');
  txt(ctx, s.ifscInHeader ? `${f.city} · IFSC: ${f.ifsc} · Ph: ${f.phone}` : `${f.city} · Ph: ${f.phone}`, W / 2, 152, '21px "Times New Roman"', '#444', 'center');
  txt(ctx, 'TERM DEPOSIT ADVICE', W / 2, 215, 'bold 31px "Times New Roman"', '#222', 'center');
  ctx.strokeStyle = s.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 230, 232); ctx.lineTo(W / 2 + 230, 232); ctx.stroke();

  let y = 290;
  lines.forEach((line) => { txt(ctx, line, 120, y, paraFont, '#1a1a1a'); y += 40; });
  y += 30;
  const fieldFont = 'bold 24px "Times New Roman"', labelFont = '23px "Times New Roman"';
  const startY = y;
  left.forEach((k, i) => {
    const yy = startY + i * 52;
    txt(ctx, `${L[k]} :`, 120, yy, labelFont, '#333');
    ctx.font = labelFont;
    txt(ctx, v[k], 120 + ctx.measureText(`${L[k]} : `).width + 6, yy, fieldFont);
  });
  right.forEach((k, i) => {
    const yy = startY + i * 52;
    txt(ctx, `${L[k]} :`, 760, yy, labelFont, '#333');
    ctx.font = labelFont;
    txt(ctx, v[k], 760 + ctx.measureText(`${L[k]} : `).width + 6, yy, fieldFont);
  });
  y = startY + Math.max(left.length, right.length) * 52 + 40;
  stamp(ctx, 250, y + 95, 75, '#7a1f2b', ['DEPOSITS', 'SECTION']);
  signature(ctx, W - 380, y + 95, r);
  txt(ctx, 'Branch Manager', W - 140, y + 140, 'italic 21px "Times New Roman"', '#333', 'right');
  specimenFooter(ctx, W, H);
  return H;
}

function modern(ctx: Ctx, f: DocFields, s: DocStyle, _r: Rng, draw: boolean): number {
  const W = DOC_WIDTH, v = values(f, s), L = s.labels;
  type Cell = [LabelKey, number];
  const grid: Cell[][] = [
    [['fdrNumber', 1], ['customerId', 1], ['issueDate', 1]],
    [['accountHolder', 2], ['tenure', 1]],
    [['amount', 1], ['interestRate', 1], ['maturityDate', 1]],
    [['amountWords', 3]],
    [['maturityValue', 1], [s.ifscInHeader ? 'branchCode' : 'ifsc', 1], ['branch', 1]],
    [['linkedAccount', 1], ...(s.ifscInHeader ? [] : [['branchCode', 1] as Cell])],
  ];
  const colW = (W - 120 - 40) / 3, rowH = 100;
  const H = 150 + grid.length * (rowH + 14) + 150;
  if (!draw) return H;

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  watermark(ctx, W, H);
  ctx.fillStyle = s.accent; ctx.fillRect(0, 0, W, 14);
  emblem(ctx, 92, 78, 34, '#ffffff', s.accent, initials(f.bank));
  txt(ctx, f.bank, 142, 92, 'bold 36px Verdana', s.accent);
  txt(ctx, 'TERM DEPOSIT CONFIRMATION', W - 60, 74, 'bold 19px Verdana', '#555', 'right');
  txt(ctx, s.ifscInHeader ? `IFSC: ${f.ifsc}` : `${f.city} · Ph: ${f.phone}`, W - 60, 102, '17px Verdana', '#777', 'right');
  ctx.fillStyle = '#e3e7ef'; ctx.fillRect(60, 124, W - 120, 2);

  let y = 150;
  for (const row of grid) {
    let x = 60;
    for (const [k, span] of row) {
      const w = colW * span + 20 * (span - 1);
      ctx.fillStyle = '#f4f6fa'; ctx.fillRect(x, y, w, rowH);
      txt(ctx, L[k].toUpperCase(), x + 18, y + 32, '16px Verdana', '#6b7280');
      const font = k === 'amountWords' ? 'bold 20px Verdana' : 'bold 24px Verdana';
      txt(ctx, v[k], x + 18, y + 72, font, '#111827');
      x += w + 20;
    }
    y += rowH + 14;
  }
  txt(ctx, 'This is a system-generated advice and does not need a signature.', 60, y + 40, '17px Verdana', '#6b7280');
  txt(ctx, `MICR ${f.micr}   ·   Branch code ${f.branchCode}`, W - 60, y + 40, '17px Verdana', '#6b7280', 'right');
  specimenFooter(ctx, W, H);
  return H;
}

function typewriter(ctx: Ctx, f: DocFields, s: DocStyle, _r: Rng, draw: boolean): number {
  const W = DOC_WIDTH, v = values(f, s), L = s.labels;
  const keys: LabelKey[] = ['fdrNumber', 'customerId', 'accountHolder', 'amount', 'amountWords', 'issueDate', 'tenure', 'interestRate',
    'maturityDate', 'maturityValue', 'branch', ...(s.ifscInHeader ? [] : ['ifsc' as LabelKey]), 'linkedAccount'];
  const font = '25px "Courier New"', bold = 'bold 25px "Courier New"';
  const labelWidth = 26;
  const valueCols = 66 - labelWidth;
  const valueLines = (k: LabelKey) => {
    const val = v[k].toUpperCase();
    if (val.length <= valueCols) return [val];
    const out: string[] = []; let line = '';
    for (const w of val.split(' ')) { const nx = line ? `${line} ${w}` : w; if (nx.length > valueCols && line) { out.push(line); line = w; } else line = nx; }
    if (line) out.push(line);
    return out;
  };
  const lineCount = keys.reduce((n, k) => n + valueLines(k).length, 0);
  const H = 300 + lineCount * 40 + 200;
  if (!draw) return H;

  ctx.fillStyle = '#fcfbf6'; ctx.fillRect(0, 0, W, H);
  watermark(ctx, W, H);
  txt(ctx, f.bank.toUpperCase(), W / 2, 80, 'bold 34px "Courier New"', '#111', 'center');
  txt(ctx, `${f.branch.toUpperCase()}, ${f.city.toUpperCase()}`, W / 2, 118, font, '#222', 'center');
  if (s.ifscInHeader) txt(ctx, `IFSC: ${f.ifsc}   PH: ${f.phone}`, W / 2, 154, font, '#222', 'center');
  const dash = '-'.repeat(66);
  txt(ctx, dash, 80, 190, font, '#444');
  txt(ctx, 'FIXED DEPOSIT ADVICE', W / 2, 230, bold, '#111', 'center');
  txt(ctx, dash, 80, 266, font, '#444');
  let y = 320;
  for (const k of keys) {
    const label = L[k].toUpperCase();
    const lead = `${label} ${'.'.repeat(Math.max(2, labelWidth - label.length - 1))}: `;
    valueLines(k).forEach((line, i) => {
      txt(ctx, i === 0 ? lead + line : ' '.repeat(lead.length) + line, 80, y, font, '#161616');
      y += 40;
    });
  }
  txt(ctx, dash, 80, y + 10, font, '#444');
  txt(ctx, '*** COMPUTER GENERATED - SIGNATURE NOT REQUIRED ***', W / 2, y + 60, font, '#333', 'center');
  specimenFooter(ctx, W, H);
  return H;
}

const TEMPLATE_FN: Record<TemplateId, (ctx: Ctx, f: DocFields, s: DocStyle, r: Rng, draw: boolean) => number> = { ledger, certificate, modern, typewriter };

/** Height needs a measuring context because some rows wrap. Pass the same ctx you will draw on. */
export function docHeight(measure: Ctx, f: DocFields, s: DocStyle): number {
  return TEMPLATE_FN[s.template](measure, f, s, () => 0.5, false);
}

export function drawDocument(ctx: Ctx, f: DocFields, s: DocStyle, r: Rng): void {
  TEMPLATE_FN[s.template](ctx, f, s, r, true);
}
