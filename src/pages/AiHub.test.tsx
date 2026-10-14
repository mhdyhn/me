import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GymProvider } from '../context/GymProvider';
import { SessionProvider } from '../context/SessionContext';
import { AiHub } from './AiHub';

function renderAiHub() {
  return render(
    <BrowserRouter>
      <GymProvider>
        <SessionProvider>
          <AiHub />
        </SessionProvider>
      </GymProvider>
    </BrowserRouter>,
  );
}

describe('AiHub Super-App Experience', () => {
  it('renders the AI Hub heading and tab controls', () => {
    renderAiHub();
    expect(screen.getByRole('heading', { level: 2, name: /مغز هوشمند میتی/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /ریکاوری و فیزیولوژی/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /نقشه عضلات/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /مفاصل و آسیب‌ها/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /تغذیه رفتاری/ })).toBeDefined();
  });

  it('displays Whoop & Oura readiness score and allows simulating sync', () => {
    renderAiHub();
    expect(screen.getByText('آمادگی روز')).toBeDefined();
    expect(screen.getByText(/همگام‌سازی Whoop/)).toBeDefined();
    expect(screen.getByText(/همگام‌سازی Oura/)).toBeDefined();

    // Click Whoop sync
    fireEvent.click(screen.getByText(/همگام‌سازی Whoop/));
    expect(screen.getByText(/همگام‌شده با Whoop 4.0/)).toBeDefined();
  });

  it('switches to Fitbod muscle recovery tab and shows all muscle zones', () => {
    renderAiHub();
    const muscleTab = screen.getByRole('tab', { name: /نقشه عضلات/ });
    fireEvent.click(muscleTab);

    expect(screen.getByText('نقشه حرارتی و وضعیت ریکاوری عضلات')).toBeDefined();
    expect(screen.getByText('سینه')).toBeDefined();
    expect(screen.getByText('پشت و زیربغل')).toBeDefined();
    expect(screen.getByText('چهارسر ران و ساق')).toBeDefined();
  });

  it('switches to Hinge Health joint prehab tab and toggles joint concerns', () => {
    renderAiHub();
    const hingeTab = screen.getByRole('tab', { name: /مفاصل و آسیب‌ها/ });
    fireEvent.click(hingeTab);

    expect(screen.getByText(/سیستم مراقبت مفاصل و فیزیوتراپی/)).toBeDefined();
    const kneeButton = screen.getByRole('button', { name: /مفصل زانو و کشکک/ });
    fireEvent.click(kneeButton);

    // Expect knee routine to appear
    expect(screen.getByText(/روتین تخصصی: مفصل زانو و کشکک/)).toBeDefined();
    expect(screen.getByText(/Spanish Squat Hold/)).toBeDefined();
  });

  it('switches to Noom mindful nutrition tab and logs a mindful eating check-in', () => {
    renderAiHub();
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
});
