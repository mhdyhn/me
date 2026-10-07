import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3D exercise asset failed to load.', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="model-error-fallback" role="alert">
          <AlertTriangle size={22} />
          <strong>بارگذاری مدل سه‌بعدی ناموفق بود</strong>
          <p>فایل GLB را بررسی و دوباره تلاش کنید. راهنمای نوشتاری و آماده‌سازی حرکت همچنان در دسترس است.</p>
          <button className="button button--quiet button--small" onClick={() => window.location.reload()}><RotateCcw size={14} /> بارگذاری دوبارهٔ مدل</button>
        </div>
      );
    }
    return <div className="model-canvas-boundary">{this.props.children}</div>;
  }
}
