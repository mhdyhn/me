import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../lib/api';

interface InsightView {
  text: string;
  source: 'ai' | 'rules';
}

/**
 * The smart line of the progress page: one Persian sentence about the last month.
 *
 * The sentence is written by the app itself and, when the club has an AI service, by the
 * internal model. The reader only sees the sentence.
 */
export function SmartInsight() {
  const [insight, setInsight] = useState<InsightView | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ insight: InsightView }>('GET', '/me/insight')
      .then((result) => {
        if (alive && result.insight?.text) setInsight(result.insight);
      })
      .catch(() => {
        // The line is a bonus; the page works without it.
      });
    return () => { alive = false; };
  }, []);

  if (!insight) return null;

  return (
    <p className="smart-insight">
      <Sparkles size={15} aria-hidden="true" />
      <span>{insight.text}</span>
    </p>
  );
}
