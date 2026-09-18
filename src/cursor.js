// The native pointer stays immediate; only the decorative ring trails behind it.
export function initCursor() {
  const pointer = matchMedia('(hover: hover) and (pointer: fine) and (forced-colors: none)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('showPopover' in HTMLElement.prototype)) return;

  const layer = document.createElement('div');
  layer.className = 'cursor-layer';
  layer.setAttribute('popover', 'manual');
  layer.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('span');
  ring.className = 'cursor-ring';
  layer.append(ring);
  document.body.append(layer);

  const controls = 'a[href], button, summary, select, label, input[type="checkbox"], input[type="radio"], input[type="file"], [role="button"]';
  const fields = 'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]), [contenteditable]:not([contenteditable="false"])';
  let frame = 0, visible = false, dialog = null;
  let x = 0, y = 0, targetX = 0, targetY = 0;
  const allowed = () => pointer.matches && !reduced.matches && !document.hidden;

  function hide() {
    cancelAnimationFrame(frame);
    frame = 0;
    visible = false;
    for (const animation of layer.getAnimations({subtree: true})) animation.cancel();
    layer.querySelectorAll('.cursor-ripple').forEach(ripple => ripple.remove());
    if (layer.matches(':popover-open')) layer.hidePopover();
  }

  function draw() {
    x += (targetX - x) * .24;
    y += (targetY - y) * .24;
    ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    frame = Math.hypot(targetX - x, targetY - y) > .2 ? requestAnimationFrame(draw) : 0;
  }

  document.addEventListener('pointermove', event => {
    if (!allowed() || event.pointerType !== 'mouse' || !(event.target instanceof Element) || event.target.closest(fields)) {
      hide();
      return;
    }
    targetX = event.clientX;
    targetY = event.clientY;
    const activeDialog = document.querySelector('dialog[open]');
    if (dialog !== activeDialog) {
      hide();
      dialog = activeDialog;
    }
    if (!visible) {
      x = targetX;
      y = targetY;
      ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      // Reopening puts this manual popover above a newly opened dialog.
      layer.showPopover();
      visible = true;
    }
    const control = event.target.closest(controls);
    ring.classList.toggle('is-interactive', !!control && !control.matches(':disabled, [aria-disabled="true"]'));
    if (!frame) frame = requestAnimationFrame(draw);
  }, {passive: true});

  document.addEventListener('pointerdown', event => {
    if (!allowed() || !visible || event.pointerType !== 'mouse' || event.button !== 0) return;
    const ripple = document.createElement('span');
    ripple.className = 'cursor-ripple';
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    layer.append(ripple);
    const animation = ripple.animate([
      {transform: 'translate(-50%, -50%) scale(.35)', opacity: .7},
      {transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0},
    ], {duration: 430, easing: 'cubic-bezier(.2,.7,.3,1)'});
    animation.finished.catch(() => {}).finally(() => ripple.remove());
  }, {passive: true});

  document.addEventListener('pointerout', event => { if (!event.relatedTarget) hide(); });
  document.addEventListener('keydown', hide);
  document.addEventListener('scroll', hide, {passive: true, capture: true});
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('blur', hide);
  pointer.addEventListener('change', hide);
  reduced.addEventListener('change', hide);
}
