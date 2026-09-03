// The Start view's centrepiece. Same type as the timer readout, so switching
// tabs swaps what the big number means rather than introducing a second voice.
// Hours and minutes only — seconds would fidget on a page you glance at.

export function mountClock(root) {
  root.innerHTML = `
    <p class="readout clock" role="timer" aria-live="off">
      <span class="digits"></span><span class="colon">:</span><span class="digits-2"></span>
    </p>`;

  const hours = root.querySelector('.digits');
  const mins = root.querySelector('.digits-2');

  const paint = () => {
    const now = new Date();
    hours.textContent = String(now.getHours()).padStart(2, '0');
    mins.textContent = String(now.getMinutes()).padStart(2, '0');
  };

  paint();
  setInterval(paint, 1000);
}
