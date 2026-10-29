import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Meety UI boundary caught an error.', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="fatal-fallback" role="alert">
        <div className="fatal-fallback__icon"><AlertTriangle size={22} /></div>
        <p className="eyebrow">میتی · خطای قابل بازیابی</p>
        <h1>مشکلی در نمایش این بخش پیش آمد.</h1>
        <p>اطلاعاتی که ذخیره کرده‌ای معمولاً روی دستگاه می‌مانند؛ تغییرات ذخیره‌نشده ممکن است از دست بروند. سپس برنامه را دوباره بارگذاری کن.</p>
        <button className="button button--primary" onClick={() => window.location.reload()}>
          <RefreshCw size={16} /> بارگذاری دوباره
        </button>
      </main>
    );
  }
}
