import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * A panel that folds away.
 *
 * The admin panel and the coach panel have grown many sections, and each one takes a
 * screenful of space even when it is not what the person came for. This component folds
 * a section into its title, so the panel stays short and the work area is only what is
 * open. The state is kept in the parent, so a section the person opened stays open.
 */
export function CollapsiblePanel({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  open,
  onToggle,
  badge,
  children,
  className = '',
  headingId,
}: {
  /** The title of the section, always visible. */
  title: string;
  /** A short line under the title. */
  subtitle?: string;
  /** The icon of the title. */
  icon?: ReactNode;
  /** Whether the section starts open; ignored when `open` is given. */
  defaultOpen?: boolean;
  /** The state of the section, when the parent keeps it. */
  open?: boolean;
  /** Called when the section is folded or unfolded. */
  onToggle?: (next: boolean) => void;
  /** A short note on the title, for example a count. */
  badge?: ReactNode;
  /** What is inside the panel. */
  children: ReactNode;
  /** Extra class for the panel. */
  className?: string;
  /** The id of the heading, for the aria link of the button. */
  headingId?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  function toggle() {
    const next = !isOpen;
    if (open === undefined) setInternalOpen(next);
    onToggle?.(next);
  }

  return (
    <section className={`collapsible-panel${isOpen ? ' is-open' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="collapsible-panel__head"
        aria-expanded={isOpen}
        aria-controls={headingId ? `${headingId}-body` : undefined}
        onClick={toggle}
      >
        {icon && <span className="collapsible-panel__icon">{icon}</span>}
        <span className="collapsible-panel__text">
          <strong id={headingId}>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        {badge !== undefined && <span className="collapsible-panel__badge">{badge}</span>}
        <span className="collapsible-panel__chevron" aria-hidden="true">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>
      {isOpen && (
        <div className="collapsible-panel__body" id={headingId ? `${headingId}-body` : undefined}>
          {children}
        </div>
      )}
    </section>
  );
}
