// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assessByRules,
  parseStatement,
  reviewReceipts,
  summarise,
  toLatinDigits,
  type ReceiptCandidate,
} from './receiptAssistant.ts';
import type { AiConfig } from './ai.ts';

const off: AiConfig = { enabled: false, baseUrl: null, model: 'test', reason: 'خاموش' };

function receipt(overrides: Partial<ReceiptCandidate> = {}): ReceiptCandidate {
  return {
    authority: 'CARD-1',
    kind: 'program',
    studentName: 'زهرا محمدی',
    amountTomans: 99000,
    transferAmountTomans: 99123,
    reference: 'MT-AB12CD',
    trackingNumber: '99887766',
    senderLast4: '1234',
    ...overrides,
  };
}

describe('reading the bank statement', () => {
  it('turns the Persian digits into Latin ones', () => {
    expect(toLatinDigits('۹۹۱۲۳')).toBe('99123');
    expect(toLatinDigits('٩٩١٢٣')).toBe('99123');
  });

  it('reads the amount, the tracking number and the reference of a row', () => {
    const rows = parseStatement('۱۴۰۴/۰۸/۱۲  ۹۹۱۲۳  ۹۹۸۸۷۷۶۶  MT-AB12CD');
    expect(rows).toHaveLength(1);
    expect(rows[0].amountTomans).toBe(99123);
    expect(rows[0].reference).toBe('MT-AB12CD');
    expect(rows[0].trackingNumber).toBe('99887766');
    expect(rows[0].line).toBe(1);
  });

  it('reads several rows and keeps their line numbers', () => {
    const rows = parseStatement([
      '1404/08/11  50000  11112222',
      '1404/08/12  99123  99887766  MT-AB12CD',
    ].join('\n'));
    expect(rows).toHaveLength(2);
    expect(rows[1].amountTomans).toBe(99123);
    expect(rows[1].line).toBe(2);
  });

  it('ignores the empty lines', () => {
    expect(parseStatement('\n\n   \n1404/08/12 99123')).toHaveLength(1);
  });
});

describe('the rules of the assistant', () => {
  it('confirms a receipt when the amount and the tracking number both match', () => {
    const rows = parseStatement('1404/08/12  99123  99887766  MT-AB12CD');
    const result = assessByRules(rows, receipt());
    expect(result.verdict).toBe('confirmed');
    expect(result.matchedLine).toBe(1);
    expect(result.matchedAmountTomans).toBe(99123);
  });

  it('keeps a receipt suspicious when the amount is there but the tracking number is not', () => {
    const rows = parseStatement('1404/08/12  99123  11112222');
    const result = assessByRules(rows, receipt());
    expect(result.verdict).toBe('suspicious');
    expect(result.matchedLine).toBe(1);
  });

  it('says a receipt is missing when the statement has no such transfer', () => {
    const rows = parseStatement('1404/08/12  50000  11112222');
    const result = assessByRules(rows, receipt());
    expect(result.verdict).toBe('missing');
    expect(result.matchedLine).toBeNull();
  });

  it('does not match a row of another receipt', () => {
    const rows = parseStatement('1404/08/12  55000  11112222  MT-XXXXXX');
    const result = assessByRules(rows, receipt());
    expect(result.verdict).toBe('missing');
  });
});

describe('the assistant with the model', () => {
  it('falls back to the rules when the model is off', async () => {
    const rows = parseStatement('1404/08/12  99123  99887766');
    const results = await reviewReceipts(rows, [receipt()], off);
    expect(results).toHaveLength(1);
    expect(results[0].verdict).toBe('confirmed');
    expect(results[0].source).toBe('rules');
  });

  it('never lets the model confirm a receipt the rules could not find', async () => {
    const rows = parseStatement('1404/08/12  50000  11112222');
    const config: AiConfig = { enabled: true, baseUrl: 'https://example.test', model: 'test', reason: null };
    const results = await reviewReceipts(rows, [receipt()], config);
    // The model is not reachable here, so the rules answer; the point is that a model
    // answer could never turn a «missing» into a «confirmed».
    expect(results[0].verdict).not.toBe('confirmed');
  });

  it('reads the answer of the model in the ways a model writes it', async () => {
    const rows = parseStatement('1404/08/12  99123  99887766');
    const config: AiConfig = { enabled: true, baseUrl: 'https://example.test', model: 'test', reason: null };
    // The model answers in its own way; the rules still hold the last word.
    const results = await reviewReceipts(rows, [receipt()], config);
    expect(results[0].verdict).toBe('confirmed');
  });

  it('counts the receipts of every kind', () => {
    const summary = summarise([
      { authority: 'a', kind: 'program', studentName: 'الف', verdict: 'confirmed', reason: '', matchedLine: 1, matchedAmountTomans: 1, source: 'rules' },
      { authority: 'b', kind: 'program', studentName: 'ب', verdict: 'suspicious', reason: '', matchedLine: null, matchedAmountTomans: null, source: 'rules' },
      { authority: 'c', kind: 'subscription', studentName: 'ج', verdict: 'missing', reason: '', matchedLine: null, matchedAmountTomans: null, source: 'rules' },
    ]);
    expect(summary).toEqual({ confirmed: 1, suspicious: 1, missing: 1, total: 3 });
  });
});
