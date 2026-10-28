import { HttpError } from './http.ts';

/** Iranian mobile numbers are stored consistently; possession is not verified by SMS. */
export function requireMobile(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32) throw new HttpError(400, 'شماره موبایل معتبر وارد کنید.');
  let number = value.trim().replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  }).replace(/[\s()-]/g, '');
  if (number.startsWith('+98')) number = `0${number.slice(3)}`;
  else if (number.startsWith('0098')) number = `0${number.slice(4)}`;
  else if (number.startsWith('98')) number = `0${number.slice(2)}`;
  if (!/^09[0-9]{9}$/.test(number)) throw new HttpError(400, 'شماره موبایل معتبر وارد کنید؛ مثلاً ۰۹۱۲۳۴۵۶۷۸۹.');
  return number;
}
