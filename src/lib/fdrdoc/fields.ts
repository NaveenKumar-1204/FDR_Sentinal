// Random but realistic field values for synthetic FDR documents (dataset + in-app samples).
import type { FDR, Institution } from '../../data/types';
import { BANKS, BANK_BY_NAME } from '../ocr/banks';
import { addTenure, maturityValue, tenureDays, type Tenure } from '../ocr/dates';

export interface DocFields {
  bank: string;
  bankCode: string;
  branch: string;
  city: string;
  ifsc: string;
  fdrNumber: string;
  accountHolder: string;
  amount: number;
  issueDate: string;
  maturityDate: string;
  tenure: Tenure;
  interestRate: number;
  maturityValue: number;
  customerId: string;
  linkedAccount: string;
  micr: string;
  branchCode: string;
  phone: string;
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const digits = (r: Rng, n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? int(r, 1, 9) : int(r, 0, 9))).join('');

const CITIES = ['Udaipur', 'Thanjavur', 'Jabalpur', 'Coimbatore', 'Ratnagiri', 'Warangal', 'Guwahati', 'Kozhikode', 'Nagpur', 'Rajahmundry',
  'Jodhpur', 'Cuttack', 'Varanasi', 'Mangaluru', 'Madurai', 'Tiruchirappalli', 'Salem', 'Erode', 'Nashik', 'Indore', 'Bhopal', 'Lucknow',
  'Patna', 'Ranchi', 'Dehradun', 'Shimla', 'Mysuru', 'Hubballi', 'Vellore', 'Tirunelveli'];
const AREAS = ['Gandhi Road', 'Station Road', 'Civil Lines', 'Anna Nagar', 'MG Road', 'Market Street', 'College Road', 'Industrial Estate', 'Cantonment', 'Collectorate'];
const TRUST_A = ['Sri Saraswathi', 'Vidya Bharathi', 'Gyan Jyoti', 'Sunrise', 'Pragati', 'Annai', 'Shiksha Deep', 'Navodaya', 'Kalpataru', 'Vivekananda',
  'Gurukul', 'Amrita Sagar', 'Jnana Deepa', 'Shanthi Niketan', 'Lakshmi Narayana'];
const TRUST_B = ['Educational Trust', 'Education Society', 'Charitable Trust', 'Shiksha Samiti', 'Vidya Peeth Trust', 'Memorial Education Trust', 'Foundation'];
const PEOPLE = ['R. Senthil Kumar', 'Meera Joshi', 'Arun Prakash', 'Kavitha Raman', 'Sanjay Verma', 'Fatima Begum', 'Joseph Mathew', 'Priya Nair'];

function ifscFor(r: Rng, code: string): string {
  const tail = r() < 0.8 ? String(int(r, 0, 999999)).padStart(6, '0') : `${pick(r, ['A', 'B', 'C', 'K', 'M', 'R'])}${String(int(r, 0, 99999)).padStart(5, '0')}`;
  return `${code}0${tail}`;
}

function fdrNumberFor(r: Rng, code: string): string {
  return digits(r, BANKS.find((b) => b.code === code)?.fdrDigits ?? 11);
}

function tenureFor(r: Rng): Tenure {
  const k = r();
  if (k < 0.65) return { years: int(r, 1, 5), months: 0, days: 0 };
  if (k < 0.85) return { years: 0, months: 0, days: pick(r, [180, 222, 333, 400, 444, 555, 666, 777, 999, 1111]) };
  return { years: 0, months: pick(r, [6, 9, 13, 15, 18, 24, 30, 36]), days: 0 };
}

function isoDay(r: Rng, fromYear: number, toYear: number): string {
  const y = int(r, fromYear, toYear), m = int(r, 1, 12), d = int(r, 1, 28);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function extras(r: Rng) {
  return {
    customerId: digits(r, 9),
    linkedAccount: digits(r, pick(r, [11, 12, 14])),
    micr: digits(r, 9),
    branchCode: String(int(r, 1000, 99999)).padStart(5, '0'),
    phone: `0${int(r, 20, 99)}-${int(r, 2, 2)}${digits(r, 7)}`,
  };
}

/** A completely random FDR. Holder is a registered trust (from `trusts`), an invented trust, or a person. */
export function randomFields(r: Rng, trusts: string[]): DocFields {
  const bank = pick(r, BANKS);
  const city = pick(r, CITIES);
  const branch = r() < 0.5 ? `${city} Main Branch` : r() < 0.5 ? `${pick(r, AREAS)}, ${city}` : `${city} ${pick(r, ['Town', 'City', 'Cantonment', 'Bazaar'])} Branch`;
  const tenure = tenureFor(r);
  const issueDate = isoDay(r, 2019, 2026);
  const kind = r();
  const amount = kind < 0.55 ? pick(r, [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200]) * 100000
    : kind < 0.85 ? int(r, 100000, 99999999) : int(r, 10000000, 999999999) / 100;
  const rate = int(r, 550, 825) / 100;
  const holderKind = r();
  const accountHolder = holderKind < 0.45 && trusts.length ? pick(r, trusts)
    : holderKind < 0.85 ? `${pick(r, TRUST_A)} ${pick(r, TRUST_B)}` : pick(r, PEOPLE);
  return {
    bank: bank.name, bankCode: bank.code, branch, city, ifsc: ifscFor(r, bank.code), fdrNumber: fdrNumberFor(r, bank.code),
    accountHolder, amount, issueDate, maturityDate: addTenure(issueDate, tenure), tenure, interestRate: rate,
    maturityValue: maturityValue(amount, rate, tenureDays(issueDate, tenure)), ...extras(r),
  };
}

function yearsBetween(a: string, b: string): Tenure {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  if (m1 === m2 && d1 === d2 && y2 > y1) return { years: y2 - y1, months: 0, days: 0 };
  return { years: 0, months: 0, days: Math.round((Date.parse(b) - Date.parse(a)) / 86400000) };
}

/** Document fields for an FDR already in the registry (used to print realistic samples / duplicates). */
export function fieldsFromRecord(f: FDR, inst: Institution | undefined, r: Rng): DocFields {
  const bank = BANK_BY_NAME.get(f.bank) ?? BANKS[0];
  const tenure = yearsBetween(f.issueDate, f.maturityDate);
  return {
    bank: f.bank, bankCode: bank.code, branch: f.branch, city: inst?.city ?? f.branch.split(' ')[0], ifsc: f.ifsc, fdrNumber: f.fdrNumber,
    accountHolder: f.accountHolder, amount: f.amount, issueDate: f.issueDate, maturityDate: f.maturityDate, tenure, interestRate: f.interestRate,
    maturityValue: maturityValue(f.amount, f.interestRate, tenureDays(f.issueDate, tenure)), ...extras(r),
  };
}
