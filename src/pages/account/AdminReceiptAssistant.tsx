import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { CollapsiblePanel } from '../../components/CollapsiblePanel';
import { ApiError, api } from '../../lib/api';
import { faNumber } from '../../lib/format';

interface StatementRow {
  line: number;
  amountTomans: number | null;
  trackingNumber: string | null;
  reference: string | null;
  senderLast4: string | null;
  raw: string;
}

type Verdict = 'confirmed' | 'suspicious' | 'missing';

interface Assessment {
  authority: string;
  kind: 'program' | 'subscription';
  studentName: string;
  verdict: Verdict;
  reason: string;
  matchedLine: number | null;
  matchedAmountTomans: number | null;
  source: 'ai' | 'rules';
}

interface Summary {
  confirmed: number;
  suspicious: number;
  missing: number;
  total: number;
}

const VERDICT_LABELS: Record<Verdict, string> = {
  confirmed: 'قطعی',
  suspicious: 'مشکوک',
  missing: 'ناموجود',
};

/**
 * The receipt assistant of the manager.
 *
 * The manager pastes the statement of the club's account, the assistant compares it with
 * the receipts that wait for a decision and says which transfer belongs to which
 * receipt. The manager confirms or rejects; the assistant never decides.
 */
export function AdminReceiptAssistant() {
  const [statement, setStatement] = useState('');
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = useCallback(() => {
    setRows([]);
    setAssessments([]);
    setSummary(null);
    setNotice(null);
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  async function analyse() {
    if (!statement.trim()) {
      setError('صورت‌حساب بانک را وارد کنید.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ rows: StatementRow[]; assessments: Assessment[]; summary: Summary }>(
        'POST',
        '/admin/receipt-assistant',
        { statement }
      );
      // A half answer must not break the panel.
      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setAssessments(Array.isArray(result?.assessments) ? result.assessments : []);
      setSummary(result?.summary ?? null);
      if (!result?.assessments?.length) {
        setNotice('رسیدِ در انتظار بررسی پیدا نشد؛ شاید همه قبلاً بررسی شده‌اند.');
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'بررسی صورت‌حساب ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }

  async function review(authority: string, action: 'confirm' | 'reject') {
    setBusy(authority);
    setError(null);
    setNotice(null);
    try {
      await api('POST', '/admin/card-transfer/review', { authority, action });
      setNotice(action === 'confirm' ? 'رسید تأیید شد و شاگرد باخبر شد.' : 'رسید رد شد.');
      // The queue changed, so the list of the waiting receipts is read again.
      await analyse();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ثبت تصمیم ممکن نشد.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <CollapsiblePanel
      title="دستیار بررسی رسید"
      subtitle="صورت‌حساب بانک را بچسبان تا با رسیدها تطبیق داده شود"
      icon={<Sparkles size={18} />}
      headingId="admin-receipt-assistant-heading"
    >
      <p className="account-muted">
        صورت‌حسابِ حسابِ باشگاه را اینجا بچسبان؛ دستیار آن را با رسیدهای در انتظار تطبیق می‌دهد و
        برای هر رسید می‌گوید قطعی است، مشکوک است یا در صورت‌حساب نیست. تصمیم نهایی با شماست.
      </p>

      <label className="field-control">
        <span>صورت‌حساب بانک (متن یا CSV)</span>
        <textarea
          dir="rtl"
          rows={5}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          placeholder={'مثال:\n۱۴۰۴/۰۸/۱۲  ۹۹۱۲۳  ۶۰۳۷۹۹۹۱۲۳۴۵۶۷  MT-AB12CD'}
        />
      </label>

      <button type="button" className="button button--primary" disabled={loading} onClick={() => void analyse()}>
        {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {loading ? 'در حال بررسی…' : 'بررسی با دستیار'}
      </button>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      {summary && summary.total > 0 && (
        <div className="admin-receipt-assistant__summary">
          <span className="badge badge--ok">قطعی: {faNumber(summary.confirmed)}</span>
          <span className="badge badge--warn">مشکوک: {faNumber(summary.suspicious)}</span>
          <span className="badge">ناموجود: {faNumber(summary.missing)}</span>
        </div>
      )}

      {assessments.length > 0 && (
        <div className="admin-receipt-assistant__list">
          {assessments.map((item) => (
            <article key={item.authority} className={`admin-receipt-assistant__item is-${item.verdict}`}>
              <div>
                <strong>{item.studentName}</strong>
                <span className="account-muted">
                  {item.kind === 'subscription' ? 'اشتراک ماهانه' : 'برنامهٔ تمرینی'}
                </span>
                <span className={`admin-receipt-assistant__verdict is-${item.verdict}`}>
                  {VERDICT_LABELS[item.verdict]}
                  {item.source === 'ai' ? ' · دستیار' : ' · قاعده'}
                </span>
                <span className="account-muted">{item.reason}</span>
                {item.matchedLine !== null && (
                  <span className="account-muted">
                    سطر {faNumber(item.matchedLine)} صورت‌حساب
                    {item.matchedAmountTomans !== null ? ` · ${faNumber(item.matchedAmountTomans)} تومان` : ''}
                  </span>
                )}
              </div>
              <div className="admin-receipt-assistant__actions">
                <button
                  type="button"
                  className="button button--small button--primary"
                  disabled={busy === item.authority}
                  onClick={() => void review(item.authority, 'confirm')}
                >
                  {busy === item.authority ? <Loader2 size={14} className="spin" /> : <Check size={14} />} تأیید
                </button>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  disabled={busy === item.authority}
                  onClick={() => void review(item.authority, 'reject')}
                >
                  <X size={14} /> رد
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <details className="admin-receipt-assistant__rows">
          <summary>سطرهای خوانده‌شده از صورت‌حساب ({faNumber(rows.length)})</summary>
          <ul>
            {rows.map((row) => (
              <li key={row.line}>
                <code dir="ltr">{row.raw}</code>
                {row.amountTomans !== null && <span> · {faNumber(row.amountTomans)} تومان</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </CollapsiblePanel>
  );
}
