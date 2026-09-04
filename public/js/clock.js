// The corner clock. Hours and minutes only — seconds would fidget on a page
// you glance at. A <time> element, so the reading stays machine-legible.

export function mountTopbarClock(root) {
  const paint = () => {
    const now = new Date();
    root.textContent =
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    root.setAttribute('datetime', now.toISOString());
  };

  paint();
  // One cheap write per minute rather than ticking every second.
  const schedule = () => {
    const now = new Date();
    const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
    setTimeout(() => { paint(); schedule(); }, delay);
  };
  schedule();
}
