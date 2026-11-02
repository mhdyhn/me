import { HttpError } from './http.ts';

/**
 * The internal AI of the club.
 *
 * The app talks to any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, a local
 * Ollama, ...) that the club configures with three environment variables. Nothing in the
 * app breaks when no key is set: every smart feature has a rule-based version and falls
 * back to it. The students and the coaches never see an AI chat box; the AI only writes
 * the sentences the app would have written anyway.
 *
 * Privacy rule of this module: only numbers and anonymised labels leave the club. No
 * name, no phone number, no message of a user is ever sent to the provider.
 */
export interface AiConfig {
  /** True when a key and a usable endpoint are configured. */
  enabled: boolean;
  /** The base of the endpoint, without the trailing slash; null when it is off. */
  baseUrl: string | null;
  /** The model the club pays for. */
  model: string;
  /** Why the AI is off, shown in the admin panel. */
  reason: string | null;
}

export const DEFAULT_AI_MODEL = 'gpt-4o-mini';

/** Reads the AI configuration from the environment. */
export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const key = (env.AI_API_KEY ?? '').trim();
  const rawBase = (env.AI_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const model = (env.AI_MODEL ?? '').trim() || DEFAULT_AI_MODEL;
  if (!key) {
    return { enabled: false, baseUrl: null, model, reason: 'کلید هوش مصنوعی تنظیم نشده است (AI_API_KEY).' };
  }
  if (!rawBase) {
    return { enabled: false, baseUrl: null, model, reason: 'نشانی سرویس هوش مصنوعی تنظیم نشده است (AI_BASE_URL).' };
  }
  let url: URL;
  try {
    url = new URL(rawBase);
  } catch {
    return { enabled: false, baseUrl: null, model, reason: 'نشانی AI_BASE_URL معتبر نیست.' };
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    return { enabled: false, baseUrl: null, model, reason: 'نشانی سرویس هوش مصنوعی باید HTTPS باشد.' };
  }
  if (url.username || url.password) {
    return { enabled: false, baseUrl: null, model, reason: 'نشانی سرویس هوش مصنوعی نباید اطلاعات کاربری داشته باشد.' };
  }
  return { enabled: true, baseUrl: url.origin + url.pathname.replace(/\/+$/, ''), model, reason: null };
}

/**
 * Asks the model for a short answer. Returns null when the AI is off or the service does
 * not answer in time; the caller then uses its rule-based text.
 */
export async function askAi(
  config: AiConfig,
  system: string,
  user: string,
  options: { maxTokens?: number; timeoutMs?: number; apiKey?: string } = {}
): Promise<string | null> {
  if (!config.enabled || !config.baseUrl) return null;
  const apiKey = (options.apiKey ?? process.env.AI_API_KEY ?? '').trim();
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        max_tokens: options.maxTokens ?? 220,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;
    const cleaned = content.replace(/\s+/g, ' ').trim();
    return cleaned ? cleaned.slice(0, 600) : null;
  } catch {
    // The AI is an extra, never a requirement: a failure is silent on purpose.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** The Persian voice of the app: short, calm and concrete. */
export const AI_SYSTEM_PROMPT = [
  'تو دستیار پنهان اپ میتی هستی و فارسی روان و محاوره‌ای می‌نویسی.',
  'فقط ۲ تا ۴ جملهٔ کوتاه بنویس، بدون عنوان، بدون بولت‌پوینت و بدون ایموجی.',
  'به عددهای داده‌شده تکیه کن و چیزی از خودت نساز.',
  'لحن باید محترمانه و بدون نصیحت باشد.',
].join(' ');

/** Turns a technical failure into a message the user can act on. */
export function aiUnavailableMessage(reason: string | null): string {
  return reason ?? 'هوش مصنوعی داخلی در دسترس نیست؛ نسخهٔ قاعده‌محور استفاده می‌شود.';
}

/** Guards the AI answer: a paragraph, not a list or an empty string. */
export function cleanAiText(value: string | null): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < 12) return null;
  return text.slice(0, 600);
}

/** Throws when a caller asks for the AI without a configuration; used by the admin panel. */
export function requireAi(config: AiConfig): AiConfig {
  if (!config.enabled) throw new HttpError(503, aiUnavailableMessage(config.reason));
  return config;
}
