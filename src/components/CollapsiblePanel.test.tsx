import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CollapsiblePanel } from './CollapsiblePanel';

afterEach(cleanup);

describe('a panel that folds away', () => {
  it('shows only the title until it is opened', () => {
    render(
      <CollapsiblePanel title="رسیدهای کارت‌به‌کارت" subtitle="با یک کلیک تأیید می‌شود" icon={<span>آ</span>}>
        <p>محتوای بخش</p>
      </CollapsiblePanel>
    );
    const head = screen.getByRole('button', { name: /رسیدهای کارت‌به‌کارت/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    // The content of a folded section is not in the page at all.
    expect(screen.queryByText('محتوای بخش')).toBeNull();

    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('محتوای بخش')).toBeTruthy();
  });

  it('starts open when it is told to', () => {
    render(
      <CollapsiblePanel title="بخش باز" defaultOpen>
        <p>محتوای بخش</p>
      </CollapsiblePanel>
    );
    expect(screen.getByRole('button', { name: /بخش باز/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('محتوای بخش')).toBeTruthy();
  });

  it('folds away again when the title is pressed a second time', () => {
    render(
      <CollapsiblePanel title="بخش" defaultOpen>
        <p>محتوای بخش</p>
      </CollapsiblePanel>
    );
    const head = screen.getByRole('button', { name: /بخش/ });
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('محتوای بخش')).toBeNull();
  });

  it('tells the parent when it is folded or unfolded', () => {
    const onToggle = vi.fn();
    render(
      <CollapsiblePanel title="بخش" onToggle={onToggle}>
        <p>محتوای بخش</p>
      </CollapsiblePanel>
    );
    fireEvent.click(screen.getByRole('button', { name: /بخش/ }));
    expect(onToggle).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /بخش/ }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('keeps the state the parent gives it', () => {
    const { rerender } = render(
      <CollapsiblePanel title="بخش" open={false}>
        <p>محتوای بخش</p>
      </CollapsiblePanel>
    );
    expect(screen.queryByText('محتوای بخش')).toBeNull();
    rerender(
      <CollapsiblePanel title="بخش" open>
        <p>محتوای بخش</p>
      </CollapsiblePanel>
    );
    expect(screen.getByText('محتوای بخش')).toBeTruthy();
  });

  it('shows the count on the title', () => {
    render(
      <CollapsiblePanel title="رسیدها" badge="۳">
        <p>محتوای بخش</p>
      </CollapsiblePanel>
    );
    expect(screen.getByText('۳')).toBeTruthy();
  });
});
