import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Generated passwords are kept encrypted so the coach and the admin can read them on their cards.
 * The key comes from MEETY_SECRET; the server refuses to start in production without it.
 * Passwords are still hashed for sign-in: the encrypted copy is only for showing a card.
 */
export type SecretKey = Buffer;

export function keyFromSecret(secret: string): SecretKey {
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(key: SecretKey, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Returns null when the value is missing or was made with another key, so a card can say so instead of crashing. */
export function decryptSecret(key: SecretKey, stored: string | null): string | null {
  if (!stored) return null;
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
