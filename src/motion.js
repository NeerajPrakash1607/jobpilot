// Motion acknowledges completed actions; reduced motion and hidden tabs cancel it.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const active = new Set();
const canMove = () => !reducedMotion.matches && !document.hidden;

function play(element, frames, options, cleanup = () => {}) {
  if (!canMove()) { cleanup(); return; }
  const animation = element.animate(frames, options);
  active.add(animation);
  animation.finished.catch(() => {}).finally(() => {
    active.delete(animation);
    cleanup();
  });
  return animation;
}

function cancelMotion() { for (const animation of active) animation.cancel(); }
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) cancelMotion(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelMotion(); });

let searchAnimation;
export function searchTakeoff() {
  searchAnimation?.cancel();
  const pilot = document.querySelector('.pilot-mascot');
  if (!pilot) return;
  searchAnimation = play(pilot, [
    {transform:'translate(0, 0) rotate(0deg)'},
    {transform:'translate(-7px, 4px) rotate(-10deg)',offset:.25},
    {transform:'translate(9px, -9px) rotate(7deg)',offset:.6},
    {transform:'translate(0, 0) rotate(0deg)'},
  ], {duration:650,easing:'cubic-bezier(.2,.8,.3,1)'});
}

export function flyToApplications(button) {
  if (!canMove() || document.querySelector('dialog[open]')) return;
  const target = [...document.querySelectorAll('nav [data-nav="queue"]')]
    .find(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  if (!target) return;
  const from = button.getBoundingClientRect(), to = target.getBoundingClientRect();
  const x = to.x + to.width / 2 - from.x - from.width / 2;
  const y = to.y + to.height / 2 - from.y - from.height / 2;
  const plane = document.createElement('img');
  plane.src = '/assets/pilot.png'; plane.alt = ''; plane.className = 'flying-save';
  plane.setAttribute('aria-hidden','true');
  plane.style.left = `${from.x + from.width / 2 - 25}px`;
  plane.style.top = `${from.y + from.height / 2 - 25}px`;
  document.body.append(plane);
  play(plane, [
    {transform:'translate(0,0) scale(.5) rotate(-12deg)',opacity:0},
    {transform:'translate(0,-12px) scale(1) rotate(-12deg)',opacity:1,offset:.18},
    {transform:`translate(${x*.5}px,${y*.5-45}px) scale(.85) rotate(4deg)`,opacity:1,offset:.6},
    {transform:`translate(${x}px,${y}px) scale(.2) rotate(12deg)`,opacity:0},
  ], {duration:650,easing:'cubic-bezier(.2,.7,.3,1)'}, () => plane.remove());
  play(target, [{transform:'scale(1)'},{transform:'scale(1.045)'},{transform:'scale(1)'}],
    {delay:450,duration:320,easing:'ease-out'});
}
