// Turns OCR words into FDR fields, then cross-checks them against each other.
// Design rule: a field is either confirmed by an independent check or flagged for a human — never silently guessed.
import { levenshtein } from '../similarity';
import { fixDigits, formatIndian, parseAmountFigures, parseAmountWords } from './amount';
import { BANK_BY_CODE, findBankInText, type BankInfo } from './banks';
import { correctPlaces } from './places';
import { addTenure, formatDocDate, formatTenure, maturityValue as computeMaturityValue, parseDate, parseTenure, tenureDays, type Tenure } from './dates';
import { FIELD_KEYS, type Bbox, type Check, type ExtractResult, type FieldKey, type FieldResult, type FieldSource, type OcrWord } from './types';

export type LabelField = 'fdrNumber' | 'accountHolder' | 'amount' | 'amountWords' | 'issueDate' | 'maturityDate' | 'tenure' | 'interestRate'
  | 'maturityValue' | 'ifsc' | 'branch' | 'customerId' | 'linkedAccount' | 'branchCode' | 'micr' | 'phone';

// Distractor labels (customer ID, linked account, maturity value…) are listed too, so their numbers are claimed and never mistaken for ours.
const LABELS: [LabelField, string[]][] = [
  ['fdrNumber', ['fdr no', 'fdr number', 'tdr no', 'deposit no', 'deposit number', 'receipt no', 'deposit receipt no', 'fd account no', 'fd ac no', 'fd no', 'fixed deposit no', 'term deposit no']],
  ['accountHolder', ['name of depositor', 'name of the depositor', 'depositor name', 'depositor', 'account holder', 'in the name of', 'name of account holder', 'name']],
  ['amount', ['principal amount', 'deposit amount', 'amount of deposit', 'principal', 'amount deposited', 'amount']],
  ['amountWords', ['amount in words', 'in words', 'sum in words', 'rupees in words']],
  ['issueDate', ['date of deposit', 'deposit date', 'value date', 'date of issue', 'issue date', 'opening date', 'date of opening', 'start date']],
  ['maturityDate', ['maturity date', 'date of maturity', 'due date', 'matures on']],
  ['tenure', ['period of deposit', 'period', 'tenure', 'term']],
  ['interestRate', ['rate of interest', 'interest rate', 'roi', 'rate']],
  ['maturityValue', ['maturity value', 'maturity amount', 'amount payable on maturity', 'maturity proceeds']],
  ['ifsc', ['ifsc code', 'ifs code', 'ifsc']],
  ['branch', ['branch name', 'branch']],
  ['customerId', ['customer id', 'cif no', 'customer no', 'cust id']],
  ['linkedAccount', ['linked sb ac', 'operative ac no', 'credit ac no', 'sb ac no', 'savings ac no']],
  ['branchCode', ['branch code', 'br code']],
  ['micr', ['micr', 'micr code']],
  ['phone', ['ph', 'phone', 'tel']],
];
const PHRASES = LABELS.flatMap(([field, ps]) => ps.map((p) => ({ field, words: p.split(' ') })));

/** Confidence below which an OCR-only field (no independent cross-check) is sent for human review. */
const OCR_ONLY_MIN = 0.97;
/** Letters OCR confuses with digits; inside a run of digits they make a code ambiguous. */
const LOOKALIKE = /[SOIBZGQDLR]/;

// Punctuation (including "|" from table edges) is dropped first, then digits that stand in for letters are mapped.
const normTok = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's').replace(/[^a-z]/g, '');
const isSep = (s: string) => !/[A-Za-z0-9₹]/.test(s);

/** Letter pairs OCR merges or splits in serif/bold print ("Maturity" → "Matunty", "Term" → "Tenn"). */
const confusions = (s: string) => s.replace(/rn/g, 'm').replace(/ri/g, 'n').replace(/cl/g, 'd').replace(/vv/g, 'w').replace(/li/g, 'h');

function tokEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (b.length < 4 || a.length < 3) return false;
  const d = Math.min(levenshtein(a, b), levenshtein(confusions(a), confusions(b)));
  return d <= 1 || (d === 2 && a.length >= 9 && b.length >= 9);
}

/** A one-word generic label ("Amount", "Rate"…) is rejected when the next words show it is a different field. */
const NOT_AFTER: Partial<Record<LabelField, string[]>> = {
  amount: ['payable', 'maturity', 'value', 'words', 'in'],
  interestRate: ['type'],
  branch: ['code', 'manager'],
  accountHolder: ['of'],
};

const union = (ws: OcrWord[]): Bbox | null => ws.length
  ? { x0: Math.min(...ws.map((w) => w.bbox.x0)), y0: Math.min(...ws.map((w) => w.bbox.y0)), x1: Math.max(...ws.map((w) => w.bbox.x1)), y1: Math.max(...ws.map((w) => w.bbox.y1)) }
  : null;
const minConf = (ws: OcrWord[]) => (ws.length ? Math.min(...ws.map((w) => w.conf)) : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const yc = (w: OcrWord) => (w.bbox.y0 + w.bbox.y1) / 2;

interface Segment { words: OcrWord[]; row: number; label?: { field: LabelField; end: number; bbox: Bbox } }
interface Hit { field: LabelField; words: OcrWord[]; via: FieldSource; labelBbox: Bbox }

function matchLabel(seg: OcrWord[]): { field: LabelField; end: number; bbox: Bbox } | undefined {
  const toks: { t: string; i: number }[] = [];
  seg.forEach((w, i) => { const t = normTok(w.text); if (t) toks.push({ t, i }); });
  if (!toks.length || isSep(seg[toks[0].i].text)) return undefined;
  let best: { field: LabelField; n: number; exact: number } | undefined;
  for (const p of PHRASES) {
    if (p.words.length > toks.length) continue;
    let exact = 0, ok = true;
    for (let k = 0; k < p.words.length; k++) {
      if (toks[k].t === p.words[k]) exact++;
      else if (!tokEq(toks[k].t, p.words[k])) { ok = false; break; }
    }
    if (!ok) continue;
    if (p.words.length === 1 && NOT_AFTER[p.field]) {
      const following = toks.slice(1, 4).map((t) => t.t);
      if (following.some((t) => NOT_AFTER[p.field]!.some((n) => tokEq(t, n) || t === n))) continue;
    }
    if (!best || p.words.length > best.n || (p.words.length === best.n && exact > best.exact)) best = { field: p.field, n: p.words.length, exact };
  }
  if (!best) return undefined;
  const end = toks[best.n - 1].i;
  return { field: best.field, end, bbox: union(seg.slice(0, end + 1))! };
}

function clean(input: OcrWord[]): OcrWord[] {
  let ws = input;
  // "LABEL .......: value" — the value starts after the last colon close to the label (dot leaders read as junk).
  let colon = -1;
  for (let i = 0; i < Math.min(ws.length, 4); i++) if (ws[i].text.includes(':')) colon = i;
  if (colon >= 0) {
    const rest = ws[colon].text.slice(ws[colon].text.lastIndexOf(':') + 1);
    ws = rest ? [{ ...ws[colon], text: rest }, ...ws.slice(colon + 1)] : ws.slice(colon + 1);
  }
  // Dot-leader junk ("....vveveeue....") — but keep short tokens like the initial "R.".
  while (ws.length && ws[0].text.length >= 4 && (ws[0].text.match(/[.·,]/g)?.length ?? 0) >= ws[0].text.length * 0.4) ws = ws.slice(1);
  const out = ws.filter((w) => !isSep(w.text)).map((w) => ({ ...w, text: w.text.replace(/^[:;.\-–=|]+/, '').replace(/[:;|]+$/, '') }));
  return out.filter((w) => w.text);
}

function titleIfShouting(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]{3}/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s.(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Word-by-word match against registered trust names: same number of words, each word within 1–2 OCR slips
 * (by length), at least half the words exact, and exactly one registered name qualifying.
 */
function matchRegistered(n: string, names: string[]): { name: string; exact: boolean } | null {
  const a = n.split(' ');
  const qualifying = names.filter((name) => {
    const b = normName(name).split(' ');
    if (a.length !== b.length) return false;
    let exact = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) { exact++; continue; }
      const allowed = b[i].length >= 6 ? 2 : b[i].length >= 4 ? 1 : 0;
      if (levenshtein(a[i], b[i]) > allowed) return false;
    }
    return exact * 2 >= a.length;
  });
  return qualifying.length === 1 ? { name: qualifying[0], exact: normName(qualifying[0]) === n } : null;
}

function fixIfsc(raw: string): string | null {
  const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length !== 11) return null;
  const toLetter: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
  const prefix = t.slice(0, 4).split('').map((c) => toLetter[c] ?? c).join('');
  const zero = ({ O: '0', D: '0', Q: '0' } as Record<string, string>)[t[4]] ?? t[4];
  if (!/^[A-Z]{4}$/.test(prefix) || zero !== '0' || !/^[A-Z0-9]{6}$/.test(t.slice(5))) return null;
  return `${prefix}0${t.slice(5)}`;
}

function parseFdrNumber(ws: OcrWord[]): { value: string; used: OcrWord[]; fixed: boolean } | null {
  const toks = ws.map((w) => ({ w, t: w.text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '') })).filter((x) => x.t);
  if (!toks.length) return null;
  let tok = toks[0].t;
  const used = [toks[0].w];
  for (let i = 1; i < toks.length && /^[0-9OIl]{2,6}$/.test(toks[i].t) && /[0-9]$/.test(tok) && tok.length < 18; i++) { tok += toks[i].t; used.push(toks[i].w); }
  tok = tok.toUpperCase();
  const lead = tok.match(/^[A-Z]*/)![0];
  let prefix = '', body = tok;
  if (lead.length) {
    if (lead.length > 4 || tok.length - lead.length < 6) return null;
    prefix = lead; body = tok.slice(lead.length);
  }
  const fixedBody = fixDigits(body);
  if (!/^\d{6,18}$/.test(fixedBody)) return null;
  return { value: prefix + fixedBody, used, fixed: fixedBody !== body };
}

export interface ExtractOptions {
  /** Registered trust / society names — an OCR'd holder close to one of these is snapped to the exact registered name. */
  knownHolders?: string[];
  /** Text is too small in the original image for printed digits to be trusted (see MIN_TEXT_PX). */
  lowResolution?: boolean;
  textPx?: number;
}

export interface ReadAlt { text: string; conf: number; box: Bbox }
export type Rereads = Partial<Record<LabelField, ReadAlt[]>>;

/** Field groups whose labelled values the second pass re-reads. */
export const REREAD_GROUPS: Record<FieldKey, LabelField[]> = {
  fdrNumber: ['fdrNumber'], ifsc: ['ifsc'], branch: ['branch'], accountHolder: ['accountHolder'], bank: [],
  amount: ['amount', 'amountWords', 'maturityValue', 'interestRate'], interestRate: ['interestRate', 'maturityValue'],
  issueDate: ['issueDate', 'maturityDate', 'tenure'], maturityDate: ['issueDate', 'maturityDate', 'tenure'],
};

export function extractFields(words: OcrWord[], opts: ExtractOptions = {}, rereads: Rereads = {}): ExtractResult {
  const hMed = median(words.map((w) => w.bbox.y1 - w.bbox.y0)) || 20;
  const pageH = Math.max(1, ...words.map((w) => w.bbox.y1));

  // ── 1. rows and segments (a segment = words without a column-sized gap) ──
  const sorted = [...words].sort((a, b) => yc(a) - yc(b));
  const rows: OcrWord[][] = [];
  for (const w of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(yc(w) - row.reduce((s, x) => s + yc(x), 0) / row.length) <= 0.55 * hMed) row.push(w);
    else rows.push([w]);
  }
  rows.forEach((r) => r.sort((a, b) => a.bbox.x0 - b.bbox.x0));
  const segments: Segment[][] = rows.map((r, ri) => {
    const segs: Segment[] = [];
    let cur: OcrWord[] = [];
    r.forEach((w, i) => {
      if (i && w.bbox.x0 - r[i - 1].bbox.x1 > 2.5 * hMed) { segs.push({ words: cur, row: ri }); cur = []; }
      cur.push(w);
    });
    if (cur.length) segs.push({ words: cur, row: ri });
    for (const s of segs) s.label = matchLabel(s.words);
    return segs;
  });

  // ── 2. label → value hits ──
  const hits: Hit[] = [];
  const continuation = (rowIdx: number, startX: number, lh: number, prevBottom: number): OcrWord[] => {
    const out: OcrWord[] = [];
    let bottom = prevBottom;
    for (let r = rowIdx + 1; r < segments.length; r++) {
      // A row that holds any label is a new field, never a continuation of this value.
      if (segments[r].some((s) => s.label)) break;
      const seg = segments[r].find((s) => Math.abs(s.words[0].bbox.x0 - startX) < 2 * lh);
      const top = Math.min(...rows[r].map((w) => w.bbox.y0));
      if (!seg || top - bottom > 1.2 * lh) break;
      // Names and amounts in words never contain long digit runs — such a line is the next field's value
      // whose label was misread.
      if (seg.words.some((w) => /\d{3,}/.test(w.text))) break;
      out.push(...seg.words);
      bottom = Math.max(...seg.words.map((w) => w.bbox.y1));
    }
    return out;
  };
  const pageRight = Math.max(...words.map((w) => w.bbox.x1)) + hMed;
  const valueRight: Partial<Record<string, number>> = {};
  segments.forEach((row, ri) => row.forEach((seg, si) => {
    if (!seg.label) return;
    const { field, end, bbox } = seg.label;
    const lh = bbox.y1 - bbox.y0 || hMed;
    let value = clean(seg.words.slice(end + 1));
    let via: FieldSource = 'label';
    let valueSeg = si;
    if (!value.length && row[si + 1] && !row[si + 1].label) { value = clean(row[si + 1].words); valueSeg = si + 1; }
    // How far right the value may extend — the next column, or the page edge. The re-read crop uses it so a
    // word the first pass dropped at the end ("…Education" without "Society") is still seen.
    valueRight[field] ??= row[valueSeg + 1] ? row[valueSeg + 1].words[0].bbox.x0 - 4 : pageRight;
    if (value.length) {
      if (['amountWords', 'accountHolder', 'branch'].includes(field)) {
        // Blur can split one value into two segments ("Konkan Coast" | "Education Trust"): merge unlabelled
        // segments that follow on the same row.
        for (let k = valueSeg + 1; k < row.length && !row[k].label; k++) {
          if (row[k].words.some((w) => /\d{3,}/.test(w.text))) break;
          value = [...value, ...clean(row[k].words)];
          valueSeg = k;
        }
        valueRight[field] = row[valueSeg + 1] ? row[valueSeg + 1].words[0].bbox.x0 - 4 : pageRight;
        value = [...value, ...clean(continuation(ri, value[0].bbox.x0, lh, Math.max(...value.map((w) => w.bbox.y1))))];
      }
    } else {
      // Label above value (card layouts): first row below, inside this label's column.
      const nextLabelX = row.filter((s) => s.label && s.words[0].bbox.x0 > bbox.x1).map((s) => s.words[0].bbox.x0);
      const right = nextLabelX.length ? Math.min(...nextLabelX) - 4 : Infinity;
      for (let r = ri + 1; r < segments.length && r <= ri + 3; r++) {
        const top = Math.min(...rows[r].map((w) => w.bbox.y0));
        if (top > bbox.y1 + 3.5 * lh) break;
        // Card layouts print the value directly under its label, left edges aligned.
        const seg2 = segments[r].find((s) => Math.abs(s.words[0].bbox.x0 - bbox.x0) < 3 * lh && s.words[0].bbox.x0 < right);
        if (!seg2) continue;
        if (seg2.label) break;
        value = clean(seg2.words.filter((w) => w.bbox.x0 < right));
        via = 'below';
        valueRight[field] = Number.isFinite(right) ? right : pageRight;
        break;
      }
    }
    if (value.length) hits.push({ field, words: value, via, labelBbox: bbox });
  }));
  const valueBoxes: Partial<Record<string, Bbox>> = {};
  for (const h of hits) if (!valueBoxes[h.field]) valueBoxes[h.field] = union(h.words)!;
  // Second-pass reads go first; layout reads stay as the comparison.
  for (const [f, list] of Object.entries(rereads) as [LabelField, ReadAlt[]][]) {
    for (const r of [...list].reverse()) hits.unshift({ field: f, words: [{ text: r.text, conf: r.conf, bbox: r.box }], via: 'reread', labelBbox: r.box });
  }
  const hitsFor = (f: LabelField) => hits.filter((h) => h.field === f);
  const textOf = (h: Hit) => h.words.map((w) => w.text).join(' ');
  /**
   * Majority vote over every read of a field (page pass + ensemble re-reads). Confirmed when at least two reads
   * agree and none disagree, or at least three agree with at most one dissent.
   */
  const vote = <T,>(f: LabelField, parse: (h: Hit) => T | null, key: (v: T) => string = String) => {
    const groups = new Map<string, { value: T; hits: Hit[] }>();
    for (const h of hitsFor(f)) {
      const v = parse(h);
      if (v === null || v === undefined) continue;
      const k = key(v);
      const g = groups.get(k);
      if (g) g.hits.push(h); else groups.set(k, { value: v, hits: [h] });
    }
    if (!groups.size) return null;
    const ranked = [...groups.values()].sort((a, b) => b.hits.length - a.hits.length || Math.max(...b.hits.map((h) => minConf(h.words))) - Math.max(...a.hits.map((h) => minConf(h.words))));
    const s = ranked[0].hits.length, s2 = ranked[1]?.hits.length ?? 0;
    return {
      value: ranked[0].value,
      hit: ranked[0].hits.find((h) => h.via !== 'reread') ?? ranked[0].hits[0],
      support: s,
      total: ranked.reduce((n, g) => n + g.hits.length, 0),
      alternatives: ranked.slice(1).map((g) => g.value),
      confirmed: (s >= 2 && s2 === 0) || (s >= 3 && s2 <= 1),
    };
  };
  const voteChecks = (v: { support: number; total: number; alternatives: unknown[]; confirmed: boolean }, show: (x: unknown) => string = String): Check[] =>
    v.confirmed ? [{ ok: true, text: `${v.support} of ${v.total} independent reads agree` }]
      : v.alternatives.length ? [{ ok: false, text: `Reads disagree: ${v.alternatives.slice(0, 2).map(show).join(', ')}` }]
        : [{ ok: false, text: 'Only one clear read — confirm against the scan' }];

  // ── 3. flattened text with word offsets, for sentence patterns ──
  let flat = '';
  const spans: { w: OcrWord; s: number; e: number }[] = [];
  for (const row of rows) for (const w of row) {
    if (flat) flat += ' ';
    spans.push({ w, s: flat.length, e: flat.length + w.text.length });
    flat += w.text;
  }
  const wordsIn = (s: number, e: number) => spans.filter((x) => x.e > s && x.s < e).map((x) => x.w);
  const pattern = (re: RegExp): { text: string; words: OcrWord[] } | null => {
    const m = re.exec(flat);
    if (!m || m.index === undefined) return null;
    const g = m[1] ?? m[0];
    const start = m.index + m[0].indexOf(g);
    return { text: g, words: wordsIn(start, start + g.length) };
  };

  // ── 4. field resolution ──
  const out = {} as Record<FieldKey, FieldResult>;
  const empty = (): FieldResult => ({ value: null, display: '—', confidence: 0, flagged: true, source: 'none', checks: [{ ok: false, text: 'Not found on the document' }], bbox: null });
  const make = (value: string, display: string, ws: OcrWord[], source: FieldSource, checks: Check[], conf?: number): FieldResult => {
    const c = conf ?? minConf(ws);
    return { value, display, confidence: c, flagged: false, source, checks, bbox: union(ws) };
  };
  const flagIfWeak = (r: FieldResult, crossChecked: boolean) => {
    if (!crossChecked && r.confidence < OCR_ONLY_MIN) {
      r.flagged = true;
      r.checks.push({ ok: false, text: `Low reading confidence (${Math.round(r.confidence * 100)}%) — confirm against the scan` });
    }
    if (r.checks.some((c) => !c.ok)) r.flagged = true;
    return r;
  };

  // Bank (closed vocabulary) and IFSC (strict format + RBI bank code).
  let bank: { info: BankInfo; exact: boolean; words: OcrWord[] } | null = null;
  const bankRows = rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r[0].bbox.y0 < pageH * 0.3 ? 0 : 1) - (b.r[0].bbox.y0 < pageH * 0.3 ? 0 : 1) || a.i - b.i);
  for (const { r } of bankRows) {
    const found = findBankInText(r.map((w) => w.text).join(' '));
    if (found) { bank = { info: found.bank, exact: found.exact, words: r.filter((w) => /[A-Za-z]{2,}/.test(w.text) && findBankInText(w.text) === null) }; break; }
  }
  if (bank) {
    const nameWords = new Set(bank.info.name.toLowerCase().split(' '));
    const row = rows.find((r) => findBankInText(r.map((w) => w.text).join(' '))?.bank === bank!.info)!;
    bank.words = row.filter((w) => nameWords.has(normTok(w.text)) || [...nameWords].some((n) => n.length >= 4 && levenshtein(normTok(w.text), n) <= 1));
  }

  let ifsc: { value: string; words: OcrWord[]; via: FieldSource } | null = null;
  const ifscOf = (h: Hit) => fixIfsc(h.words[0].text) ?? (h.words.length > 1 ? fixIfsc(h.words[0].text + h.words[1].text) : null);
  if (!hitsFor('ifsc').some((h) => h.via !== 'reread' && ifscOf(h))) {
    // IFSC printed inside a header line ("IFSC: SBIN0001234 · MICR …") — joins the vote like a labelled read.
    for (const w of words) {
      const raw = w.text.replace(/^IFSC[:.]?/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      let v = fixIfsc(raw);
      // One extra character read into the code ("CBIND0253984"): try dropping it. Only a candidate — it must
      // then win the vote against the cropped re-reads before it is trusted.
      if (!v && raw.length === 12) {
        for (let i = 4; i < 12 && !v; i++) { const c = fixIfsc(raw.slice(0, i) + raw.slice(i + 1)); if (c && BANK_BY_CODE.has(c.slice(0, 4))) v = c; }
        if (v) { valueBoxes.ifsc ??= w.bbox; hits.push({ field: 'ifsc', words: [{ ...w, text: v, conf: Math.min(w.conf, 0.5) }], via: 'pattern', labelBbox: w.bbox }); break; }
      }
      if (v && BANK_BY_CODE.has(v.slice(0, 4))) { hits.push({ field: 'ifsc', words: [{ ...w, text: v }], via: 'pattern', labelBbox: w.bbox }); valueBoxes.ifsc ??= w.bbox; break; }
    }
  }
  const ifscVote = vote('ifsc', ifscOf);
  if (ifscVote) {
    const h = ifscVote.hit;
    ifsc = { value: ifscVote.value, words: h.words.slice(0, fixIfsc(h.words[0].text) ? 1 : 2), via: h.via };
  }
  const codeBank = ifsc ? BANK_BY_CODE.get(ifsc.value.slice(0, 4)) : undefined;

  if (bank) {
    const agree = codeBank?.code === bank.info.code;
    const checks: Check[] = [];
    if (codeBank) checks.push(agree ? { ok: true, text: `Matches IFSC bank code ${codeBank.code}` } : { ok: false, text: `IFSC belongs to ${codeBank.name}` });
    if (!bank.exact) checks.push({ ok: agree, text: agree ? 'Name read with a small OCR slip, confirmed by IFSC' : 'Bank name read with an OCR slip' });
    out.bank = flagIfWeak(make(bank.info.name, bank.info.name, bank.words, 'header', checks, agree ? 0.99 : bank.exact ? 0.95 : 0.8), agree || bank.exact);
  } else if (codeBank) {
    out.bank = make(codeBank.name, codeBank.name, ifsc!.words, 'derived', [{ ok: false, text: 'Bank name not found — taken from the IFSC code' }], 0.85);
    out.bank.flagged = true;
  } else out.bank = empty();

  if (ifsc) {
    const checks: Check[] = [{ ok: true, text: 'Valid IFSC format (AAAA0XXXXXX)' }];
    let cross = false;
    if (codeBank && bank && codeBank.code === bank.info.code) { checks.push({ ok: true, text: `Bank code ${codeBank.code} matches ${bank.info.name}` }); cross = true; }
    else if (!codeBank) checks.push({ ok: false, text: 'Unknown bank code' });
    // The bank prefix is cross-checked by the bank name; the 6-character branch part needs independent reads to agree.
    const twoReads = !!ifscVote?.confirmed;
    if (ifscVote) checks.push(...voteChecks(ifscVote));
    // S/5, O/0, B/8… next to a digit in the branch part can't be settled by OCR alone.
    const tail = ifsc.value.slice(5);
    const look = (ch?: string) => !!ch && LOOKALIKE.test(ch);
    // A look-alike next to a digit ("M8" read "MS") or two look-alikes in a row ("608" read "GOS").
    if ([...tail].some((ch, i) => look(ch) && (/\d/.test(tail[i - 1] ?? '') || /\d/.test(tail[i + 1] ?? '') || look(tail[i - 1]) || look(tail[i + 1])))) {
      checks.push({ ok: false, text: 'Branch code mixes letters and digits that OCR confuses (S/5, O/0, B/8)' });
    }
    out.ifsc = flagIfWeak(make(ifsc.value, ifsc.value, ifsc.words, ifsc.via, checks, cross && twoReads ? 0.99 : undefined), cross && twoReads);
  } else out.ifsc = empty();

  // FDR number — the distractor numbers (customer ID, accounts) are already claimed by their own labels.
  out.fdrNumber = empty();
  const parseHit = (x: Hit) => parseFdrNumber(x.words)?.value ?? null;
  const fdrLabelled = hitsFor('fdrNumber').some((h) => h.via !== 'reread');
  if (!fdrLabelled && !hitsFor('fdrNumber').length) {
    // Label unreadable: propose the one number with exactly this bank's FDR length that no other label claims.
    // Only ever a suggestion — it is flagged below even if the re-reads agree, because it may be another account.
    const len = (bank?.info ?? codeBank)?.fdrDigits;
    const claimed = new Set(hits.filter((h) => h.field !== 'fdrNumber').flatMap((h) => h.words.map((w) => w.text.replace(/\D/g, ''))));
    const cands = len ? words.filter((w) => { const d = w.text.replace(/[^0-9]/g, ''); return d.length === len && /^\D*\d+\D*$/.test(w.text) && !claimed.has(d); }) : [];
    if (cands.length === 1) { valueBoxes.fdrNumber ??= cands[0].bbox; hits.push({ field: 'fdrNumber', words: [cands[0]], via: 'pattern', labelBbox: cands[0].bbox }); }
  }
  const fdrVote = vote('fdrNumber', parseHit);
  for (const h of fdrVote ? [fdrVote.hit] : []) {
    const p = parseFdrNumber(h.words);
    if (!p) continue;
    const checks: Check[] = fdrLabelled ? [{ ok: true, text: 'Read next to the FDR number label' }] : [];
    if (p.fixed) checks.push({ ok: true, text: 'Corrected look-alike characters (O→0, I→1…)' });
    const others = ['customerId', 'linkedAccount'].flatMap((f) => hitsFor(f as LabelField).map((x) => x.words.map((w) => w.text).join('')));
    if (others.includes(p.value)) checks.push({ ok: false, text: 'Same as another account number on the page' });
    const bankInfo = bank?.info ?? codeBank;
    if (bankInfo && /^\d+$/.test(p.value)) {
      checks.push(p.value.length === bankInfo.fdrDigits
        ? { ok: true, text: `${bankInfo.fdrDigits} digits, as ${bankInfo.name} deposit numbers have` }
        : { ok: false, text: `${p.value.length} digits — ${bankInfo.name} deposit numbers have ${bankInfo.fdrDigits}` });
    } else if (/^[A-Z]/.test(p.value) && LOOKALIKE.test(p.value.match(/^[A-Z]+/)![0].slice(-1))) {
      checks.push({ ok: false, text: 'Letter prefix ends in a character OCR confuses with a digit' });
    }
    const twoReads = fdrVote!.confirmed;
    checks.push(...voteChecks(fdrVote!));
    if (!fdrLabelled) checks.push({ ok: false, text: 'Found by its number format, not next to an FDR-number label — confirm it is the FDR number' });
    out.fdrNumber = flagIfWeak(make(p.value, p.value, p.used, h.via, checks, twoReads ? 0.98 : undefined), twoReads);
    break;
  }

  // Account holder — snapped to a registered trust when it clearly is one.
  out.accountHolder = empty();
  const holderCandidates: { text: string; words: OcrWord[]; via: FieldSource }[] = hitsFor('accountHolder').map((h) => ({ text: h.words.map((w) => w.text).join(' '), words: h.words, via: h.via }));
  const fromPara = pattern(/received (?:with thanks )?from\s+(.+?)\s+(?:the |a )?sum of/i);
  if (fromPara) holderCandidates.push({ ...fromPara, via: 'pattern' });
  for (const c of holderCandidates) {
    const text = c.text.replace(/\s+/g, ' ').replace(/[,;:]+$/, '').trim();
    if (!/[A-Za-z]{3}/.test(text) || /\d{3}/.test(text)) continue;
    const display = titleIfShouting(text);
    const n = normName(text);
    const match = matchRegistered(n, opts.knownHolders ?? []);
    if (match) {
      out.accountHolder = make(match.name, match.name, c.words, 'dictionary', [{ ok: true, text: match.exact ? 'Exactly matches a registered trust' : 'Matched a registered trust (OCR slips corrected)' }], 0.98);
    } else {
      const holderText = (h: Hit) => { const t = textOf(h).replace(/\s+/g, ' ').replace(/[,;:]+$/, '').trim(); return /[A-Za-z]{3}/.test(t) && !/\d{3}/.test(t) ? t : null; };
      const v = vote('accountHolder', holderText, normName);
      const best = v ? titleIfShouting(v.value) : display;
      const checks: Check[] = [{ ok: true, text: 'Not a registered trust name — check it is the institution\'s trust' }, ...(v ? voteChecks(v) : [{ ok: false, text: 'Only one clear read — confirm against the scan' }])];
      out.accountHolder = flagIfWeak(make(best, best, v?.hit.words ?? c.words, v?.hit.via ?? c.via, checks, v?.confirmed ? 0.96 : undefined), !!v?.confirmed);
    }
    break;
  }

  // Amount: figures vs words vs maturity value.
  const figCandidates = [...hitsFor('amount').map((h) => ({ ...h, text: h.words.map((w) => w.text).join(' ') }))];
  // "(Rs. 9,72,30,830.00)" — the rupee sign is often read as "2", "Z", "%" or "¥", so allow one short junk token.
  const paren = pattern(/\(\s*((?:rs\.?|inr|₹|\S{1,2})?\s*[0-9OoIlSB][0-9OoIlSB,]*\.[0-9OoIl]{2})\s*\)/i);
  if (paren) valueBoxes.amount ??= union(paren.words)!;
  if (paren) figCandidates.push({ field: 'amount', words: paren.words, via: 'pattern', labelBbox: union(paren.words)!, text: paren.text });
  let figures: { value: number; words: OcrWord[]; via: FieldSource; wellGrouped: boolean } | null = null;
  for (const c of figCandidates) {
    const p = parseAmountFigures(c.text);
    if (p) { figures = { value: p.value, words: c.words, via: c.via, wellGrouped: p.wellGrouped }; break; }
  }
  let inWords: { value: number; words: OcrWord[] } | null = null;
  for (const h of hitsFor('amountWords')) {
    const v = parseAmountWords(h.words.map((w) => w.text).join(' '));
    if (v !== null) { inWords = { value: v, words: h.words }; break; }
  }
  if (!inWords) {
    const p = pattern(/(rupees?\s+(?:[a-z]+[\s-]+){1,24}?only)/i);
    const v = p ? parseAmountWords(p.text) : null;
    if (p && v !== null) { inWords = { value: v, words: p.words }; valueBoxes.amountWords ??= union(p.words)!; }
  }
  let mv: number | null = null;
  for (const h of hitsFor('maturityValue')) { const p = parseAmountFigures(h.words.map((w) => w.text).join(' ')); if (p) { mv = p.value; break; } }

  // Dates and tenure.
  const dateOf = (f: LabelField) => {
    const v = vote(f, (h) => parseDate(textOf(h)));
    return v ? { value: v.value, words: v.hit.words, via: v.hit.via, vote: v } : null;
  };
  const issue = dateOf('issueDate'), maturity = dateOf('maturityDate');
  const tenureVote = vote('tenure', (h) => parseTenure(textOf(h)), (t) => formatTenure(t));
  let tenure: Tenure | null = tenureVote?.value ?? null;
  if (!tenure) {
    const p = pattern(/period of\s+((?:\d{1,4}\s+(?:years?|months?|days?)\s*){1,3})/i);
    if (p) { tenure = parseTenure(p.text); valueBoxes.tenure ??= union(p.words)!; }
  }

  // Interest rate.
  let rate: { value: number; words: OcrWord[]; via: FieldSource } | null = null;
  const rateFrom = (text: string) => {
    const m = text.match(/([0-9OoIl]{1,2})\s*[.,]\s*([0-9OoIl]{1,2})/);
    if (!m) return null;
    const v = Number(`${fixDigits(m[1])}.${fixDigits(m[2])}`);
    return v > 0.5 && v < 20 ? v : null;
  };
  for (const h of hitsFor('interestRate')) { const v = rateFrom(h.words.map((w) => w.text).join(' ')); if (v !== null) { rate = { value: v, words: h.words, via: h.via }; break; } }
  if (!rate) {
    const p = pattern(/(\d{1,2}\s*[.,]\s*\d{1,2})\s*%\s*(?:p\.?\s*a\.?|per annum)/i);
    const v = p ? rateFrom(p.text) : null;
    if (p && v !== null) { rate = { value: v, words: p.words, via: 'pattern' }; valueBoxes.interestRate ??= union(p.words)!; }
  }

  // Cross-check: issue + tenure = maturity.
  const datesAgree = !!(issue && maturity && tenure && addTenure(issue.value, tenure) === maturity.value);
  const tenureText = tenure ? formatTenure(tenure) : null;
  const dateDisplay = (iso: string) => formatDocDate(iso, 'short');
  // Dates need BOTH: the arithmetic check (deposit + period = maturity) and agreeing independent reads.
  // Reads alone are not enough — in serif print "2025" reads as "2028" in every reader (tested: 4 silent errors
  // on dev when votes alone were accepted). The arithmetic alone is not enough either — blur can turn the same
  // digit wrong in both dates.
  const showDate = (x: unknown) => dateDisplay(String(x));
  if (issue) {
    const checks: Check[] = [];
    if (datesAgree) checks.push({ ok: true, text: `Deposit date + ${tenureText} = maturity date` });
    else if (maturity && tenure) checks.push({ ok: false, text: `Deposit date + ${tenureText} does not give the maturity date` });
    checks.push(...voteChecks(issue.vote, showDate));
    out.issueDate = flagIfWeak(make(issue.value, dateDisplay(issue.value), issue.words, issue.via, checks, datesAgree && issue.vote.confirmed ? 0.99 : undefined), datesAgree);
  } else if (maturity && tenure) {
    const v = addTenure(maturity.value, tenure, -1);
    out.issueDate = make(v, dateDisplay(v), [], 'derived', [{ ok: false, text: `Calculated as maturity date − ${tenureText} — confirm on the scan` }], 0.8);
    out.issueDate.flagged = true;
  } else out.issueDate = empty();
  if (maturity) {
    const checks: Check[] = [];
    if (datesAgree) checks.push({ ok: true, text: `Matches deposit date + ${tenureText}` });
    else if (issue && tenure) checks.push({ ok: false, text: `Expected ${dateDisplay(addTenure(issue.value, tenure))} from deposit date + ${tenureText}` });
    if (issue && maturity.value <= issue.value) checks.push({ ok: false, text: 'Maturity is not after the deposit date' });
    checks.push(...voteChecks(maturity.vote, showDate));
    out.maturityDate = flagIfWeak(make(maturity.value, dateDisplay(maturity.value), maturity.words, maturity.via, checks, datesAgree && maturity.vote.confirmed ? 0.99 : undefined), datesAgree);
  } else if (issue && tenure) {
    const v = addTenure(issue.value, tenure);
    out.maturityDate = make(v, dateDisplay(v), [], 'derived', [{ ok: false, text: `Calculated as deposit date + ${tenureText} — confirm on the scan` }], 0.8);
    out.maturityDate.flagged = true;
  } else out.maturityDate = empty();

  // Cross-check: principal × rate × period = printed maturity value.
  const days = issue && tenure ? tenureDays(issue.value, tenure) : issue && maturity ? Math.round((Date.parse(maturity.value) - Date.parse(issue.value)) / 86400000) : null;
  // Tight tolerance on purpose: a bank's different rounding only means "not confirmed" (flagged), never a wrong accept.
  const mvAgrees = (principal: number) => !!(mv && rate && days && Math.abs(computeMaturityValue(principal, rate.value, days) - mv) <= Math.max(1.5, mv * 0.00001));

  if (figures || inWords) {
    const checks: Check[] = [];
    let value: number, ws: OcrWord[], via: FieldSource, conf: number | undefined, cross = false;
    if (figures && inWords && Math.abs(figures.value - inWords.value) < 0.005) {
      value = figures.value; ws = figures.words; via = figures.via; conf = 0.995; cross = true;
      checks.push({ ok: true, text: 'Figures match the amount in words' });
    } else if (inWords && (!figures || mvAgrees(inWords.value))) {
      value = inWords.value; ws = inWords.words; via = 'words'; conf = mvAgrees(inWords.value) ? 0.97 : 0.9; cross = mvAgrees(inWords.value);
      checks.push(figures ? { ok: true, text: 'Figures unreadable — amount taken from words' } : { ok: true, text: 'Read from the amount in words' });
      if (!cross) checks.push({ ok: false, text: 'Not confirmed by a second source' });
    } else if (figures && inWords) {
      value = inWords.value; ws = inWords.words; via = 'words';
      checks.push({ ok: false, text: `Figures say ${formatIndian(figures.value)} but words say ${formatIndian(inWords.value)}` });
    } else {
      value = figures!.value; ws = figures!.words; via = figures!.via; cross = mvAgrees(value);
      if (cross) conf = 0.96;
      if (!figures!.wellGrouped) checks.push({ ok: false, text: 'Digit grouping looks wrong' });
    }
    if (mv && rate && days) checks.push(mvAgrees(value) ? { ok: true, text: 'Principal, rate and period reproduce the printed maturity value' } : { ok: false, text: 'Principal, rate and period do not reproduce the printed maturity value' });
    out.amount = flagIfWeak(make(value.toFixed(2), `₹${formatIndian(value)}`, ws, via, checks, conf), cross);
  } else out.amount = empty();

  if (rate) {
    const principal = out.amount.value ? Number(out.amount.value) : null;
    const cross = principal !== null && mvAgrees(principal);
    const checks: Check[] = cross ? [{ ok: true, text: 'Reproduces the printed maturity value' }] : [];
    out.interestRate = flagIfWeak(make(rate.value.toFixed(2), `${rate.value.toFixed(2)}% p.a.`, rate.words, rate.via, checks, cross ? 0.99 : undefined), cross);
  } else out.interestRate = empty();

  // Branch — free text, confirmed only by reading confidence.
  out.branch = empty();
  // Each read's place names are corrected against the place list before voting.
  const branchText = (x: Hit) => {
    const t = textOf(x).replace(/\s+/g, ' ').replace(/[,;:]+$/, '').trim();
    return /[A-Za-z]{3}/.test(t) && !/\d{3,}/.test(t) ? correctPlaces(t).text : null;
  };
  const branchVote = vote('branch', branchText, normName);
  if (branchVote) {
    const display = titleIfShouting(branchVote.value);
    const places = correctPlaces(branchVote.value);
    const checks = voteChecks(branchVote);
    if (places.found.length) checks.unshift({ ok: true, text: `Contains a known place name (${places.found.join(', ')})` });
    out.branch = flagIfWeak(make(display, display, branchVote.hit.words, branchVote.hit.via, checks, branchVote.confirmed ? 0.97 : undefined), branchVote.confirmed);
  }

  for (const k of FIELD_KEYS) if (!out[k]) out[k] = empty();

  // Resolution gate: at this size blur turns digits into other digits consistently, which fools both voting and
  // the date arithmetic. Only checks that compare different representations (figures vs words) still count.
  if (opts.lowResolution) {
    const gated: FieldKey[] = ['fdrNumber', 'ifsc', 'issueDate', 'maturityDate', 'interestRate', 'branch'];
    if (out.accountHolder.source !== 'dictionary') gated.push('accountHolder');
    if (!out.amount.checks.some((c) => c.ok && c.text.startsWith('Figures match'))) gated.push('amount');
    for (const k of gated) {
      if (out[k].value === null) continue;
      out[k].checks.push({ ok: false, text: `Image resolution too low (text ≈${Math.round(opts.textPx ?? 0)}px) — confirm against the scan or upload a sharper copy` });
      out[k].flagged = true;
    }
  }
  const confs = words.map((w) => w.conf);
  return {
    fields: out, tenureText, maturityValue: mv, valueBoxes, valueRight, lineHeight: hMed,
    text: rows.map((r) => r.map((w) => w.text).join(' ')).join('\n'),
    wordCount: words.length,
    meanConfidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0,
  };
}
