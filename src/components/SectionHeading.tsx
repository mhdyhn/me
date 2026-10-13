import type { ReactNode } from 'react';

export function SectionHeading({ eyebrow, title, action, description }: { eyebrow?: string; title: string; action?: ReactNode; description?: string }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </div>
  );
}
