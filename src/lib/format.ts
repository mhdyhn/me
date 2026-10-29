const PERSIAN_LOCALE = 'fa-IR-u-ca-persian-nu-arabext';
const PERSIAN_NUMBER_LOCALE = 'fa-IR-u-nu-arabext';

export const faNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(PERSIAN_NUMBER_LOCALE, options).format(value);

export const faDigits = (value: string | number) =>
  String(value).replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] ?? digit);

export const kg = (value: number, digits = 1) =>
  `${faNumber(Number(value.toFixed(digits)), { maximumFractionDigits: digits })} کیلوگرم`;

export const formatDate = (value: string | Date, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(PERSIAN_LOCALE, options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(
    typeof value === 'string' ? new Date(value) : value,
  );

export const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat(PERSIAN_LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    typeof value === 'string' ? new Date(value) : value,
  );

export const formatDuration = (seconds: number) => {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours && remainingMinutes) return `${faNumber(hours)} ساعت و ${faNumber(remainingMinutes)} دقیقه`;
  if (hours) return `${faNumber(hours)} ساعت`;
  return `${faNumber(minutes)} دقیقه`;
};

// Persisted date keys stay ISO/Gregorian; PersianDateInput converts the visible selection.
export const dateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getLocalDateKey = (date = new Date()) => dateInputValue(date);
