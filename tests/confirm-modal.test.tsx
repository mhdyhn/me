import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmProvider, confirmModal, useConfirm } from '../src/components/ConfirmModal';

afterEach(() => {
  cleanup();
});

function TestComponent({
  title,
  message,
  variant,
  confirmText,
  cancelText,
  onResult,
}: {
  title?: string;
  message: string;
  variant?: 'danger' | 'warning' | 'primary';
  confirmText?: string;
  cancelText?: string;
  onResult: (res: boolean) => void;
}) {
  const confirm = useConfirm();

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await confirm({
          title,
          message,
          variant,
          confirmText,
          cancelText,
        });
        onResult(result);
      }}
    >
      باز کردن مودال
    </button>
  );
}

describe('Universal Confirmation and Alert Modal', () => {
  it('STUDENT: renders modal for workout completion or deletion and resolves true when confirmed', async () => {
    let result: boolean | null = null;

    render(
      <ConfirmProvider>
        <TestComponent
          title="اتمام جلسه تمرین"
          message="آیا تمرین امروز شما به پایان رسیده است؟ جلسه به‌عنوان «کامل‌شده» ذخیره می‌شود."
          variant="primary"
          confirmText="ثبت و پایان"
          cancelText="ادامه تمرین"
          onResult={(r) => {
            result = r;
          }}
        />
      </ConfirmProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'باز کردن مودال' }));

    // Modal dialog is open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('اتمام جلسه تمرین')).toBeInTheDocument();
    expect(screen.getByText(/آیا تمرین امروز شما به پایان رسیده است؟/)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'ثبت و پایان' });
    expect(confirmBtn).toHaveClass('confirm-modal__btn--primary');

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(result).toBe(true);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('COACH: renders modal for student deletion with danger variant and resolves false when cancelled', async () => {
    let result: boolean | null = null;

    render(
      <ConfirmProvider>
        <TestComponent
          title="حذف شاگرد"
          message="شاگرد «علی رضایی» و برنامهٔ او حذف شود؟ این کار برگشت ندارد."
          variant="danger"
          confirmText="حذف شاگرد"
          cancelText="انصراف"
          onResult={(r) => {
            result = r;
          }}
        />
      </ConfirmProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'باز کردن مودال' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'حذف شاگرد' })).toBeInTheDocument();
    expect(screen.getByText(/شاگرد «علی رضایی»/)).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: 'انصراف' });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(result).toBe(false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('ADMIN: renders modal for coach password reset with warning variant and closes on Escape', async () => {
    let result: boolean | null = null;

    render(
      <ConfirmProvider>
        <TestComponent
          title="ساخت مجدد رمز عبور مربی"
          message="رمز جدید برای «مربی تست» دوباره ساخته شود؟ با رمز قبلی دیگر نمی‌تواند وارد شود."
          variant="warning"
          confirmText="ساخت رمز جدید"
          cancelText="انصراف"
          onResult={(r) => {
            result = r;
          }}
        />
      </ConfirmProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'باز کردن مودال' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('ساخت مجدد رمز عبور مربی')).toBeInTheDocument();

    // Press Escape key
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(result).toBe(false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('Universal confirmModal helper automatically detects delete keyword and formats danger modal', async () => {
    let result: boolean | null = null;

    function DirectHelperComponent() {
      return (
        <button
          type="button"
          onClick={async () => {
            const res = await confirmModal('آیا جلسهٔ «سینه و بازو» حذف شود؟');
            result = res;
          }}
        >
          حذف مستقیم
        </button>
      );
    }

    render(
      <ConfirmProvider>
        <DirectHelperComponent />
      </ConfirmProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'حذف مستقیم' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('تأیید حذف')).toBeInTheDocument();
    expect(screen.getByText('آیا جلسهٔ «سینه و بازو» حذف شود؟')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف' })).toHaveClass('confirm-modal__btn--danger');

    // Confirm
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));

    await waitFor(() => {
      expect(result).toBe(true);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
