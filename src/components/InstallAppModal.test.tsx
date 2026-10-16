import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallAppModal } from './InstallAppModal';

describe('InstallAppModal', () => {
  it('renders modal with direct PWA install by default and no external GitHub links', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<InstallAppModal isOpen={true} onClose={handleClose} />);

    expect(screen.getByRole('heading', { name: 'نصب مستقیم اپلیکیشن روی گوشی' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /نصب مستقیم/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /دانلود فایل نصبی \(APK\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /راهنمای آیفون \(iOS\)/ })).toBeInTheDocument();

    // Verify no GitHub links exist in the modal
    const allLinks = screen.queryAllByRole('link');
    for (const link of allLinks) {
      expect(link.getAttribute('href')).not.toContain('github.com');
    }

    // Switch to APK tab
    await user.click(screen.getByRole('button', { name: /دانلود فایل نصبی \(APK\)/ }));
    const apkLink = screen.getByRole('link', { name: /دریافت مستقیم فایل meety\.apk/ });
    expect(apkLink).toBeInTheDocument();
    expect(apkLink).toHaveAttribute('href', '/meety.apk');
    expect(apkLink).toHaveAttribute('download', 'meety.apk');
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
});
