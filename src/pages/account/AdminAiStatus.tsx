import { useEffect, useState } from 'react';
import { Brain, ShieldCheck } from 'lucide-react';
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

  useEffect(() => {
    api<AiState>('GET', '/admin/ai').then(setState).catch(() => setState({ enabled: false, model: '', reason: 'وضعیت هوش مصنوعی در دسترس نیست.' }));
  }, []);

  if (!state) return null;

  return (
    <section className="panel-card admin-ai-status" aria-label="هوش مصنوعی داخلی">
      <header>
        <h3><Brain size={17} /> هوش مصنوعی داخلی</h3>
        <span className={`admin-card-transfer__status ${state.enabled ? 'is-on' : 'is-off'}`}>
          {state.enabled ? <><ShieldCheck size={14} /> فعال</> : 'غیرفعال'}
        </span>
      </header>
      <p className="account-muted">
        هوش مصنوعی پشت‌صحنه کار می‌کند: متنِ گزارش‌ها و جمع‌بندی‌ها را بهتر می‌نویسد و شاگرد و مربی چیزی نمی‌بینند جز خودِ متن.
        اگر خاموش باشد، برنامه همان متن‌های قاعده‌محور خودش را می‌نویسد و هیچ چیزی خراب نمی‌شود.
      </p>
      <p className="account-muted">
        {state.enabled
          ? <>مدل فعال: <code dir="ltr">{state.model}</code> — فقط عددها و برچسب‌های بی‌نام به سرویس فرستاده می‌شود، نه نام و پیامِ کاربران.</>
          : <>برای روشن‌کردن: در Render سه متغیر <code dir="ltr">AI_API_KEY</code>، <code dir="ltr">AI_BASE_URL</code> و <code dir="ltr">AI_MODEL</code> را بسازید. {state.reason}</>}
      </p>
    </section>
  );
}
