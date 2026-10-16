import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallAppModal } from './InstallAppModal';

describe('InstallAppModal', () => {
  it('renders modal with APK download tab by default', () => {
    const handleClose = vi.fn();
    render(<InstallAppModal isOpen={true} onClose={handleClose} />);

    expect(screen.getByText('نصب و دانلود اپلیکیشن میتی')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /فایل نصبی اندروید \(APK\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /وب‌اپ \(PWA\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /راهنمای آیفون \(iOS\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/فایل تک‌صفحه‌ای/)).not.toBeInTheDocument();

    const apkLink = screen.getByRole('link', { name: /دانلود مستقیم فایل نصبی اندروید \(meety\.apk\)/ });
    expect(apkLink).toBeInTheDocument();
    expect(apkLink).toHaveAttribute('href', expect.stringContaining('meety.apk'));
  });

  it('switches to PWA and iOS tabs properly', async () => {
    const user = userEvent.setup();
    render(<InstallAppModal isOpen={true} onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: /راهنمای آیفون \(iOS\)/ }));
    expect(screen.getAllByText(/Safari/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /وب‌اپ \(PWA\)/ }));
    expect(screen.getByText(/نصب برنامه/)).toBeInTheDocument();
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
});
