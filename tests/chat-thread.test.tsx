import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/lib/db';

const mockMessages = [
  {
    id: 1,
    senderId: 1, // Coach
    body: 'سلام علی جان، برنامه تمرینی جدیدت رو تنظیم کردم.',
    mediaType: 'text',
    mediaData: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    senderId: 10, // Student (mine)
    body: 'ممنون مربی! فرم این حرکت درسته؟',
    mediaType: 'image',
    mediaData: 'data:image/jpeg;base64,mockImageData123',
    createdAt: new Date().toISOString(),
  },
];

function stubChatSession() {
  window.localStorage.setItem('meety.session-token', 'test-session-token-000000000000');
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/me/chat')) {
      return new Response(
        JSON.stringify({
          coachName: 'مربی رضا',
          messages: mockMessages,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/me')) {
      return new Response(
        JSON.stringify({
          user: {
            id: 10,
            username: 'ali',
            role: 'student',
            displayName: 'علی',
            coachId: 1,
            mustChangePassword: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

beforeEach(async () => {
  window.history.replaceState({}, '', '/chat');
  await db.sessions.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('Telegram-like Chat and Fullscreen Photo Lightbox', () => {
  it('renders chat messages with Telegram-style ticks and handles full-screen photo lightbox', async () => {
    stubChatSession();
    render(<App />);

    // Check header info
    expect(await screen.findByText('مربی رضا')).toBeInTheDocument();
    expect(screen.getByText('مربی تمرین')).toBeInTheDocument();

    // Check message bodies
    expect(screen.getByText('سلام علی جان، برنامه تمرینی جدیدت رو تنظیم کردم.')).toBeInTheDocument();
    expect(screen.getByText('ممنون مربی! فرم این حرکت درسته؟')).toBeInTheDocument();

    // Check outgoing message tick
    const tick = document.querySelector('.chat-tick');
    expect(tick).toBeInTheDocument();

    // Image message button
    const imageButton = screen.getByRole('button', { name: 'مشاهده تصویر در اندازه تمام‌صفحه' });
    expect(imageButton).toBeInTheDocument();

    // Initially, lightbox is not open
    expect(screen.queryByRole('dialog', { name: 'نمایش تصویر در اندازه بزرگ' })).not.toBeInTheDocument();

    // Click the image to open the full-screen lightbox
    await userEvent.click(imageButton);

    const lightbox = screen.getByRole('dialog', { name: 'نمایش تصویر در اندازه بزرگ' });
    expect(lightbox).toBeInTheDocument();

    // Check lightbox tools
    expect(screen.getByRole('button', { name: 'بزرگ‌نمایی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'دانلود تصویر' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument();

    // Close via close button
    const closeBtn = screen.getByRole('button', { name: 'بستن' });
    await userEvent.click(closeBtn);

    expect(screen.queryByRole('dialog', { name: 'نمایش تصویر در اندازه بزرگ' })).not.toBeInTheDocument();

    // Reopen and close via Escape key
    await userEvent.click(imageButton);
    expect(screen.getByRole('dialog', { name: 'نمایش تصویر در اندازه بزرگ' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'نمایش تصویر در اندازه بزرگ' })).not.toBeInTheDocument();
  });
});
