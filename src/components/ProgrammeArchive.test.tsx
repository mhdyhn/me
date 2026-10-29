import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgrammeArchive } from './ProgrammeArchive';

it('shows purchased programme details read-only when a new programme is active', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ programs: [{
    id: 'old', version: 1, title: 'برنامهٔ خریداری‌شده', priceTomans: 100000, updatedAt: '2026-10-01',
    days: [{ name: 'روز اول', exercises: [{ exerciseId: 'squat', name: 'اسکوات', muscle: 'پا', sets: 3, reps: '8-12', restSeconds: 90 }] }],
  }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  render(<ProgrammeArchive studentId={7} />);
  const user = userEvent.setup();
  await user.click(await screen.findByText(/بایگانی برنامه‌های قبلی/));
  await user.click(screen.getByText('برنامهٔ خریداری‌شده'));
  expect(screen.getByText(/اسکوات/)).toHaveTextContent('۳ ست');
  expect(screen.getByText(/تمرین از برنامهٔ فعلی شروع می‌شود/)).toBeInTheDocument();
});

function archiveResponse(title: string, nextCursor: string | null) {
  return new Response(JSON.stringify({ programs: [{ id: title, version: 1, title, priceTomans: 0, updatedAt: '2026-10-01', days: [] }], nextCursor }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

it('loads more archive pages and stops when there is no cursor', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(archiveResponse('صفحه اول', 'cursor one')).mockResolvedValueOnce(archiveResponse('صفحه دوم', null));
  vi.stubGlobal('fetch', fetcher);
  render(<ProgrammeArchive studentId={7} />);
  const user = userEvent.setup();
  await user.click(await screen.findByText('بایگانی برنامه‌های قبلی'));
  await user.click(screen.getByRole('button', { name: 'نمایش برنامه‌های بیشتر' }));
  expect(await screen.findByText('صفحه دوم')).toBeInTheDocument();
  expect(screen.getByText('صفحه اول')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'نمایش برنامه‌های بیشتر' })).not.toBeInTheDocument();
  expect(String(fetcher.mock.calls[1]?.[0])).toContain('cursor=cursor%20one');
});

it('discards an old archive response after the account changes', async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce(archiveResponse('برنامهٔ حساب دوم', null)));
  const { rerender } = render(<ProgrammeArchive studentId={7} />);
  rerender(<ProgrammeArchive studentId={8} />);
  expect(await screen.findByText('برنامهٔ حساب دوم')).toBeInTheDocument();
  await act(async () => { resolveOld(archiveResponse('برنامهٔ حساب اول', null)); });
  expect(screen.queryByText('برنامهٔ حساب اول')).not.toBeInTheDocument();
  expect(screen.getByText('برنامهٔ حساب دوم')).toBeInTheDocument();
});

afterEach(() => vi.unstubAllGlobals());
