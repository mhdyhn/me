/**
 * Shown while a lazily loaded route arrives. The shell, the navigation and the
 * header stay on screen, so the app never flashes an empty page on a phone.
 */
export function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="eyebrow">در حال آماده‌سازی</span>
      <div className="route-loading-bars" aria-hidden="true">
        <i /><i /><i />
      </div>
    </div>
  );
}
