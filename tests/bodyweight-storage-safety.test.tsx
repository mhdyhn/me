import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GymProvider, useGym } from '../src/context/GymProvider';
import { db } from '../src/lib/db';

function WeightProbe() {
  const { bodyweights, addBodyweight, loading } = useGym();
  const [result, setResult] = useState('');
  if (loading) return <span>loading</span>;
  return <><span data-testid="count">{bodyweights.length}</span><button onClick={async () => setResult(String(await addBodyweight({ date: '2026-10-29', weightKg: 80 })))}>add</button><span role="status">{result}</span></>;
}

beforeEach(async () => { await db.bodyweights.clear(); await db.syncDeleted.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

it('does not put an unsaved weight into the chart or duplicate it when retrying', async () => {
  vi.spyOn(db.bodyweights, 'put').mockRejectedValueOnce(new Error('storage unavailable'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<GymProvider><WeightProbe /></GymProvider>);
  await screen.findByRole('button', { name: 'add' });
  fireEvent.click(screen.getByRole('button', { name: 'add' }));
  expect(await screen.findByText('false')).toBeInTheDocument();
  expect(screen.getByTestId('count')).toHaveTextContent('0');
  fireEvent.click(screen.getByRole('button', { name: 'add' }));
  expect(await screen.findByText('true')).toBeInTheDocument();
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(await db.bodyweights.count()).toBe(1);
});
