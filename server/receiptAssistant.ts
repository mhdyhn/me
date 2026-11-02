import { askAi, aiConfig, type AiConfig } from './ai.ts';

/**
 * The receipt assistant.
 *
 * The manager of the club looks at the bank account of the club and sees which transfers
 * came in. Matching those transfers with the receipts the students sent is the boring
 * half of the job, so the assistant does it: the manager pastes the statement of the
 * account (plain text or CSV), the assistant reads the rows, compares them with the
 * receipts that wait for a decision and says for every receipt what it thinks:
 *
 * - «قطعی» the transfer is in the statement and belongs to this receipt.
 * - «مشکوک» something is close but does not add up, so a human must look.
 * - «ناموجود» no transfer in the statement belongs to this receipt.
 *
 * The assistant never decides anything by itself. It prepares the queue and the
 * reasons, and the manager confirms or rejects with one tap, exactly like before.
 *
 * Privacy: only numbers and anonymous labels leave the club. The names of the students
 * and of the payers never reach the model; the model sees «رسید ۱» and «واریز ۲».
 */

/** What the assistant thinks about one receipt. */
export type ReceiptVerdict = 'confirmed' | 'suspicious' | 'missing';

export const VERDICT_LABELS: Record<ReceiptVerdict, string> = {
  confirmed: 'قطعی',
  suspicious: 'مشکوک',
  missing: 'ناموجود',
};

/** One row of the bank statement the manager pasted. */
export interface StatementRow {
  /** The line number in the pasted text, so the manager can find the row. */
  line: number;
  /** The amount of the transfer in tomans; null when the row has no readable amount. */
  amountTomans: number | null;
  /** Every number of the row, so a match is found whatever the order is. */
  numbers: number[];
  /** Every number of the row as it was written, so a tracking number matches exactly. */
  tokens: string[];
  /** The tracking number of the transfer, when the row carries one. */
  trackingNumber: string | null;
  /** The reference code the student had to write, when the row carries one. */
  reference: string | null;
  /** The last four digits of the payer's card, when the row carries them. */
  senderLast4: string | null;
  /** The raw line, shown to the manager so he can check the row himself. */
  raw: string;
}

/** One receipt that waits for a decision. */
export interface ReceiptCandidate {
  /** The authority of the payment; the manager confirms or rejects with it. */
  authority: string;
  /** 'program' is a sold programme, 'subscription' is the monthly plan. */
  kind: 'program' | 'subscription';
  /** The name of the student; it never leaves the club. */
  studentName: string;
  /** The price of the purchase. */
  amountTomans: number;
  /** The exact amount the student had to transfer. */
  transferAmountTomans: number | null;
  /** The reference code the student was told to write in the description. */
  reference: string | null;
  /** The tracking number the student wrote in the receipt. */
  trackingNumber: string | null;
  /** The last four digits of the student's card, when the student wrote them. */
  senderLast4: string | null;
}

/** What the assistant says about one receipt. */
export interface ReceiptAssessment {
  authority: string;
  kind: 'program' | 'subscription';
  studentName: string;
  verdict: ReceiptVerdict;
  /** Why the assistant thinks so, in one short Persian sentence. */
  reason: string;
  /** The line of the statement the assistant matched, when it matched one. */
  matchedLine: number | null;
  /** The amount of the matched row, so the manager can compare it at a glance. */
  matchedAmountTomans: number | null;
  /** True when the model wrote the reason; false when the rules did. */
  source: 'ai' | 'rules';
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Turns Persian and Arabic digits into Latin ones. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

/** The reference codes of the club look like `MT-AB12CD`. */
const REFERENCE_PATTERN = /\bMT-[A-Z0-9]{4,10}\b/i;

/**
 * Reads the rows of a pasted bank statement.
 *
 * The statement comes from the banking app of the manager and looks different in every
 * bank, so the parser takes what every statement has: a number of digits that is the
 * amount, and possibly a tracking number, a reference code and the last four digits of
 * the payer's card.
 */
export function parseStatement(text: string): StatementRow[] {
  const rows: StatementRow[] = [];
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const latin = toLatinDigits(line);
    const reference = latin.match(REFERENCE_PATTERN)?.[0]?.toUpperCase() ?? null;
    // The date of the row is not part of the money, so it is taken out of the way.
    const withoutDate = latin.replace(/\b\d{2,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}\b/g, ' ');
    // Every number of the row, in the order it was written. A number with a thousand
    // separator is one number, and two numbers never run into each other.
    const tokens = (withoutDate.match(/\d{1,3}(?:[,٬]\d{3})+|\d+/g) ?? [])
      .map((group) => group.replace(/[,٬]/g, ''))
      .filter((group) => group.length >= 3);
    const numbers = tokens
      .map((token) => Number(token))
      .filter((value) => Number.isFinite(value) && value > 0);
    // The amount of the row: the number with a thousand separator wins, otherwise the
    // first plain number that is not a card number.
    const grouped = tokens.find((token) => /[,٬]/.test(token));
    const card = tokens.find((token) => token.length === 16 || token.length === 13);
    const plain = tokens.find((token) => token.length <= 9 && token !== card);
    const amountToken = grouped ?? plain;
    const amountTomans = amountToken ? Number(amountToken) : null;
    // The tracking number: a long number that is neither the card nor the amount.
    const tracking = tokens.find((token) => token.length >= 8 && token !== card && token !== amountToken) ?? null;
    // The last four digits of a card, when the row shows them.
    const cardMatch = latin.match(/(?:کارت|شماره\s*کارت|card)\D{0,6}(\d{4})/i);
    const senderLast4 = cardMatch?.[1] ?? null;
    rows.push({
      line: index + 1,
      amountTomans,
      numbers,
      tokens,
      trackingNumber: tracking,
      reference,
      senderLast4,
      raw: line,
    });
  });
  return rows;
}

/** Two amounts are the same when they are close enough to be the same transfer. */
function amountsMatch(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  // A bank can round the last digits; a difference under a thousand tomans is the same transfer.
  return Math.abs(a - b) <= 1000;
}

/**
 * The rule-based comparison of the statement with the receipts.
 *
 * The rules never trust the AI: they decide how sure the assistant may be. A receipt is
 * only «قطعی» when the exact amount of the transfer and the tracking number of the
 * student both point at the same row of the statement.
 */
export function assessByRules(rows: StatementRow[], receipt: ReceiptCandidate): {
  verdict: ReceiptVerdict;
  reason: string;
  matchedLine: number | null;
  matchedAmountTomans: number | null;
} {
  const expected = receipt.transferAmountTomans ?? receipt.amountTomans;
  const matches = rows.filter((row) => {
    if (!amountsMatch(row.amountTomans, expected)) return false;
    // The reference code of the receipt, when the row carries one, has to be the same.
    if (receipt.reference && row.reference && receipt.reference !== row.reference) return false;
    return true;
  });
  if (!matches.length) {
    return {
      verdict: 'missing',
      reason: `در صورت‌حسابِ واردشده واریزی با این مبلغ پیدا نشد.`,
      matchedLine: null,
      matchedAmountTomans: null,
    };
  }
  // The row whose tracking number is the one the student wrote is the best candidate.
  const best = matches.find((row) => receipt.trackingNumber && row.trackingNumber === receipt.trackingNumber) ?? matches[0];
  if (!best) {
    return {
      verdict: 'missing',
      reason: 'در صورت‌حسابِ واردشده واریزی با این مبلغ پیدا نشد.',
      matchedLine: null,
      matchedAmountTomans: null,
    };
  }
  const trackingMatches = Boolean(receipt.trackingNumber && best.trackingNumber === receipt.trackingNumber);
  const referenceMatches = Boolean(receipt.reference && best.reference === receipt.reference);
  if (trackingMatches && referenceMatches) {
    return {
      verdict: 'confirmed',
      reason: 'مبلغ و شمارهٔ پیگیری هر دو با این رسید می‌خوانند.',
      matchedLine: best.line,
      matchedAmountTomans: best.amountTomans,
    };
  }
  if (trackingMatches) {
    return {
      verdict: 'confirmed',
      reason: 'شمارهٔ پیگیریِ نوشته‌شده در رسید در صورت‌حساب هست و مبلغ هم می‌خواند.',
      matchedLine: best.line,
      matchedAmountTomans: best.amountTomans,
    };
  }
  if (referenceMatches) {
    return {
      verdict: 'confirmed',
      reason: 'کد رهگیریِ نوشته‌شده در صورت‌حساب هست و مبلغ هم می‌خواند.',
      matchedLine: best.line,
      matchedAmountTomans: best.amountTomans,
    };
  }
  return {
    verdict: 'suspicious',
    reason: 'مبلغ در صورت‌حساب هست ولی شمارهٔ پیگیریِ رسید با آن نمی‌خواند؛ خودتان نگاه کنید.',
    matchedLine: best.line,
    matchedAmountTomans: best.amountTomans,
  };
}

/** The prompt of the assistant; only numbers and anonymous labels go in. */
function assistantPrompt(rows: StatementRow[], receipts: ReceiptCandidate[]): string {
  const rowLines = rows
    .map((row) => {
      const parts = [`سطر ${row.line}`];
      if (row.amountTomans !== null) parts.push(`مبلغ ${row.amountTomans} تومان`);
      if (row.numbers.length > 1) parts.push(`عددهای سطر: ${row.numbers.join('، ')}`);
      if (row.trackingNumber) parts.push(`پیگیری ${row.trackingNumber}`);
      if (row.reference) parts.push(`کد ${row.reference}`);
      if (row.senderLast4) parts.push(`کارت مبدأ ${row.senderLast4}`);
      return parts.join('، ');
    })
    .join('\n');
  const receiptLines = receipts
    .map((receipt, index) => {
      const parts = [`رسید ${index + 1}`];
      if (receipt.transferAmountTomans !== null) parts.push(`مبلغ ${receipt.transferAmountTomans} تومان`);
      else parts.push(`مبلغ ${receipt.amountTomans} تومان`);
      if (receipt.trackingNumber) parts.push(`پیگیری ${receipt.trackingNumber}`);
      if (receipt.reference) parts.push(`کد ${receipt.reference}`);
      if (receipt.senderLast4) parts.push(`کارت مبدأ ${receipt.senderLast4}`);
      return parts.join('، ');
    })
    .join('\n');
  return [
    'سطرهای صورت‌حساب بانک:',
    rowLines || 'هیچ سطری خوانده نشد.',
    '',
    'رسیدهای در انتظار بررسی:',
    receiptLines || 'هیچ رسیدی در انتظار نیست.',
    '',
    'برای هر رسید فقط یک خط بنویس به این شکل:',
    'رسید ۱ | قطعی یا مشکوک یا ناموجود | دلیل کوتاه فارسی',
    'شمارهٔ سطر صورت‌حساب را داخل دلیل بنویس. چیزی از خودت نساز و فقط به همین اعداد تکیه کن.',
  ].join('\n');
}

/** Reads the answer of the model into the verdicts. */
function parseVerdicts(answer: string, receipts: ReceiptCandidate[]): Map<number, { verdict: ReceiptVerdict; reason: string }> {
  const verdicts = new Map<number, { verdict: ReceiptVerdict; reason: string }>();
  for (const line of answer.split(/\r?\n/)) {
    // The model writes the line in its own way, so the separators can be anything.
    const match = line.match(/رسید\s*(\d+)\s*[|،,\-–:؛\s]*\s*(قطعی|مشکوک|ناموجود)\s*[|،,\-–:؛\s]*\s*(.+)/);
    if (!match) continue;
    const index = Number(match[1]) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= receipts.length) continue;

    const verdict = match[2] === 'قطعی' ? 'confirmed' : match[2] === 'مشکوک' ? 'suspicious' : 'missing';
    const reason = (match[3] ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!reason) continue;
    verdicts.set(index, { verdict, reason });
  }
  return verdicts;
}

/**
 * The assistant reads the statement and says what it thinks about every receipt.
 *
 * The rules run first and hold the last word: the model may write a better reason and
 * may raise a «مشکوک» to a «قطعی», but it can never turn a receipt the rules could not
 * find into a «قطعی», because a wrong confirmation opens a paid part of the app.
 */
export async function reviewReceipts(
  rows: StatementRow[],
  receipts: ReceiptCandidate[],
  config: AiConfig = aiConfig()
): Promise<ReceiptAssessment[]> {
  const ruleResults = receipts.map((receipt) => ({ receipt, rule: assessByRules(rows, receipt) }));
  if (!config.enabled || !receipts.length) {
    return ruleResults.map(({ receipt, rule }) => ({
      authority: receipt.authority,
      kind: receipt.kind,
      studentName: receipt.studentName,
      verdict: rule.verdict,
      reason: rule.reason,
      matchedLine: rule.matchedLine,
      matchedAmountTomans: rule.matchedAmountTomans,
      source: 'rules' as const,
    }));
  }

  const answer = await askAi(config, 'تو دستیار بررسی رسیدِ یک باشگاه ورزشی هستی و فارسی کوتاه می‌نویسی. فقط عددهای داده‌شده را می‌بینی.', assistantPrompt(rows, receipts), {
    maxTokens: 700,
    timeoutMs: 20_000,
  });
  const verdicts = answer ? parseVerdicts(answer, receipts) : new Map();

  return ruleResults.map(({ receipt, rule }, index) => {
    const ai = verdicts.get(index);
    if (!ai) {
      return {
        authority: receipt.authority,
        kind: receipt.kind,
        studentName: receipt.studentName,
        verdict: rule.verdict,
        reason: rule.reason,
        matchedLine: rule.matchedLine,
        matchedAmountTomans: rule.matchedAmountTomans,
        source: 'rules' as const,
      };
    }
    // The rules hold the last word: the model cannot confirm a receipt the rules did not
    // find, and it cannot turn a confirmed receipt into a missing one.
    const verdict: ReceiptVerdict =
      rule.verdict === 'missing' ? 'missing' : rule.verdict === 'confirmed' ? 'confirmed' : ai.verdict;
    return {
      authority: receipt.authority,
      kind: receipt.kind,
      studentName: receipt.studentName,
      verdict,
      reason: verdict === rule.verdict ? ai.reason : rule.reason,
      matchedLine: rule.matchedLine,
      matchedAmountTomans: rule.matchedAmountTomans,
      source: 'ai' as const,
    };
  });
}

/** How many receipts of each kind the assistant found. */
export function summarise(assessments: ReceiptAssessment[]): {
  confirmed: number;
  suspicious: number;
  missing: number;
  total: number;
} {
  return {
    confirmed: assessments.filter((item) => item.verdict === 'confirmed').length,
    suspicious: assessments.filter((item) => item.verdict === 'suspicious').length,
    missing: assessments.filter((item) => item.verdict === 'missing').length,
    total: assessments.length,
  };
}
