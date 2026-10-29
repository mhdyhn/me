import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';

// Tests exercise the developer's own data (original programme, legacy database) unless they say otherwise.
if (typeof window !== 'undefined') window.localStorage.setItem('meety.account-scope', 'owner');


// A recovery copy should persist within one test, not leak into the next test's account.
if (typeof window !== 'undefined') afterEach(() => window.sessionStorage.clear());
