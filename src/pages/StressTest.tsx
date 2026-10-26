import { CheckCircle2, FlaskConical, Trash2, XCircle } from 'lucide-react';
import { Badge, Button, Card, FdrLink, PageHeader, SeverityBadge, cx } from '../components/ui';
import type { AlertType } from '../lib/alerts';
import { useStore } from '../store';

const CASES: { title: string; injected: string; expect: AlertType[] }[] = [
  { title: 'Duplicate claim', injected: 'Another institution submits an exact copy of an existing FDR.', expect: ['cross-duplicate'] },
  { title: 'Altered amount', injected: 'An institution re-uploads its own FDR with the amount raised by ₹25 lakh.', expect: ['conflicting-resubmission'] },
  { title: 'Overdue deposit', injected: 'An FDR that matured 20 days ago and was never renewed.', expect: ['lapsed'] },
  { title: 'Incomplete release', injected: 'A release request with 5 of 6 documents missing, on a deposit that is not locked for AICTE.', expect: ['release-incomplete', 'lien-not-marked'] },
];

export default function StressTestPage() {
  const { testCaseIds, alerts, injectTestCases, clearTestCases } = useStore();
  const batches = Math.floor(testCaseIds.length / CASES.length);
  const latest = testCaseIds.slice(-CASES.length);

  const results = latest.length === CASES.length ? CASES.map((c, i) => {
    const id = latest[i];
    const found = alerts.filter((a) => a.fdrId === id);
    const caught = c.expect.every((t) => found.some((a) => a.type === t));
    return { ...c, id, found, caught };
  }) : [];
  const caughtCount = results.filter((r) => r.caught).length;

  return (
    <>
      <PageHeader icon={FlaskConical} hue="violet" eyebrow="Demo" title="Demo test cases" description="Add some fake problem FDRs and watch the system catch each one. They are marked as demo and can be removed any time."
        actions={<>
          <Button variant="primary" icon={FlaskConical} onClick={() => void injectTestCases()}>Inject {CASES.length} test cases</Button>
          {testCaseIds.length > 0 && <Button icon={Trash2} onClick={clearTestCases}>Remove test records</Button>}
        </>} />

      {results.length === 0 ? (
        <Card icon={FlaskConical} hue="violet" title="What gets injected">
          <ul className="stagger grid grid-cols-1 gap-4 md:grid-cols-2">
            {CASES.map((c) => (
              <li key={c.title} className="tint-cool lift rounded-2xl border border-line p-4">
                <div className="text-[14px] font-semibold text-ink">{c.title}</div>
                <p className="mt-1 text-[13px] text-ink-2">{c.injected}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <>
          <div key={latest[0]} className={cx('page-enter mb-6 flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4', caughtCount === CASES.length ? 'tint-good border-good/30' : 'tint-bad border-critical/30')}>
            {caughtCount === CASES.length ? <CheckCircle2 className="text-good" size={22} /> : <XCircle className="text-critical" size={22} />}
            <div>
              <div className="text-[15px] font-semibold text-ink"><span className="tabular">{caughtCount}</span> of <span className="tabular">{CASES.length}</span> injected problems caught</div>
              <div className="text-[12.5px] text-muted">Latest batch{batches > 1 ? ` (${batches} batches injected)` : ''}. Every alert below was produced by the same rules used for real records.</div>
            </div>
          </div>
          <div key={latest.join()} className="stagger grid grid-cols-1 gap-6 lg:grid-cols-2">
            {results.map((r) => (
              <Card key={r.id} title={r.title} subtitle={r.injected}
                actions={r.caught ? <Badge tone="good" icon={CheckCircle2}>Caught</Badge> : <Badge tone="critical" icon={XCircle}>Missed</Badge>}>
                <p className="mb-3 text-[13px] text-ink-2">Test record <FdrLink id={r.id} /></p>
                <ul className="space-y-2">
                  {r.found.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <SeverityBadge severity={a.severity} />
                      <span className="text-ink">{a.title}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
