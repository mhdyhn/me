import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// Tests exercise the developer's own data (original programme, legacy database) unless they say otherwise.
if (typeof window !== 'undefined') window.localStorage.setItem('meety.account-scope', 'owner');

