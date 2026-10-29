import { ApiError } from './api';

/** The server may have committed even if a response or a proxy failed. Re-read before retrying. */
export function isUncertainWrite(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 409
    || error.status >= 500 || (error.status >= 200 && error.status < 300);
}
