import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';

// Tests may exercise legacy-scoped storage; personal programme fixtures must be chosen explicitly.
if (typeof window !== 'undefined') window.localStorage.setItem('meety.account-scope', 'owner');


// A recovery copy should persist within one test, not leak into the next test's account.
if (typeof window !== 'undefined') afterEach(() => window.sessionStorage.clear());
