// Generates SYNTHETIC demo data into src/data/*.json.
// Every institution, FDR, IFSC and hash here is fictional. Replace the JSON files
// with real (or better synthetic) datasets as they become available.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const REF_DATE = '2026-10-23'; // anomalies (maturing soon, lapsed) are placed relative to this

let seed = 20261023;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
const sha = (s) => createHash('sha256').update(s).digest('hex');

const addDays = (iso, d) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const addYears = (iso, y) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCFullYear(t.getUTCFullYear() + y); return t.toISOString().slice(0, 10); };
const flipBits = (h, n) => {
  let v = BigInt('0x' + h);
  const used = new Set();
  while (used.size < n) used.add(int(0, 63));
  for (const b of used) v ^= 1n << BigInt(b);
  return v.toString(16).padStart(16, '0');
};

const INSTITUTIONS = [
  ['Aravali Ridge Institute of Technology', 'Rajasthan', 'Udaipur', 'Aravali Ridge Educational Trust'],
  ['Kaveri Delta College of Engineering', 'Tamil Nadu', 'Thanjavur', 'Kaveri Delta Education Society'],
  ['Vindhya Valley Engineering College', 'Madhya Pradesh', 'Jabalpur', 'Vindhya Valley Shiksha Samiti'],
  ['Nilgiri Heights Institute of Technology', 'Tamil Nadu', 'Coimbatore', 'Nilgiri Heights Charitable Trust'],
  ['Konkan Coast College of Engineering', 'Maharashtra', 'Ratnagiri', 'Konkan Coast Education Trust'],
  ['Deccan Plateau Institute of Management', 'Telangana', 'Warangal', 'Deccan Plateau Learning Society'],
  ['Brahmaputra Valley Polytechnic', 'Assam', 'Guwahati', 'Brahmaputra Valley Vidya Trust'],
  ['Malabar Shore Engineering College', 'Kerala', 'Kozhikode', 'Malabar Shore Educational Society'],
  ['Satpura Range Institute of Technology', 'Maharashtra', 'Nagpur', 'Satpura Range Shikshan Sanstha'],
  ['Godavari Basin College of Pharmacy', 'Andhra Pradesh', 'Rajahmundry', 'Godavari Basin Health Education Trust'],
  ['Thar Desert Institute of Engineering', 'Rajasthan', 'Jodhpur', 'Thar Desert Technical Education Trust'],
  ['Mahanadi Delta Institute of Technology', 'Odisha', 'Cuttack', 'Mahanadi Delta Education Foundation'],
  ['Ganga Plains Engineering College', 'Uttar Pradesh', 'Varanasi', 'Ganga Plains Vidya Peeth Trust'],
  ['Western Ghats College of Architecture', 'Karnataka', 'Mangaluru', 'Western Ghats Design Education Society'],
].map(([name, state, city, trustName], i) => ({
  id: `INS-${String(i + 1).padStart(3, '0')}`,
  name, state, city, trustName,
  aicteId: `SYN-1-${String(4100 + i * 37)}`,
}));

// [name, IFSC bank code, digits in an FDR number] — keep in sync with src/lib/ocr/banks.ts
const BANKS = [
  ['State Bank of India', 'SBIN', 11], ['Canara Bank', 'CNRB', 13], ['Indian Bank', 'IDIB', 10], ['Bank of Baroda', 'BARB', 14],
  ['Punjab National Bank', 'PUNB', 16], ['Union Bank of India', 'UBIN', 15], ['HDFC Bank', 'HDFC', 14], ['ICICI Bank', 'ICIC', 12],
];

const highConf = () => ({
  fdrNumber: +(0.9 + rand() * 0.09).toFixed(2), bank: +(0.95 + rand() * 0.04).toFixed(2),
  branch: +(0.86 + rand() * 0.12).toFixed(2), ifsc: +(0.88 + rand() * 0.11).toFixed(2),
  accountHolder: +(0.85 + rand() * 0.13).toFixed(2), amount: +(0.9 + rand() * 0.09).toFixed(2),
  issueDate: +(0.88 + rand() * 0.11).toFixed(2), maturityDate: +(0.88 + rand() * 0.11).toFixed(2),
});

let fdrSeq = 0;
const fdrs = [];
function makeFdr(inst, overrides = {}) {
  // A renewal keeps its bank, so its new FDR number must follow that bank's format too.
  const picked = pick(BANKS);
  const [bank, code, fdrDigits] = overrides.bank ? BANKS.find((b) => b[0] === overrides.bank) : picked;
  const tenure = pick([1, 2, 3, 3, 5]);
  const issueDate = addDays('2021-01-04', int(0, 2050));
  const f = {
    id: `FDR-${String(++fdrSeq).padStart(4, '0')}`,
    fdrNumber: String(int(1, 9)) + Array.from({ length: fdrDigits - 1 }, () => int(0, 9)).join(''),
    institutionId: inst.id,
    bank, branch: `${inst.city} Main Branch`,
    ifsc: `${code}0SYN${String(int(1, 999)).padStart(3, '0')}`,
    accountHolder: inst.trustName,
    amount: pick([25, 30, 50, 50, 75, 100]) * 100000,
    issueDate, maturityDate: addYears(issueDate, tenure),
    interestRate: +(6 + rand() * 1.5).toFixed(2),
    lien: 'confirmed', bankVerification: 'verified',
    ocrConfidence: highConf(),
    fileHash: sha(`file-${fdrSeq}-${rand()}`),
    imageHash: hex(16),
    uploadedAt: addDays(issueDate, int(2, 20)) + `T${String(int(9, 17)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00Z`,
    ...overrides,
  };
  fdrs.push(f);
  return f;
}

// Baseline: 2–3 FDRs per institution; matured ones are usually renewed.
for (const inst of INSTITUTIONS) {
  const n = int(2, 3);
  for (let i = 0; i < n; i++) {
    const f = makeFdr(inst);
    if (f.maturityDate < REF_DATE) {
      const issue = addDays(f.maturityDate, 1);
      makeFdr(inst, {
        bank: f.bank, branch: f.branch, ifsc: f.ifsc, amount: f.amount, issueDate: issue,
        maturityDate: addYears(issue, pick([3, 5])), renewedFromId: f.id,
        uploadedAt: addDays(issue, int(2, 10)) + 'T11:00:00Z',
      });
    }
  }
}

const active = () => fdrs.filter((f) => f.maturityDate >= REF_DATE && !fdrs.some((g) => g.renewedFromId === f.id));
const byInst = (id) => INSTITUTIONS.find((i) => i.id === id);

// 1. Exact duplicate: institution 6 resubmits institution 1's FDR (same file).
{
  const src = active().find((f) => f.institutionId === 'INS-001');
  const { id: _id, renewedFromId: _r, ...copy } = src;
  makeFdr(byInst('INS-006'), { ...copy, institutionId: 'INS-006', uploadedAt: '2026-09-14T10:12:00Z' });
}
// 2. Re-scanned near-duplicate: institution 11 submits a re-scan of institution 4's FDR with one digit changed.
{
  const src = active().find((f) => f.institutionId === 'INS-004');
  const num = src.fdrNumber.slice(0, -1) + ((+src.fdrNumber.slice(-1) + 3) % 10);
  makeFdr(byInst('INS-011'), {
    fdrNumber: num, bank: src.bank, branch: src.branch, ifsc: src.ifsc, amount: src.amount,
    issueDate: src.issueDate, maturityDate: src.maturityDate, interestRate: src.interestRate,
    imageHash: flipBits(src.imageHash, 3), accountHolder: byInst('INS-011').trustName,
    uploadedAt: '2026-10-02T15:40:00Z',
  });
}
// 3. Altered amount: institution 8 uploads a second copy of its own FDR with the amount changed.
{
  const src = active().find((f) => f.institutionId === 'INS-008');
  makeFdr(byInst('INS-008'), {
    fdrNumber: src.fdrNumber, bank: src.bank, branch: src.branch, ifsc: src.ifsc,
    amount: src.amount + 3000000, issueDate: src.issueDate, maturityDate: src.maturityDate,
    interestRate: src.interestRate, imageHash: flipBits(src.imageHash, 7), uploadedAt: '2026-10-11T12:05:00Z',
  });
}

// 4–10. Field-level anomalies on otherwise normal records.
const injected = new Set(fdrs.slice(-3).map((f) => f.id));
const pool = active().filter((f) => !injected.has(f.id));
const order = pool.map((f) => [rand(), f]).sort((a, b) => a[0] - b[0]).map(([, f]) => f);
let cursor = 0;
const take = () => {
  if (cursor >= order.length) throw new Error('Not enough records for anomalies — add institutions');
  return order[cursor++];
};

take().bankVerification = 'mismatch';
take().bankVerification = 'not-found';
for (let i = 0; i < 3; i++) take().bankVerification = 'pending';
for (let i = 0; i < 3; i++) take().lien = 'not-marked';
for (let i = 0; i < 4; i++) take().lien = 'pending';

// maturing soon (no renewal yet), then matured but neither renewed nor released
for (const d of [9, 24, 41, 63, 86, -74, -38]) {
  const f = take();
  f.maturityDate = addDays(REF_DATE, d);
  f.issueDate = addYears(f.maturityDate, -3);
  f.uploadedAt = addDays(f.issueDate, 6) + 'T10:00:00Z';
}
for (const name of ['R. Senthil Kumar', 'Meera Joshi']) take().accountHolder = name;
for (const fields of [['amount'], ['fdrNumber', 'ifsc'], ['maturityDate']]) {
  const f = take();
  for (const k of fields) f.ocrConfidence[k] = +(0.52 + rand() * 0.16).toFixed(2);
}

// Release requests (sample checklist — replace with the official AICTE list).
const CHECKLIST = [
  'Release request on institution letterhead',
  'Original FDR submitted to AICTE',
  'No-dues certificate from AICTE accounts',
  'No pending complaints / show-cause notices',
  'Compliance clearance from Regional Office',
  'Bank lien-release letter draft',
];
const releases = [
  { done: [1, 1, 1, 1, 1, 1], released: true, reason: 'Institution closure approved' },
  { done: [1, 1, 1, 0, 1, 0], reason: 'Programme discontinued' },
  { done: [1, 1, 0, 0, 0, 0], reason: 'Deposit replaced by bank guarantee' },
  { done: [1, 0, 1, 1, 1, 1], reason: 'Matured — release requested' },
];
for (const r of releases) {
  const f = take();
  const at = addDays(REF_DATE, -int(5, 60));
  f.release = {
    requestedAt: at + 'T10:30:00Z', reason: r.reason,
    checklist: CHECKLIST.map((item, i) => ({ item, done: !!r.done[i] })),
    ...(r.released ? { releasedAt: addDays(at, 12) + 'T16:00:00Z' } : {}),
  };
}

// Audit events (chained with SHA-256 in the browser).
const events = [];
for (const f of fdrs) {
  const inst = byInst(f.institutionId);
  const t = f.uploadedAt;
  events.push({ at: t, actor: `College portal · ${inst.aicteId}`, action: 'FDR uploaded', fdrId: f.id, detail: `File SHA-256 ${f.fileHash.slice(0, 12)}…` });
  events.push({ at: t.replace(/:00Z$/, ':20Z'), actor: 'System · OCR', action: 'Fields extracted', fdrId: f.id, detail: `8 fields, min confidence ${Math.min(...Object.values(f.ocrConfidence)).toFixed(2)}` });
  events.push({ at: t.replace(/:00Z$/, ':40Z'), actor: 'Bank gateway (simulated)', action: 'Bank verification', fdrId: f.id, detail: `Response: ${f.bankVerification}` });
  if (f.lien === 'confirmed') events.push({ at: addDays(t.slice(0, 10), 3) + 'T12:00:00Z', actor: 'Bank gateway (simulated)', action: 'Lien confirmed', fdrId: f.id, detail: 'Deposit locked in favour of AICTE' });
  if (f.release) {
    events.push({ at: f.release.requestedAt, actor: `College portal · ${inst.aicteId}`, action: 'Release requested', fdrId: f.id, detail: f.release.reason });
    if (f.release.releasedAt) events.push({ at: f.release.releasedAt, actor: 'Officer · FDR Cell', action: 'Deposit released', fdrId: f.id, detail: 'All checklist items cleared' });
  }
}
events.sort((a, b) => a.at.localeCompare(b.at));

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'institutions.json'), JSON.stringify(INSTITUTIONS, null, 2) + '\n');
writeFileSync(join(OUT, 'fdrs.json'), JSON.stringify(fdrs, null, 2) + '\n');
writeFileSync(join(OUT, 'audit-events.json'), JSON.stringify(events, null, 2) + '\n');
console.log(`Wrote ${INSTITUTIONS.length} institutions, ${fdrs.length} FDRs, ${events.length} audit events → src/data/`);
