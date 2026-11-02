import { useEffect, useState } from 'react';
import { Brain, ShieldCheck } from 'lucide-react';
import { CollapsiblePanel } from '../../components/CollapsiblePanel';
import { api } from '../../lib/api';

interface AiState {
  enabled: boolean;
  model: string;
  reason: string | null;
}

/**
 * The status of the internal AI of the club.
 *
 * The AI is an invisible helper: it writes the sentences the app would have written
 * anyway. The panel only says whether it is on, so the manager knows what to expect.
 */
export function AdminAiStatus() {
  const [state, setState] = useState<AiState | null>(null);

  // The status is fetched the first time the section is opened, not when the panel loads.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!opened) return;
    api<AiState>('GET', '/admin/ai').then(setState).catch(() => setState({ enabled: false, model: '', reason: 'وضعیت هوش مصنوعی در دسترس نیست.' }));
  }, [opened]);

  return (
    <CollapsiblePanel
      title="هوش مصنوعی داخلی"
      subtitle="یک دستیار پشت‌صحنه است، نه چتِ کاربر"
      icon={<Brain size={18} />}
      headingId="admin-ai-status-heading"
      onToggle={(next) => { if (next) setOpened(true); }}
      badge={state ? (
        <span className={`admin-card-transfer__status ${state.enabled ? 'is-on' : 'is-off'}`}>
          {state.enabled ? <><ShieldCheck size={14} /> فعال</> : 'غیرفعال'}
        </span>
      ) : undefined}
    >
      {!state && <p className="account-muted" role="status">در حال خواندنِ وضعیت…</p>}
      {state && <p className="account-muted">
        هوش مصنوعی پشت‌صحنه کار می‌کند: متنِ گزارش‌ها و جمع‌بندی‌ها را بهتر می‌نویسد و شاگرد و مربی چیزی نمی‌بینند جز خودِ متن.
        اگر خاموش باشد، برنامه همان متن‌های قاعده‌محور خودش را می‌نویسد و هیچ چیزی خراب نمی‌شود.
      </p>}
      {state && <p className="account-muted">
        {state.enabled
          ? <>مدل فعال: <code dir="ltr">{state.model}</code> — فقط عددها و برچسب‌های بی‌نام به سرویس فرستاده می‌شود، نه نام و پیامِ کاربران.</>
          : <>برای روشن‌کردن: در Render سه متغیر <code dir="ltr">AI_API_KEY</code>، <code dir="ltr">AI_BASE_URL</code> و <code dir="ltr">AI_MODEL</code> را بسازید. {state.reason}</>}
      </p>}
    </CollapsiblePanel>
  );
}
