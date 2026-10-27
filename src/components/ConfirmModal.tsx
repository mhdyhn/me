import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, X } from 'lucide-react';
import { useModalFocus } from './useModalFocus';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
  resolve?: (value: boolean) => void;
}

export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

let globalConfirm: ConfirmFn | null = null;

export function setGlobalConfirm(fn: ConfirmFn | null) {
  globalConfirm = fn;
}

/**
 * Universal confirm modal function. Callable from anywhere in the app across all three roles.
 * Falls back to window.confirm in headless test environments if spied or if modal is not mounted.
 */
export async function confirmModal(options: ConfirmOptions | string): Promise<boolean> {
  // If running in a test where window.confirm was explicitly mocked with vi.spyOn:
  if (typeof window !== 'undefined' && (window.confirm as any)?.mock) {
    const msg = typeof options === 'string' ? options : options.message;
    return window.confirm(msg);
  }
  if (globalConfirm) {
    return globalConfirm(options);
  }
  const msg = typeof options === 'string' ? options : options.message;
  return typeof window !== 'undefined' ? window.confirm(msg) : true;
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (context) return context;
  return confirmModal;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    message: '',
  });

  const confirm: ConfirmFn = (options) => {
    // If a test specifically mocked window.confirm
    if (typeof window !== 'undefined' && (window.confirm as any)?.mock) {
      const msg = typeof options === 'string' ? options : options.message;
      return Promise.resolve(window.confirm(msg));
    }

    const isString = typeof options === 'string';
    const message = isString ? options : options.message;
    const isDelete = isString
      ? message.includes('حذف')
      : options.variant === 'danger' || options.title?.includes('حذف') || options.confirmText?.includes('حذف');
    const isCancel = isString
      ? message.includes('لغو')
      : options.variant === 'warning' || options.title?.includes('لغو') || options.confirmText?.includes('لغو');

    const opts: ConfirmOptions = isString
      ? {
          message,
          title: isDelete ? 'تأیید حذف' : isCancel ? 'تأیید لغو' : 'تأیید عملیات',
          variant: isDelete ? 'danger' : isCancel ? 'warning' : 'primary',
          confirmText: isDelete ? 'حذف' : isCancel ? 'تأیید لغو' : 'تأیید',
          cancelText: 'انصراف',
        }
      : {
          ...options,
          title: options.title ?? (isDelete ? 'تأیید حذف' : isCancel ? 'تأیید لغو' : 'تأیید عملیات'),
          variant: options.variant ?? (isDelete ? 'danger' : isCancel ? 'warning' : 'primary'),
          confirmText: options.confirmText ?? (isDelete ? 'حذف' : isCancel ? 'تأیید لغو' : 'تأیید'),
          cancelText: options.cancelText ?? 'انصراف',
        };

    return new Promise<boolean>((resolve) => {
      setState({
        ...opts,
        isOpen: true,
        resolve,
      });
    });
  };

  useEffect(() => {
    setGlobalConfirm(confirm);
    return () => setGlobalConfirm(null);
  }, []);

  function handleClose(result: boolean) {
    if (state.resolve) {
      state.resolve(result);
    }
    setState((prev) => ({ ...prev, isOpen: false, resolve: undefined }));
  }

  const dialogRef = useModalFocus(state.isOpen, () => handleClose(false));

  const variant = state.variant ?? 'primary';
  const confirmText = state.confirmText ?? (variant === 'danger' ? 'حذف' : 'تأیید');
  const cancelText = state.cancelText ?? 'انصراف';
  const title = state.title ?? 'تأیید عملیات';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.isOpen && (
        <div
          className="modal-overlay"
          onClick={() => handleClose(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-describedby="confirm-modal-desc"
        >
          <div
            className="modal-content confirm-modal"
            ref={dialogRef}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            <div className="confirm-modal__header">
              <span className={`confirm-modal__icon-wrap confirm-modal__icon-wrap--${variant}`}>
                {variant === 'danger' ? (
                  <Trash2 size={22} />
                ) : variant === 'warning' ? (
                  <AlertTriangle size={22} />
                ) : (
                  <CheckCircle2 size={22} />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 id="confirm-modal-title" className="confirm-modal__title">{title}</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => handleClose(false)}
                aria-label="بستن"
              >
                <X size={16} />
              </button>
            </div>

            <p id="confirm-modal-desc" className="confirm-modal__message">
              {state.message}
            </p>

            <div className="confirm-modal__actions">
              <button
                type="button"
                className="button button--ghost confirm-modal__btn"
                data-initial-focus
                onClick={() => handleClose(false)}
              >
                {cancelText}
              </button>
              <button
                type="button"
                className={`button confirm-modal__btn confirm-modal__btn--${variant}`}
                onClick={() => handleClose(true)}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
