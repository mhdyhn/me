// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStatement, reviewReceipts, type ReceiptCandidate } from './receiptAssistant.ts';
import type { AiConfig } from './ai.ts';

/**
 * The assistant against a service that answers like a real one.
 *
 * The rule of the club is that the model never decides; the rules do. This suite checks
 * that the answer of the model is used for the reason, that a model that writes in its
 * own way is still understood, and that a model that tries to confirm a receipt the
 * rules could not find is overruled.
 */
let aiServer: Server;
let aiBase: string;
let lastBody: string | null = null;

function candidate(overrides: Partial<ReceiptCandidate> = {}): ReceiptCandidate {
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

beforeEach(async () => {
  lastBody = null;
  // The service of the club needs a key; this one is the local test service.
  vi.stubEnv('AI_API_KEY', 'test-key');
  aiServer = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      lastBody = Buffer.concat(chunks).toString('utf8');
      const answer = process.env.MOCK_AI_ANSWER ?? '';
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: answer } }],
      }));
    });
  });
  await new Promise<void>((resolve) => aiServer.listen(0, '127.0.0.1', resolve));
  aiBase = `http://127.0.0.1:${(aiServer.address() as AddressInfo).port}/v1`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => aiServer.close(() => resolve()));
  vi.unstubAllEnvs();
});

function aiConfig(): AiConfig {
  return { enabled: true, baseUrl: aiBase, model: 'test-model', reason: null };
}

describe('the assistant against a real service', () => {
  it('uses the reason of the model for a receipt the rules confirmed', async () => {
    vi.stubEnv('MOCK_AI_ANSWER', 'رسید ۱ | قطعی | سطر ۳ صورت‌حساب با مبلغ و پیگیری می‌خواند.');
    const rows = parseStatement([
      '1404/08/11  50000  11112222',
      '1404/08/12  99123  99887766  MT-AB12CD',
    ].join('\n'));
    const results = await reviewReceipts(rows, [candidate()], aiConfig());
    expect(results[0].verdict).toBe('confirmed');
    expect(results[0].source).toBe('ai');
    expect(results[0].reason).toContain('سطر ۳');
    // The model saw the numbers of the statement and the anonymous label of the receipt.
    expect(lastBody).toContain('سطر 2');
    expect(lastBody).toContain('رسید 1');
  });

  it('understands a model that writes the line in its own way', async () => {
    vi.stubEnv('MOCK_AI_ANSWER', 'رسید ۱: مشکوک — شمارهٔ پیگیری در سطر ۲ دیده نمی‌شود.');
    const rows = parseStatement('1404/08/12  99123  11112222');
    const results = await reviewReceipts(rows, [candidate()], aiConfig());
    // The rules say «مشکوک» here, so the verdict stays; only the reason is the model's.
    expect(results[0].verdict).toBe('suspicious');
    expect(results[0].source).toBe('ai');
    expect(results[0].reason).toContain('شمارهٔ پیگیری');
  });

  it('overrules a model that wants to confirm a receipt the rules did not find', async () => {
    vi.stubEnv('MOCK_AI_ANSWER', 'رسید ۱ | قطعی | حتماً واریز شده است.');
    const rows = parseStatement('1404/08/12  50000  11112222');
    const results = await reviewReceipts(rows, [candidate()], aiConfig());
    // The rules hold the last word: a receipt that was not found cannot be confirmed.
    expect(results[0].verdict).toBe('missing');
  });

  it('does not let a model turn a confirmed receipt into a missing one', async () => {
    vi.stubEnv('MOCK_AI_ANSWER', 'رسید ۱ | ناموجود | پیدا نشد.');
    const rows = parseStatement('1404/08/12  99123  99887766  MT-AB12CD');
    const results = await reviewReceipts(rows, [candidate()], aiConfig());
    expect(results[0].verdict).toBe('confirmed');
  });

  it('keeps the rules when the service answers nothing useful', async () => {
    vi.stubEnv('MOCK_AI_ANSWER', 'من نمی‌دانم.');
    const rows = parseStatement('1404/08/12  99123  99887766');
    const results = await reviewReceipts(rows, [candidate()], aiConfig());
    expect(results[0].verdict).toBe('confirmed');
    expect(results[0].source).toBe('rules');
  });

  it('never sends a name of a student to the service', async () => {
    vi.stubEnv('MOCK_AI_ANSWER', 'رسید ۱ | قطعی | مبلغ می‌خواند.');
    const rows = parseStatement('1404/08/12  99123  99887766');
    await reviewReceipts(rows, [candidate({ studentName: 'زهرا محمدی' })], aiConfig());
    expect(lastBody).not.toBeNull();
    expect(lastBody).not.toContain('زهرا');
    expect(lastBody).not.toContain('محمدی');
    // Only the numbers and the anonymous labels go out.
    expect(lastBody).toContain('رسید ۱');
    expect(lastBody).toContain('99123');
  });

  it('does not ask the service when there is no receipt to review', async () => {
    vi.stubEnv('MOCK_AI_ANSWER', 'رسید ۱ | قطعی | مبلغ می‌خواند.');
    const rows = parseStatement('1404/08/12  99123  99887766');
    const results = await reviewReceipts(rows, [], aiConfig());
    expect(results).toHaveLength(0);
    expect(lastBody).toBeNull();
  });
});
