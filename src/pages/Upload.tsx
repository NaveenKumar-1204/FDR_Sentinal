import { AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, ChevronDown, Cpu, FileImage, FlaskConical, Loader2, Printer, RotateCcw, ScanLine, ShieldCheck, Sparkles, UploadCloud, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Badge, Button, Card, Empty, FdrLink, Meter, PageHeader, cx } from '../components/ui';
import evalReport from '../data/ocr-eval.json';
import type { FDR, OcrField } from '../data/types';
import { degrade, JPEG_QUALITY, type Quality } from '../lib/fdrdoc/augment';
import { fieldsFromRecord, mulberry32 } from '../lib/fdrdoc/fields';
import { docHeight, drawDocument, DOC_WIDTH, randomStyle, type TemplateId } from '../lib/fdrdoc/render';
import { formatINRShort, pct } from '../lib/format';
import { findMatches } from '../lib/mtdi';
import { BANKS } from '../lib/ocr/banks';
import { dHash, loadEngines, makeCanvas, readDocument, sha256Hex, thumbnail } from '../lib/ocr/browser';
import { MIN_TEXT_PX } from '../lib/ocr/pipeline';
import { FIELD_KEYS, FIELD_LABEL, type ExtractResult, type FieldKey } from '../lib/ocr/types';
import { textSimilarity } from '../lib/similarity';
import { useStore } from '../store';

interface Sample { file: string; title: string; note: string; quality: string; template: string; duplicateOf?: string }

type Stage = 'load' | 'prepare' | 'page' | 'reread' | 'done';
const STAGES: { key: Stage; label: string }[] = [
  { key: 'load', label: 'Opening the file' },
  { key: 'prepare', label: 'Cleaning up the image' },
  { key: 'page', label: 'Reading the text' },
  { key: 'reread', label: 'Double-checking the key numbers' },
  { key: 'done', label: 'Final checks' },
];

interface Review {
  fileName: string;
  fileHash: string;
  imageHash: string;
  thumb: string;
  prepared: string;
  preparedSize: { w: number; h: number };
  result: ExtractResult;
  textPx: number;
  ms: number;
  cropReads: number;
}

export default function UploadPage() {
  const { fdrs, institutions, addUpload, institutionById } = useStore();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [engineLoad, setEngineLoad] = useState(0);
  const [busy, setBusy] = useState<{ stage: Stage; detail?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}samples/samples.json`).then((r) => r.json()).then(setSamples).catch(() => setSamples([]));
    loadEngines(setEngineLoad).catch(() => setError('Could not start the OCR engine in this browser.'));
  }, []);

  const read = async (file: Blob & { type: string; name?: string }, name: string) => {
    setError(null); setReview(null);
    setBusy({ stage: 'load' });
    try {
      const knownHolders = institutions.map((i) => i.trustName);
      const [res, buf] = await Promise.all([
        readDocument(file, { knownHolders }, (stage, detail) => setBusy({ stage, detail })),
        file.arrayBuffer(),
      ]);
      const prepared = res.prepared as unknown as HTMLCanvasElement;
      setReview({
        fileName: name, fileHash: await sha256Hex(buf), imageHash: dHash(res.original), thumb: thumbnail(res.original),
        prepared: prepared.toDataURL('image/jpeg', 0.8), preparedSize: { w: prepared.width, h: prepared.height },
        result: res.result, textPx: res.textPx, ms: res.ms, cropReads: res.cropReads,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.');
    } finally {
      setBusy(null);
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!/^image\/|application\/pdf/.test(f.type) && !f.name.toLowerCase().endsWith('.pdf')) { setError('Please choose an image (JPG, PNG) or a PDF.'); return; }
    void read(f, f.name);
  };

  const useSample = async (s: Sample) => {
    const blob = await (await fetch(`${import.meta.env.BASE_URL}samples/${s.file}`)).blob();
    void read(Object.assign(blob, { name: s.file }), s.file);
  };

  return (
    <>
      <PageHeader icon={ScanLine} hue="sky" eyebrow="Step 1" title="Add an FDR"
        description="Upload a scan or phone photo. We fill in the details for you. Anything we are not sure about is marked yellow for you to check." />

      {error && <div className="mb-5 flex items-start gap-2 rounded-xl border border-critical/30 bg-critical-soft px-4 py-3 text-[13.5px] text-ink"><XCircle size={17} className="mt-0.5 shrink-0 text-critical" />{error}</div>}

      {busy ? <Progress stage={busy.stage} engineLoad={engineLoad} />
        : review ? <ReviewPanel review={review} onReset={() => setReview(null)} fdrs={fdrs} institutions={institutions} institutionById={institutionById} addUpload={addUpload} />
        : (
          <div className="stagger mx-auto max-w-4xl space-y-6">
            <div className="space-y-6">
              <Card icon={UploadCloud} hue="sky" title="Upload the FDR" subtitle="A photo, scan or PDF.">
                <div
                  onDragOver={(e: DragEvent) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e: DragEvent) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
                  onClick={() => fileInput.current?.click()}
                  role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click(); }}
                  className={cx('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all',
                    dragging ? 'scale-[1.01] border-accent bg-accent-soft' : 'border-line-strong bg-subtle hover:border-accent hover:bg-accent-soft/50')}>
                  <span className="brand-gradient mb-4 grid size-14 place-items-center rounded-2xl text-white shadow-lg"><UploadCloud size={26} /></span>
                  <div className="text-[15px] font-bold text-ink">Drop the FDR here, or click to choose</div>
                  <div className="mt-1 text-[13px] text-muted">JPG, PNG or PDF · stays on this computer</div>
                  <div className="mt-3 text-[12px] text-muted">{engineLoad < 1 ? `Getting ready… ${Math.round(engineLoad * 100)}%` : 'Ready'}</div>
                  <input ref={fileInput} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
                </div>
              </Card>

              <Card icon={FileImage} hue="violet" title="No FDR to hand? Try a sample" subtitle="Made-up FDRs in different bank layouts.">
                {samples.length === 0 ? <Empty>Samples not found — run <code className="font-mono">npm run ocr:samples</code>.</Empty> : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {samples.map((s) => (
                      <button key={s.file} type="button" onClick={() => void useSample(s)}
                        className="lift group overflow-hidden rounded-xl border border-line bg-surface text-left">
                        <div className="h-28 overflow-hidden bg-subtle"><img src={`${import.meta.env.BASE_URL}samples/${s.file}`} alt="" className="h-full w-full object-cover object-top transition-transform group-hover:scale-105" loading="lazy" /></div>
                        <div className="p-3">
                          <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink">{s.duplicateOf && <AlertTriangle size={14} className="text-serious" />}{s.title}</div>
                          <div className="mt-0.5 text-[12px] text-muted">{s.note}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>

            </div>
            <details className="group">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
                <BadgeCheck size={16} className="text-accent" /> How accurate is it? · demo tools <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <AccuracyPanel />
                <PrintScan fdrs={fdrs} institutionById={institutionById} onScan={(blob, name) => void read(blob, name)} />
              </div>
            </details>
          </div>
        )}
    </>
  );
}

function Progress({ stage, engineLoad }: { stage: Stage; engineLoad: number }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <Card icon={Cpu} hue="sky" title="Reading your FDR…" subtitle="This takes a few seconds.">
      <ol className="space-y-3">
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 text-[14px]">
            {i < idx ? <CheckCircle2 size={19} className="text-good" /> : i === idx ? <Loader2 size={19} className="animate-spin text-accent" /> : <span className="size-[19px] rounded-full border-2 border-line-strong" />}
            <span className={i <= idx ? 'font-semibold text-ink' : 'text-muted'}>{s.label}</span>
                        {i === idx && s.key === 'load' && engineLoad < 1 && <span className="text-[12.5px] text-muted">— engine {Math.round(engineLoad * 100)}%</span>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

const TO_OCR_FIELD: Partial<Record<FieldKey, OcrField>> = {
  fdrNumber: 'fdrNumber', bank: 'bank', branch: 'branch', ifsc: 'ifsc', accountHolder: 'accountHolder', amount: 'amount', issueDate: 'issueDate', maturityDate: 'maturityDate',
};

function ReviewPanel({ review, onReset, fdrs, institutions, institutionById, addUpload }: {
  review: Review; onReset: () => void; fdrs: FDR[]; institutions: ReturnType<typeof useStore>['institutions'];
  institutionById: ReturnType<typeof useStore>['institutionById']; addUpload: ReturnType<typeof useStore>['addUpload'];
}) {
  const r = review.result;
  const [values, setValues] = useState<Record<FieldKey, string>>(() => Object.fromEntries(FIELD_KEYS.map((k) => [k, r.fields[k].value ?? ''])) as Record<FieldKey, string>);
  const [confirmed, setConfirmed] = useState<Record<FieldKey, boolean>>(() => Object.fromEntries(FIELD_KEYS.map((k) => [k, !r.fields[k].flagged])) as Record<FieldKey, boolean>);
  const [hover, setHover] = useState<FieldKey | null>(null);
  const [open, setOpen] = useState<FieldKey | null>(null);
  const [view, setView] = useState<'cleaned' | 'original'>('cleaned');
  const autoInst = useMemo(() => institutions.map((i) => ({ i, s: textSimilarity(values.accountHolder, i.trustName) })).sort((a, b) => b.s - a.s)[0], [institutions, values.accountHolder]);
  const [institutionId, setInstitutionId] = useState(autoInst && autoInst.s >= 0.8 ? autoInst.i.id : '');

  const auto = FIELD_KEYS.filter((k) => !r.fields[k].flagged).length;
  const pendingChecks = FIELD_KEYS.filter((k) => !confirmed[k]);
  const missing = FIELD_KEYS.filter((k) => !values[k].trim());

  const candidate: FDR = useMemo(() => {
    const amount = Number(values.amount) || 0;
    return {
      id: 'UPLOAD-PREVIEW', fdrNumber: values.fdrNumber.trim().toUpperCase(), institutionId: institutionId || 'unknown',
      bank: values.bank, branch: values.branch, ifsc: values.ifsc.trim().toUpperCase(), accountHolder: values.accountHolder, amount,
      issueDate: values.issueDate, maturityDate: values.maturityDate, interestRate: Number(values.interestRate) || 0,
      lien: 'pending', bankVerification: 'pending',
      ocrConfidence: Object.fromEntries((Object.values(TO_OCR_FIELD) as OcrField[]).map((f) => [f, 1])) as Record<OcrField, number>,
      fileHash: review.fileHash, imageHash: review.imageHash, uploadedAt: new Date().toISOString(), isUploaded: true,
    };
  }, [values, institutionId, review.fileHash, review.imageHash]);
  const dupes = useMemo(() => findMatches([...fdrs, candidate]).filter((m) => m.a === candidate.id || m.b === candidate.id), [fdrs, candidate]);

  const save = () => {
    const seq = fdrs.filter((f) => f.isUploaded).length + 1;
    const id = `UPL-${String(seq).padStart(4, '0')}`;
    const ocrConfidence = Object.fromEntries((Object.entries(TO_OCR_FIELD) as [FieldKey, OcrField][]).map(([k, f]) => {
      const officerChecked = r.fields[k].flagged || values[k] !== (r.fields[k].value ?? '');
      return [f, officerChecked ? 1 : r.fields[k].confidence];
    })) as Record<OcrField, number>;
    const edited = FIELD_KEYS.filter((k) => values[k] !== (r.fields[k].value ?? ''));
    addUpload({ ...candidate, id, ocrConfidence }, review.thumb, [
      { detail: `${review.fileName} · SHA-256 ${review.fileHash.slice(0, 12)}…` },
      { detail: `${auto} of ${FIELD_KEYS.length} fields confirmed automatically · ${FIELD_KEYS.length - auto} checked by officer${edited.length ? ` (corrected: ${edited.map((k) => FIELD_LABEL[k]).join(', ')})` : ''} · ${review.cropReads} re-reads · ${(review.ms / 1000).toFixed(1)}s` },
    ]);
    window.location.hash = `#/twin/${id}`;
  };

  const boxStyle = (k: FieldKey) => {
    const b = r.fields[k].bbox ?? (r.valueBoxes[k] as typeof r.fields[FieldKey]['bbox']);
    if (!b) return null;
    const { w, h } = review.preparedSize;
    return { left: `${(b.x0 / w) * 100}%`, top: `${(b.y0 / h) * 100}%`, width: `${((b.x1 - b.x0) / w) * 100}%`, height: `${((b.y1 - b.y0) / h) * 100}%` };
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
        <span className="brand-gradient grid size-10 place-items-center rounded-xl text-white"><Sparkles size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">{auto === FIELD_KEYS.length ? 'All details filled in. Please take a quick look, then save.' : <>We filled in <span className="tabular">{auto}</span> of <span className="tabular">{FIELD_KEYS.length}</span> details. Please check the <span className="tabular">{FIELD_KEYS.length - auto}</span> yellow ones.</>}</div>
          <div className="text-[12.5px] text-muted">{review.fileName} · {(review.ms / 1000).toFixed(1)}s</div>
        </div>
        {review.textPx < MIN_TEXT_PX && <Badge tone="warn" icon={AlertTriangle}>Blurry image: check the numbers</Badge>}
        <Button variant="ghost" icon={RotateCcw} onClick={onReset}>Read another</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_1fr]">
        <Card icon={FileImage} hue="violet" title="Your scan" subtitle="Point at a detail to see where we read it."
          actions={<div className="inline-flex rounded-lg border border-line-strong p-0.5 text-[12.5px] font-semibold">
            {(['cleaned', 'original'] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cx('rounded-md px-2.5 py-1 capitalize', view === v ? 'brand-gradient text-white' : 'text-ink-2')}>{v}</button>)}
          </div>} bodyClassName="p-3">
          <div className="relative overflow-hidden rounded-xl border border-line bg-white">
            <img src={view === 'cleaned' ? review.prepared : review.thumb} alt="Uploaded FDR" className="block w-full" />
            {view === 'cleaned' && FIELD_KEYS.map((k) => {
              const st = boxStyle(k);
              if (!st) return null;
              const f = r.fields[k];
              const ok = confirmed[k];
              return (
                <div key={k} style={st} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}
                  className={cx('absolute rounded-[4px] border-2 transition-all', ok ? 'border-good/80 bg-good/10' : 'border-warn bg-warn/15',
                    hover === k && 'z-10 scale-[1.03] shadow-[0_0_0_4px_rgba(79,95,240,0.35)]')}
                  title={`${FIELD_LABEL[k]}: ${f.display}`} />
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card icon={BadgeCheck} hue="teal" title="Details we read" subtitle="Green = sure. Yellow = compare with the scan, fix if needed, then tick." bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {FIELD_KEYS.map((k) => {
                const f = r.fields[k];
                const edited = values[k] !== (f.value ?? '');
                const ok = confirmed[k];
                return (
                  <li key={k} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} className={cx('px-4 py-3 transition-colors', hover === k && 'bg-subtle')}>
                    <div className="flex items-center gap-2">
                      {ok ? <CheckCircle2 size={16} className="shrink-0 text-good" /> : <AlertTriangle size={16} className="shrink-0 text-warn-ink" />}
                      <span className="w-32 shrink-0 text-[12.5px] font-semibold text-ink-2">{FIELD_LABEL[k]}</span>
                      <FieldInput k={k} value={values[k]} onChange={(v) => { setValues((s) => ({ ...s, [k]: v })); if (f.flagged) setConfirmed((c) => ({ ...c, [k]: true })); }} />
                      <button type="button" onClick={() => setOpen(open === k ? null : k)} aria-label="Show checks" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink">
                        <ChevronDown size={16} className={cx('transition-transform', open === k && 'rotate-180')} />
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 pl-6">
                      <div className="min-w-0 flex-1 text-[12px] text-muted">{f.value === null ? 'Not found. Please type it in.' : ok ? 'Checked' : 'Please check this one'}</div>
                      {f.flagged && !edited && (
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-ink">
                          <input type="checkbox" checked={confirmed[k]} onChange={(e) => setConfirmed((c) => ({ ...c, [k]: e.target.checked }))} className="size-4 accent-[var(--color-accent)]" />
                          Looks right
                        </label>
                      )}
                      {edited && <Badge tone="accent">You changed this</Badge>}
                    </div>
                    {open === k && (
                      <ul className="mt-2 space-y-1 pl-6 text-[12.5px]">
                        {f.checks.length === 0 && <li className="text-muted">No extra checks for this field.</li>}
                        {f.checks.map((c, i) => <li key={i} className="flex items-start gap-1.5">{c.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-good" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-critical" />}<span className="text-ink-2">{c.text}</span></li>)}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card icon={ShieldCheck} hue="rose" title="Save">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">Institution</span>
              <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} className="w-full rounded-xl border border-line bg-subtle px-3 py-2.5 text-[13.5px] text-ink focus:border-accent focus:outline-none">
                <option value="">Choose the institution…</option>
                {institutions.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.trustName}</option>)}
              </select>
              {autoInst && autoInst.s >= 0.8 && institutionId === autoInst.i.id && <span className="mt-1 block text-[12px] text-good">Matched from the account holder's trust name</span>}
            </label>

            <div className="mt-4">
              <div className="mb-2 text-[12.5px] font-semibold text-ink-2">Is it already in the system?</div>
              {dupes.length === 0 ? (
                <p className="flex items-center gap-1.5 text-[13px] text-ink-2"><CheckCircle2 size={15} className="text-good" /> No. This is a new FDR.</p>
              ) : dupes.map((m) => {
                const other = m.a === candidate.id ? m.b : m.a;
                const of = fdrs.find((x) => x.id === other)!;
                return (
                  <div key={other} className="mb-2 rounded-xl border border-critical/30 bg-critical-soft px-3 py-2.5 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-ink"><AlertTriangle size={15} className="text-critical" /> {m.level === 'strong' ? 'Looks like a copy of' : 'Similar to'} <FdrLink id={other} /></div>
                    <div className="mt-0.5 text-ink-2">{institutionById.get(of.institutionId)?.name} · {formatINRShort(of.amount)} · matching {m.matched.join(', ') || '—'}</div>
                  </div>
                );
              })}
            </div>

            {(pendingChecks.length > 0 || missing.length > 0 || !institutionId) && (
              <ul className="mt-4 space-y-1 text-[12.5px] text-ink-2">
                {pendingChecks.length > 0 && <li className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn-ink" />Check: {pendingChecks.map((k) => FIELD_LABEL[k]).join(', ')}</li>}
                {missing.length > 0 && <li className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn-ink" />Fill in: {missing.map((k) => FIELD_LABEL[k]).join(', ')}</li>}
                {!institutionId && <li className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn-ink" />Choose the institution</li>}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" icon={ArrowRight} disabled={pendingChecks.length > 0 || missing.length > 0 || !institutionId} onClick={save}>Save FDR</Button>
              <Button variant="ghost" icon={RotateCcw} onClick={onReset}>Discard</Button>
            </div>
            <p className="mt-3 text-[12px] text-muted">After saving, we ask the bank to confirm the FDR and lock it for AICTE.</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function FieldInput({ k, value, onChange }: { k: FieldKey; value: string; onChange: (v: string) => void }) {
  const cls = 'tabular min-w-0 flex-1 rounded-lg border border-line bg-subtle px-2.5 py-1.5 text-[13.5px] font-semibold text-ink focus:border-accent focus:bg-surface focus:outline-none';
  if (k === 'bank') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">—</option>
        {BANKS.map((b) => <option key={b.code} value={b.name}>{b.name}</option>)}
      </select>
    );
  }
  if (k === 'issueDate' || k === 'maturityDate') return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />;
  if (k === 'amount' || k === 'interestRate') return <input type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />;
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />;
}

/** Renders a realistic scan of any registry FDR in the browser — handy for showing duplicate detection live. */
function PrintScan({ fdrs, institutionById, onScan }: { fdrs: FDR[]; institutionById: ReturnType<typeof useStore>['institutionById']; onScan: (b: Blob & { name: string; type: string }, name: string) => void }) {
  const options = fdrs.filter((f) => !f.isTestCase).slice(0, 80);
  const [id, setId] = useState(options[0]?.id ?? '');
  const [quality, setQuality] = useState<Quality>('phone');
  const [template, setTemplate] = useState<TemplateId>('ledger');
  const go = () => {
    const f = fdrs.find((x) => x.id === id);
    if (!f) return;
    const r = mulberry32(Date.now() % 100000);
    const fields = fieldsFromRecord(f, institutionById.get(f.institutionId), r);
    const style = randomStyle(r, template);
    const measure = makeCanvas(10, 10).getContext('2d')!;
    const doc = makeCanvas(DOC_WIDTH, docHeight(measure, fields, style));
    drawDocument(doc.getContext('2d')!, fields, style, r);
    const img = degrade(doc, quality, r, makeCanvas) as unknown as HTMLCanvasElement;
    img.toBlob((b) => { if (b) onScan(Object.assign(b, { name: `${f.id}-${template}-${quality}.jpg` }), `${f.id} (${template}, ${quality})`); }, 'image/jpeg', JPEG_QUALITY[quality] / 100);
  };
  return (
    <Card icon={Printer} hue="amber" title="Print a scan of an existing FDR" subtitle="Creates a synthetic scan of a registry record, then reads it — the duplicate check should catch it.">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1"><span className="mb-1 block text-[12px] font-semibold text-ink-2">FDR</span>
          <select value={id} onChange={(e) => setId(e.target.value)} className="w-full rounded-xl border border-line bg-subtle px-3 py-2 text-[13px] text-ink">
            {options.map((f) => <option key={f.id} value={f.id}>{f.id} · {f.bank} · {formatINRShort(f.amount)}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-[12px] font-semibold text-ink-2">Layout</span>
          <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)} className="rounded-xl border border-line bg-subtle px-3 py-2 text-[13px] text-ink">
            {(['ledger', 'certificate', 'modern', 'typewriter'] as const).map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-[12px] font-semibold text-ink-2">Capture</span>
          <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className="rounded-xl border border-line bg-subtle px-3 py-2 text-[13px] text-ink">
            <option value="clean">Clean PDF</option><option value="scan">Office scan</option><option value="phone">Phone photo</option><option value="lowres">Low-res (stress)</option>
          </select>
        </label>
        <Button variant="primary" icon={ScanLine} onClick={go}>Print &amp; read</Button>
      </div>
    </Card>
  );
}

function AccuracyPanel() {
  const e = evalReport as unknown as {
    documents: number; overall: { accuracy: number; autoAcceptPrecision: number; flagRate: number; silentErrors: number; fields: number };
    byQuality: Record<string, { accuracy: number; flagRate: number; documents: number }>;
    byField: Record<string, { accuracy: number }>; meanMsPerDocument: number; generatedAt: string;
  };
  const tiers: [string, string][] = [['clean', 'Clean / PDF'], ['scan', 'Office scan'], ['phone', 'Phone photo'], ['lowres', 'Low-res (stress)']];
  return (
    <div className="space-y-6">
      <Card icon={BadgeCheck} hue="teal" title="Measured accuracy" subtitle={`Held-out test: ${e.documents} synthetic FDR scans the reader never saw during tuning.`}>
        <div className="rounded-2xl p-4 tint-good">
          <div className="text-[12px] font-bold uppercase tracking-wider text-ink-2">When it fills a field on its own</div>
          <div className="tabular mt-1 text-[34px] font-extrabold leading-none text-ink">{pct(e.overall.autoAcceptPrecision)}</div>
          <div className="mt-1 text-[12.5px] text-ink-2">are correct ({e.overall.silentErrors} wrong out of {e.overall.fields} fields). Everything uncertain is flagged instead.</div>
        </div>
        <div className="mt-4 text-[12px] font-bold uppercase tracking-wider text-muted">Fields read correctly</div>
        <ul className="mt-2 space-y-2.5">
          {tiers.map(([k, label]) => e.byQuality[k] && (
            <li key={k}>
              <div className="flex justify-between text-[13px]"><span className="text-ink-2">{label}</span><span className="tabular font-bold text-ink">{pct(e.byQuality[k].accuracy)}</span></div>
              <div className="mt-1"><Meter value={e.byQuality[k].accuracy} label={label} /></div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">Synthetic documents only — accuracy on real bank receipts must be measured on real scans before production. Measured {new Date(e.generatedAt).toLocaleDateString('en-IN')}.</p>
      </Card>
      <Card icon={FlaskConical} hue="violet" title="How it stays honest">
        <ul className="space-y-2 text-[13px] text-ink-2">
          {['Cleans the image: shadows, speckle, tilt, table lines, faint watermarks',
            'Reads the page, then re-reads each key value 3 more ways (two scales + an independent legacy engine) and votes',
            'Figures must match the amount in words',
            'Deposit date + period must equal the maturity date',
            'Principal × rate × period must reproduce the printed maturity value',
            'IFSC bank code must match the bank name; FDR number length must match the bank',
            'Look-alike characters (S/5, O/0, B/8) in codes are never trusted blindly',
            'Too-small text → digits are always sent for human review'].map((t) => (
            <li key={t} className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-good" />{t}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
