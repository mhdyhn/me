export class HttpError extends Error {
  // Written out rather than as constructor parameter properties: Node's built-in TypeScript
  // support only strips types and cannot run parameter properties.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const MAX_BODY_BYTES = 16 * 1024;

/** Reads the request body as JSON. An empty body is treated as an empty object. */
export async function readJsonBody(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'درخواست بیش از حد بزرگ است.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'بدنهٔ درخواست JSON معتبر نیست.');
  }
}

export function requireObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'بدنهٔ درخواست نامعتبر است.');
  return body as Record<string, unknown>;
}

export function requireText(body: Record<string, unknown>, key: string, min: number, max: number, label: string): string {
  const value = body[key];
  if (typeof value !== 'string') throw new HttpError(400, `${label} را وارد کنید.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new HttpError(400, `${label} باید بین ${min} تا ${max} نویسه باشد.`);
  return trimmed;
}
