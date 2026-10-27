import { useEffect, useRef } from 'react';

/** Keep keyboard focus inside an open dialog and restore it to its opener on close. */
export function useModalFocus(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector));
    (dialog.querySelector<HTMLElement>('[data-initial-focus]') ?? focusable()[0] ?? dialog).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) {
          event.preventDefault();
          dialog?.focus();
        } else if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  return dialogRef;
}
