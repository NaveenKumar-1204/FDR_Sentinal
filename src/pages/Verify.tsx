// Public verification page — no sign-in. Anyone (bank, inspector, auditor) can scan the receipt's QR,
// upload a photo of it, or paste its link, and see whether it is genuine and whether the deposit is still secured.
import jsQR from 'jsqr';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, ClipboardPaste, FlaskConical, ImageUp, Lock, OctagonAlert, ShieldCheck, ShieldX, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import { Badge, Button, Card, LienBadge, LifecycleBadge, cx } from '../components/ui';
import { extractToken, tamperToken, verifyAck, type VerifyResult } from '../lib/ack';
import { formatDate, formatDateTime, formatINR } from '../lib/format';
import { isHeld } from '../lib/lifecycle';
import { useStore } from '../store';

export default function VerifyPage({ token }: { token?: string }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="brand-gradient grid size-10 place-items-center rounded-2xl text-white"><ShieldCheck size={20} /></span>
          <div className="leading-tight">
            <div className="text-[16px] font-extrabold tracking-tight text-ink">Verify an FDR acknowledgement</div>
            <div className="text-[11.5px] font-medium text-muted">FDR Sentinel X · public check, no sign-in</div>
          </div>
          <div className="ml-auto flex items-center gap-2"><a href="#/" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-accent hover:text-accent"><ArrowLeft size={15} /> Back to dashboard</a><ThemeToggle /></div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
        <div key={token ?? 'scan'} className="page-enter">{token ? <Result token={token} /> : <Scanner />}</div>
      </main>
    </div>
  );
}

function go(token: string) { window.location.hash = `#/verify/${token}`; }

function Scanner() {
  const [mode, setMode] = useState<'camera' | 'image' | 'paste'>('image');
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (mode !== 'camera') return;
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = () => {
          const v = video.current;
          if (!v || stopped) return;
          if (v.videoWidth) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            const t = code && extractToken(code.data);
            if (t) { go(t); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError('No camera available here. Upload a photo of the receipt instead.');
        setMode('image');
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [mode]);

  const fromImage = async (file?: File) => {
    if (!file) return;
    setError(null);
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(file); } catch { setError('That file is not an image this browser can open.'); return; }
    // Try the full image, then a downscaled copy (large photos can hide the QR's quiet zone).
    for (const scale of [1, 0.5, 0.25]) {
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      const t = code && extractToken(code.data);
      if (t) { go(t); return; }
    }
    setError('No FDR Sentinel QR code found in that image.');
  };

  const fromText = (e: FormEvent) => {
    e.preventDefault();
    const t = extractToken(text);
    if (t) go(t); else setError('That does not look like a verification link.');
  };

  return (
    <Card icon={ShieldCheck} hue="indigo" title="Check a receipt" subtitle="The QR code holds the receipt's details and a digital signature.">
      <div className="mb-4 inline-flex rounded-xl border border-line-strong p-0.5 text-[13px] font-semibold">
        {([['image', 'Upload photo', ImageUp], ['camera', 'Use camera', Camera], ['paste', 'Paste link', ClipboardPaste]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => { setError(null); setMode(k); }} className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5', mode === k ? 'brand-gradient text-white' : 'text-ink-2')}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 flex items-center gap-2 text-[13px] text-critical"><AlertTriangle size={15} /> {error}</p>}
      {mode === 'camera' && <video ref={video} muted playsInline className="aspect-video w-full rounded-2xl bg-black object-cover" />}
      {mode === 'image' && (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong bg-subtle px-6 py-10 text-center hover:border-accent">
          <ImageUp size={28} className="mb-2 text-accent" />
          <span className="text-[14px] font-bold text-ink">Choose a photo or the downloaded receipt PNG</span>
          <span className="mt-1 text-[12.5px] text-muted">Decoded on this device</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => void fromImage(e.target.files?.[0])} />
        </label>
      )}
      {mode === 'paste' && (
        <form onSubmit={fromText} className="flex flex-wrap gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…/#/verify/…" className="min-w-64 flex-1 rounded-xl border border-line bg-subtle px-3 py-2.5 text-[13.5px] text-ink focus:border-accent focus:outline-none" />
          <Button type="submit" variant="primary">Verify</Button>
        </form>
      )}
    </Card>
  );
}

function Result({ token }: { token: string }) {
  const { fdrById, lifecycle, institutionById } = useStore();
  const [res, setRes] = useState<VerifyResult | null>(null);
  useEffect(() => { void verifyAck(token).then(setRes); }, [token]);
  if (!res) return <p className="text-[14px] text-muted">Verifying…</p>;

  const p = res.status === 'malformed' ? null : res.payload;
  const f = p ? fdrById.get(p.fdr) : undefined;
  const lc = f ? lifecycle.get(f.id) : undefined;
  const stillSecured = !!(f && lc && isHeld(lc.status) && f.lien === 'confirmed' && f.bankVerification === 'verified');

  const head = res.status === 'valid'
    ? { icon: ShieldCheck, title: 'Genuine acknowledgement', text: 'The signature matches — these details are exactly as issued.', cls: 'tint-good border-good/40', ic: 'text-good' }
    : res.status === 'tampered'
      ? { icon: ShieldX, title: 'Tampered or forged', text: 'The details do not match the signature. Do not rely on this receipt.', cls: 'tint-bad border-critical/40', ic: 'text-critical' }
      : { icon: XCircle, title: 'Unreadable', text: 'This is not a valid FDR Sentinel verification code.', cls: 'tint-bad border-critical/40', ic: 'text-critical' };

  return (
    <>
      <a href="#/verify" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"><ArrowLeft size={15} /> Verify another</a>
      <div className={cx('mb-6 flex items-start gap-4 rounded-3xl border p-5', head.cls)}>
        <head.icon size={40} className={cx('shrink-0', head.ic)} />
        <div>
          <div className="text-[22px] font-extrabold tracking-tight text-ink">{head.title}</div>
          <div className="mt-1 text-[14px] text-ink-2">{head.text}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {p && (
          <Card icon={CheckCircle2} hue={res.status === 'valid' ? 'teal' : 'rose'} title={res.status === 'valid' ? 'Signed details' : 'Details claimed by the QR'}>
            <dl className="space-y-2 text-[13.5px]">
              {[['Acknowledgement', p.ack], ['Institution', `${p.inst} (${p.aicteId})`], ['Holder', p.holder], ['Bank', `${p.bank} · ${p.ifsc}`], ['FDR number', p.no],
                ['Principal', formatINR(p.amt)], ['Matures', formatDate(p.mat)], ['Issued', `${formatDateTime(p.iat)} by ${p.by}`]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="tabular text-right font-semibold text-ink">{v}</dd></div>
              ))}
            </dl>
          </Card>
        )}
        {res.status === 'valid' && (
          <Card icon={Lock} hue={stillSecured ? 'teal' : 'rose'} title="Live status" subtitle="From the registry right now — a genuine receipt can still describe a deposit that has since changed.">
            {!f || !lc ? <p className="text-[13px] text-ink-2">This record is not in the registry visible on this device, so live status can't be shown. The signature above is still valid.</p> : (
              <>
                <div className={cx('mb-3 flex items-center gap-2 text-[15px] font-bold', stillSecured ? 'text-good' : 'text-critical')}>
                  {stillSecured ? <CheckCircle2 size={18} /> : <OctagonAlert size={18} />}
                  {stillSecured ? 'Deposit is still held and locked for AICTE' : lc.status === 'closed' ? 'Deposit has been closed at the bank — receipt no longer valid' : 'Deposit is no longer fully secured'}
                </div>
                <div className="flex flex-wrap gap-2">
                  <LifecycleBadge status={lc.status} />
                  <LienBadge lien={f.lien} />
                  {f.closedAt && <Badge tone="critical">Closed {formatDate(f.closedAt.slice(0, 10))}</Badge>}
                </div>
                <p className="mt-3 text-[12.5px] text-muted">Institution: {institutionById.get(f.institutionId)?.name}</p>
              </>
            )}
          </Card>
        )}
      </div>

      {res.status === 'valid' && (
        <Card className="mt-6" icon={FlaskConical} hue="violet" title="Try to fake it" subtitle="Change one detail in the QR (as a forger would) without the signing key.">
          <Button icon={FlaskConical} onClick={() => go(tamperToken(token, (x) => ({ ...x, amt: x.amt * 10 })))}>Make the amount 10× and re-check</Button>
        </Card>
      )}
    </>
  );
}
