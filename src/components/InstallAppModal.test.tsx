import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallAppModal } from './InstallAppModal';

describe('InstallAppModal', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('offers PWA and does not advertise an unconfigured APK', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<InstallAppModal isOpen={true} onClose={handleClose} />);

    expect(screen.getByRole('heading', { name: 'نصب مستقیم اپلیکیشن روی گوشی' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /نصب مستقیم/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /دانلود فایل نصبی \(APK\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /راهنمای آیفون \(iOS\)/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /دانلود فایل نصبی \(APK\)/ }));
    expect(screen.getByText(/فایل اندروید تأییدشده برای این نسخه پیکربندی نشده است/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /دریافت فایل اندروید/ })).not.toBeInTheDocument();
  });

  it('switches to iOS tab properly', async () => {
    const user = userEvent.setup();
    render(<InstallAppModal isOpen={true} onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: /راهنمای آیفون \(iOS\)/ }));
    expect(screen.getAllByText(/Safari/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<InstallAppModal isOpen={true} onClose={handleClose} />);

    const closeButtons = screen.getAllByRole('button', { name: 'بستن' });
    expect(closeButtons[0]).toBeDefined();
    await user.click(closeButtons[0]!);
    expect(handleClose).toHaveBeenCalled();
  });

  it('offers only a configured HTTPS or same-origin APK address', async () => {
    vi.stubEnv('VITE_ANDROID_APK_URL', 'https://downloads.example.com/meety.apk');
    const user = userEvent.setup();
    const view = render(<InstallAppModal isOpen={true} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /دانلود فایل نصبی \(APK\)/ }));
    expect(screen.getByRole('link', { name: /دریافت فایل اندروید/ })).toHaveAttribute('href', 'https://downloads.example.com/meety.apk');
    vi.stubEnv('VITE_ANDROID_APK_URL', 'javascript:alert(1)');
    view.rerender(<InstallAppModal isOpen={true} onClose={() => {}} />);
    expect(screen.queryByRole('link', { name: /دریافت فایل اندروید/ })).not.toBeInTheDocument();
  });

});
