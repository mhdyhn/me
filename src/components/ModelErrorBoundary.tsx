import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** The GLB the canvas was asked for; used only to report what the request returned. */
  asset?: string;
  /** Asked for a fresh load; without it the fallback can only reload the page. */
  onRetry?: () => void;
}
interface State { hasError: boolean; report: string | null; cleaning: boolean }

/** First bytes of a GLB are its magic and version, so a short read is enough to tell a real
 * model response from an error page that a cache or proxy handed back instead. */
async function probeAsset(asset: string): Promise<string> {
  const response = await fetch(asset, { headers: { range: 'bytes=0-11' } });
  const bytes = new Uint8Array(await response.arrayBuffer()).slice(0, 4);
  const head = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('').replace(/[^\x20-\x7e]/g, '.');
  return `${response.status} ${response.statusText} · ${response.headers.get('content-type') ?? 'no content-type'} · ${response.headers.get('content-length') ?? '?'} bytes · head "${head}"`;
}

/** What the browser itself can do: a model that fails on one device and not another is
 * almost always missing WebAssembly (meshopt), a WebGL context, or a stale cached copy. */
async function describeCapabilities(): Promise<string> {
  let wasm = 'yes';
  try {
    if (typeof WebAssembly !== 'object') wasm = 'no WebAssembly';
    else new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  } catch (error) {
    wasm = `blocked: ${error instanceof Error ? error.name : String(error)}`;
  }
  let gl = 'no canvas';
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!context) gl = 'no WebGL context';
    else {
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      gl = String((debug && context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) || context.getParameter(context.VERSION));
    }
  } catch (error) {
    gl = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  let webp = 'unknown';
  try {
    webp = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp') ? 'yes' : 'no';
  } catch {
    webp = 'unavailable';
  }
  let worker = 'none';
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    worker = navigator.serviceWorker?.controller?.scriptURL
      ?? (registration ? `registered, not controlling (${registration.active?.scriptURL ?? '?'})` : 'none');
  } catch (error) {
    worker = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  return `wasm: ${wasm}\nwebgl: ${gl}\nwebp: ${webp}\nservice worker: ${worker}`;
}

/** A cached model response survives a reload, so recovery has to clear the caches the page
 * itself put there before asking for the file again. */
async function clearCaches(): Promise<void> {
  const registrations = await navigator.serviceWorker?.getRegistrations?.();
  await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, report: null, cleaning: false };

  static getDerivedStateFromError(): State { return { hasError: true, report: null, cleaning: false }; }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('3D exercise asset failed to load.', error, info.componentStack);
    if (!import.meta.env.DEV) return;
    // The canvas has no console the reader can reach, so in development the reason is both
    // painted next to the fallback and posted to the dev server, which prints it in the log.
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    void (async () => {
      const [probe, capabilities] = await Promise.all([
        this.props.asset
          ? probeAsset(this.props.asset).catch((error: unknown) => `probe failed: ${error instanceof Error ? error.message : String(error)}`)
          : Promise.resolve('no asset'),
        describeCapabilities().catch(() => 'capability probe failed'),
      ]);
      const report = `asset: ${this.props.asset ?? 'unknown'}\nrequest: ${probe}\n${capabilities}\nreason: ${reason}\n${error instanceof Error ? error.stack ?? '' : ''}`;
      this.setState({ report });
      try {
        await fetch('/__model-error', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: report });
      } catch {
        /* Reporting is best effort; the fallback below is the source of truth. */
      }
    })();
  }

  private retry = async (clean: boolean) => {
    if (clean) {
      this.setState({ cleaning: true });
      try {
        await clearCaches();
      } catch {
        /* Clearing is best effort; the reload below still asks the network. */
      }
    }
    if (this.props.onRetry) this.props.onRetry();
    else window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="model-error-fallback" role="alert">
          <AlertTriangle size={22} />
          <strong>بارگذاری مدل سه‌بعدی ناموفق بود</strong>
          <p>فایل GLB را بررسی و دوباره تلاش کنید. راهنمای نوشتاری و آماده‌سازی حرکت همچنان در دسترس است.</p>
          <div className="model-error-fallback__actions">
            <button className="button button--quiet button--small" disabled={this.state.cleaning} onClick={() => void this.retry(false)}>
              <RotateCcw size={14} /> بارگذاری دوبارهٔ مدل
            </button>
            <button className="button button--quiet button--small" disabled={this.state.cleaning} onClick={() => void this.retry(true)}>
              <RotateCcw size={14} /> پاک‌سازی کش و بارگذاری دوباره
            </button>
          </div>
          {this.state.report ? <pre className="model-error-fallback__report" dir="ltr">{this.state.report}</pre> : null}
        </div>
      );
    }
    return <div className="model-canvas-boundary">{this.props.children}</div>;
  }
}
