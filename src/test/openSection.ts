import { fireEvent, screen } from '@testing-library/react';

/**
 * Opens a folded section of the admin or coach panel.
 *
 * The big sections fold away so the panel stays short; a test that wants to work with
 * what is inside opens the section first, the same way the manager does.
 */
export function openSection(title: string | RegExp) {
  const head = screen.getByRole('button', { name: title });
  if (head.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(head);
  }
  return head;
}

/** True when the section with this title is open. */
export function isSectionOpen(title: string | RegExp): boolean {
  return screen.getByRole('button', { name: title }).getAttribute('aria-expanded') === 'true';
}
