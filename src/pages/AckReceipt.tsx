import { ArrowLeft, CheckCircle2, Copy, Download, ExternalLink, Printer, QrCode, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button, Card, Empty, FdrLink, PageHeader } from '../components/ui';
import { verifyAck, verifyUrl, type AckPayload } from '../lib/ack';
import { formatDate, formatDateTime, formatINR } from '../lib/format';
import { useStore } from '../store';

export default function AckReceipt({ id }: { id: string }) {
  const { acks } = useStore();
  const ack = acks.find((a) => a.id === id);
  const [qr, setQr] = useState<string | null>(null);
  const [payload, setPayload] = useState<AckPayload | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ack) return;
    void QRCode.toDataURL(verifyUrl(ack.token), { errorCorrectionLevel: 'L', margin: 2, width: 360, color: { dark: '#141a33', light: '#ffffff' } }).then(setQr);
    void verifyAck(ack.token).then((r) => { setValid(r.status === 'valid'); setPayload(r.status === 'malformed' ? null : r.payload); });
  }, [ack]);

  if (!ack) return <Empty>No acknowledgement “{id}”. <a href="#/registry" className="text-accent">Back to all FDRs</a></Empty>;

  const download = async () => {
    if (!payload || !qr) return;
    const blob = await renderReceiptPng(payload, qr);
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `${payload.ack}.png` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <a href={`#/twin/${ack.fdrId}`} className="no-print mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"><ArrowLeft size={15} /> Back to FDR</a>
      <div className="no-print"><PageHeader icon={QrCode} hue="teal" eyebrow="QR receipt" title={ack.id}
        description="Print or send this to the institution. Anyone can scan the QR to check it is genuine."
        actions={<>
          <Button icon={Printer} onClick={() => window.print()}>Print</Button>
          <Button icon={Download} onClick={() => void download()}>Download image</Button>
          <Button variant="primary" icon={ExternalLink} onClick={() => window.open(verifyUrl(ack.token), '_blank')}>Check it</Button>
        </>} /></div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="print-area relative overflow-hidden rounded-3xl border border-line bg-white p-0 text-[#141a33] shadow-[0_20px_45px_-25px_rgba(20,26,51,0.4)]">
          <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
            <div className="-rotate-[18deg] text-center text-[42px] font-extrabold uppercase leading-tight tracking-widest text-[#141a33]/[0.06]">Prototype<br />not an official document</div>
          </div>
          <div className="hero-gradient px-7 py-5 text-white">
            <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/80">FDR Sentinel X · Prototype</div>
            <div className="text-[22px] font-extrabold">Security Deposit Acknowledgement</div>
          </div>
          <div className="relative grid grid-cols-1 gap-6 p-7 sm:grid-cols-[1fr_200px]">
            {payload && (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-[13.5px] sm:grid-cols-2">
                {[
                  ['Acknowledgement', payload.ack], ['Issued', formatDateTime(payload.iat)],
                  ['Institution', payload.inst], ['AICTE ID', payload.aicteId],
                  ['Deposit holder', payload.holder], ['Bank', payload.bank],
                  ['FDR number', payload.no], ['IFSC', payload.ifsc],
                  ['Principal', formatINR(payload.amt)], ['Matures', formatDate(payload.mat)],
                  ['Issued by', payload.by], ['Record', payload.fdr],
                ].map(([k, v]) => (
                  <div key={k}><dt className="text-[11px] font-bold uppercase tracking-wider text-[#7a819c]">{k}</dt><dd className="tabular font-semibold">{v}</dd></div>
                ))}
              </dl>
            )}
            <div className="flex flex-col items-center gap-2">
              {qr ? <img src={qr} alt="Verification QR code" className="w-full max-w-[200px] rounded-xl border border-[#e6e9f5] p-1" /> : <div className="size-[200px] animate-pulse rounded-xl bg-[#f4f6fd]" />}
              <div className="text-center text-[11.5px] text-[#4a5272]">Scan to verify</div>
            </div>
          </div>
          <div className="relative border-t border-[#e6e9f5] px-7 py-4 text-[11.5px] leading-relaxed text-[#4a5272]">
            The QR holds these details with an ECDSA P-256 signature. Editing any detail invalidates it.
            Verification also shows the deposit's live status (e.g. if it was later closed at the bank).
            <strong> Prototype — not an official AICTE document; all data is synthetic.</strong>
          </div>
        </section>

        <div className="no-print space-y-6">
          <Card icon={ShieldCheck} hue="teal" title="Signature">
            {valid === null ? <p className="text-[13px] text-muted">Checking…</p> : valid
              ? <p className="flex items-center gap-2 text-[14px] font-semibold text-ink"><CheckCircle2 size={18} className="text-good" /> Valid — signed with key {payload?.kid}</p>
              : <p className="text-[14px] font-semibold text-critical">Signature invalid</p>}
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">Prototype key is bundled in the app so it works offline. In production the private key stays on AICTE's server (HSM); browsers only ever hold the public key.</p>
          </Card>
          <Card icon={QrCode} hue="violet" title="Share">
            <Button icon={Copy} onClick={() => { void navigator.clipboard?.writeText(verifyUrl(ack.token)); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}>{copied ? 'Copied' : 'Copy verification link'}</Button>
            <p className="mt-3 text-[12.5px] text-ink-2">Linked FDR: <FdrLink id={ack.fdrId} />. Scanning from a phone needs the app to be online (e.g. deployed on Vercel); on this computer, use “Verify a receipt” and upload the PNG.</p>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Draws the receipt as an image (for sharing/printing outside the app). The QR inside is what gets verified. */
async function renderReceiptPng(p: AckPayload, qrDataUrl: string): Promise<Blob> {
  const W = 1200, H = 760;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#3b45c9'); g.addColorStop(0.6, '#7c5cf6'); g.addColorStop(1, '#c056e0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 120);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 18px system-ui'; ctx.fillText('FDR SENTINEL X · PROTOTYPE', 50, 50);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px system-ui'; ctx.fillText('Security Deposit Acknowledgement', 50, 92);
  ctx.save(); ctx.translate(W / 2, H / 2 + 40); ctx.rotate(-0.3); ctx.fillStyle = 'rgba(20,26,51,0.06)'; ctx.font = 'bold 56px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('PROTOTYPE — NOT AN OFFICIAL DOCUMENT', 0, 0); ctx.restore();
  const rows: [string, string][] = [
    ['Acknowledgement', p.ack], ['Institution', p.inst], ['AICTE ID', p.aicteId], ['Deposit holder', p.holder], ['Bank', p.bank],
    ['FDR number', p.no], ['IFSC', p.ifsc], ['Principal', formatINR(p.amt)], ['Matures', formatDate(p.mat)], ['Issued', formatDateTime(p.iat)],
  ];
  rows.forEach(([k, v], i) => {
    const y = 175 + i * 50;
    ctx.fillStyle = '#7a819c'; ctx.font = 'bold 15px system-ui'; ctx.fillText(k.toUpperCase(), 50, y);
    ctx.fillStyle = '#141a33'; ctx.font = '600 22px system-ui'; ctx.fillText(v, 280, y);
  });
  const img = new Image();
  img.src = qrDataUrl;
  await img.decode();
  ctx.drawImage(img, 840, 170, 310, 310);
  ctx.fillStyle = '#4a5272'; ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Scan to verify', 995, 505); ctx.textAlign = 'left';
  ctx.fillStyle = '#4a5272'; ctx.font = '15px system-ui';
  ctx.fillText('Signed with ECDSA P-256. Editing any detail invalidates the QR. Prototype — synthetic data.', 50, H - 40);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}
