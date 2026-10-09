import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { vi } from 'vitest';

vi.mock('../src/components/ExerciseModelCanvas', async () => import('./mocks/ExerciseModelCanvasMock'));
