/**
 * Error codes the engine reports. Each code has a Persian and an English message the
 * demo and the host app can show. The raw detail is for logs, never for the reader.
 */
export const ENGINE_ERROR_CODES = [
  'invalid-exercise-id',
  'invalid-config',
  'missing-model',
  'missing-animation',
  'unsupported-rig',
  'download-failed',
  'corrupt-asset',
  'render-init-failed',
  'unsupported-device',
] as const;
export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export interface EngineErrorInfo {
  code: EngineErrorCode;
  message: { fa: string; en: string };
  /** Whether pressing retry can plausibly help. */
  retryable: boolean;
}

const INFO: Record<EngineErrorCode, EngineErrorInfo> = {
  'invalid-exercise-id': {
    code: 'invalid-exercise-id',
    message: { fa: 'این تمرین در کتابخانه پیدا نشد.', en: 'This exercise is not in the library.' },
    retryable: false,
  },
  'invalid-config': {
    code: 'invalid-config',
    message: { fa: 'اطلاعات این تمرین کامل نیست و نمایش داده نشد.', en: 'This exercise’s data is incomplete and was not shown.' },
    retryable: false,
  },
  'missing-model': {
    code: 'missing-model',
    message: { fa: 'فایل مدل سه‌بعدی پیدا نشد.', en: 'The 3D model file could not be found.' },
    retryable: false,
  },
  'missing-animation': {
    code: 'missing-animation',
    message: { fa: 'حرکت این تمرین هنوز ثبت نشده است؛ بدن را در حالت ایستا می‌بینی.', en: 'This movement is not recorded yet; the body is shown still.' },
    retryable: false,
  },
  'unsupported-rig': {
    code: 'unsupported-rig',
    message: { fa: 'اسکلت این مدل با حرکت این تمرین سازگار نیست.', en: 'This model’s skeleton does not match the movement.' },
    retryable: false,
  },
  'download-failed': {
    code: 'download-failed',
    message: { fa: 'بارگذاری مدل ناموفق بود. اتصال را بررسی کن و دوباره تلاش کن.', en: 'The model failed to load. Check the connection and try again.' },
    retryable: true,
  },
  'corrupt-asset': {
    code: 'corrupt-asset',
    message: { fa: 'فایل مدل خراب است.', en: 'The model file is corrupt.' },
    retryable: false,
  },
  'render-init-failed': {
    code: 'render-init-failed',
    message: { fa: 'نمایش سه‌بعدی در این دستگاه راه‌اندازی نشد.', en: 'The 3D view could not start on this device.' },
    retryable: true,
  },
  'unsupported-device': {
    code: 'unsupported-device',
    message: { fa: 'این دستگاه از نمایش سه‌بعدی پشتیبانی نمی‌کند.', en: 'This device does not support 3D viewing.' },
    retryable: false,
  },
};

export class EngineError extends Error {
  readonly info: EngineErrorInfo;

  constructor(readonly code: EngineErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'EngineError';
    this.info = INFO[code];
  }
}

export const describeError = (code: EngineErrorCode): EngineErrorInfo => INFO[code];
