import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GymProvider } from '../context/GymProvider';
import { SessionProvider } from '../context/SessionContext';
import { AiHub } from './AiHub';

function planResponse(features: string[]) {
  const list = features.map((key) => ({ key, label: key }));
  return {
    planId: 'independent',
    plan: { id: 'independent', title: 'پلن استقلال', tagline: '', priceTomans: 99000, periodDays: 30, audience: 'independent', features: list },
    features,
    subscriptionActive: true,
    expiresAt: null,
    daysLeft: 30,
    priceTomans: 99000,
    cardTransferAvailable: true,
    plans: [],
  };
}

/** The plan decides which parts of the app are open; the tests open the smart parts. */
function stubPlanApi(features: string[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/me/plan')) {
      return new Response(JSON.stringify(planResponse(features)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'not mocked' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }));
}

async function renderAiHub() {
  const result = render(
    <BrowserRouter>
      <GymProvider>
        <SessionProvider>
          <AiHub />
        </SessionProvider>
      </GymProvider>
    </BrowserRouter>,
  );
  // The plan of the account decides whether the hub is open, so the page arrives one tick
  // later than the render.
  await screen.findByRole('heading', { level: 2, name: /مغز هوشمند میتی/ });
  return result;
}

describe('AiHub Super-App Experience', () => {
  beforeEach(() => stubPlanApi(['ai_hub', 'nutrition', 'smart_program', 'exercise_guide', 'progress_report']));
  afterEach(() => vi.unstubAllGlobals());

  it('renders the AI Hub heading and tab controls', async () => {
    await renderAiHub();
    expect(screen.getByRole('heading', { level: 2, name: /مغز هوشمند میتی/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /ریکاوری و فیزیولوژی/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /نقشه عضلات/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /مفاصل و آسیب‌ها/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /تغذیه رفتاری/ })).toBeDefined();
  });

  it('displays Whoop & Oura readiness score and allows simulating sync', async () => {
    await renderAiHub();
    expect(screen.getByText('آمادگی روز')).toBeDefined();
    expect(screen.getByText(/اتصال واقعی به ساعت یا حلقه وجود ندارد/)).toBeInTheDocument();
    expect(screen.getByText('دادهٔ نمونهٔ اولیه')).toBeInTheDocument();
    expect(screen.getByText(/شبیه‌سازی Whoop/)).toBeDefined();
    expect(screen.getByText(/شبیه‌سازی Oura/)).toBeDefined();

    // Click Whoop sync
    fireEvent.click(screen.getByText(/شبیه‌سازی Whoop/));
    expect(screen.getByText(/دادهٔ شبیه‌سازی‌شده \(whoop\)/)).toBeDefined();
  });

  it('switches to Fitbod muscle recovery tab and shows all muscle zones', async () => {
    await renderAiHub();
    const muscleTab = screen.getByRole('tab', { name: /نقشه عضلات/ });
    fireEvent.click(muscleTab);

    expect(screen.getByText('نقشه حرارتی و وضعیت ریکاوری عضلات')).toBeDefined();
    expect(screen.getByText('سینه')).toBeDefined();
    expect(screen.getByText('پشت و زیربغل')).toBeDefined();
    expect(screen.getByText('چهارسر ران و ساق')).toBeDefined();
  });

  it('switches to Hinge Health joint prehab tab and toggles joint concerns', async () => {
    await renderAiHub();
    const hingeTab = screen.getByRole('tab', { name: /مفاصل و آسیب‌ها/ });
    fireEvent.click(hingeTab);

    expect(screen.getByText(/سیستم مراقبت مفاصل و فیزیوتراپی/)).toBeDefined();
    const kneeButton = screen.getByRole('button', { name: /مفصل زانو و کشکک/ });
    fireEvent.click(kneeButton);

    // Expect knee routine to appear
    expect(screen.getByText(/روتین تخصصی: مفصل زانو و کشکک/)).toBeDefined();
    expect(screen.getByText(/Spanish Squat Hold/)).toBeDefined();
  });

  it('switches to Noom mindful nutrition tab and logs a mindful eating check-in', async () => {
    await renderAiHub();
    const noomTab = screen.getByRole('tab', { name: /تغذیه رفتاری/ });
    fireEvent.click(noomTab);

    expect(screen.getByText(/هوشمندی و رفتارشناسی تغذیه/)).toBeDefined();
    expect(screen.getByText(/سبز \(چگالی کالری پایین\)/)).toBeDefined();

    const input = screen.getByPlaceholderText(/مثلاً سالاد فصل، سیب، یا شکلات صبحانه.../);
    fireEvent.change(input, { target: { value: 'سیب قرمز' } });

    const submitBtn = screen.getByRole('button', { name: /تحلیل و ثبت هوشمند/ });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/بینش روانشناسی Noom:/)).toBeDefined();
  });

  it('does not show default 190 BPM or target zones as personal measurements', async () => {
    await renderAiHub();
    fireEvent.click(screen.getByRole('tab', { name: /پایش قلب و بیومتریک/ }));
    expect(screen.getByText('سن یا ضربان بیشینه ثبت نشده است')).toBeInTheDocument();
    expect(screen.getByText(/برای نمایش زون‌ها، مربی باید سن/)).toBeInTheDocument();
    expect(screen.queryByText('۱۹۰')).not.toBeInTheDocument();
  });

});
