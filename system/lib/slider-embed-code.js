const CLASS_NAME = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/;

// Positions (translate offsets in px) a Swiper-like track can rest at, as
// Swiper computes its snap grid: each slide's left edge, clamped so the last
// position shows the end of the track; centered slides center each slide in
// the view; a loop never clamps. Embedded verbatim in the generated script.
function sliderSnaps({ lefts, widths, view, centered = false, loop = false }) {
  if (centered) return lefts.map((left, index) => left - (view - widths[index]) / 2);
  if (loop) return lefts.slice();
  const end = Math.max(0, lefts[lefts.length - 1] + widths[widths.length - 1] - view);
  const snaps = lefts.filter(left => left <= end);
  if (end - snaps[snaps.length - 1] > 1) snaps.push(end);
  return snaps;
}

// The slide Swiper marks active at a resting position: the slide whose left
// edge is nearest, rounding half-way up (Swiper's normalizeSlideIndex). At a
// position clamped to the end this need not be the position's own index.
function sliderActive({ lefts, snap }) {
  let active = 0;
  for (let index = 0; index < lefts.length - 1; index += 1) {
    if (snap >= lefts[index + 1]) { active = index + 1; continue; }
    if (snap >= (lefts[index] + lefts[index + 1]) / 2) active = index + 1;
    break;
  }
  return active;
}

function validTrack(config) {
  const label = value => value === undefined || (typeof value === 'string' && value.length <= 200 && !/[<>]/.test(value));
  return CLASS_NAME.test(config.wrapperClass || '') && Number.isInteger(config.start) && config.start >= 0
    && typeof config.centered === 'boolean' && typeof config.loop === 'boolean'
    && Number.isFinite(config.speed) && config.speed >= 0 && config.speed <= 5000
    && (config.labels === undefined || (config.labels && typeof config.labels === 'object' && label(config.labels.previous) && label(config.labels.next)));
}

function buildSliderEmbedCode(config) {
  const names = ['rootClass', 'itemClass', 'previousClass', 'nextClass'];
  if (!config || !['slides', 'scroll', 'track'].includes(config.mode) || names.some(name => !CLASS_NAME.test(config[name] || '')) || (config.bulletClass && !CLASS_NAME.test(config.bulletClass))
    || (config.mode === 'track' && !validTrack(config))) {
    throw new TypeError('SLIDER_CONFIG_INVALID');
  }
  if (config.mode === 'track') return buildTrackCode(config);
  const safe = JSON.stringify(config).replace(/</g, '\\u003c');
  const root = `.${config.rootClass}`;
  const style = config.mode === 'slides' ? `<style>
${root} { visibility: visible !important; }
${root} .t-slds__items-wrapper { width: 100% !important; transform: none !important; }
${root} .${config.itemClass} { display: none !important; width: 100% !important; float: none !important; }
${root} .${config.itemClass}.toolkit-slide-active { display: block !important; }
</style>` : '';
  return `${style}
<script>
(function () {
  'use strict';
  const config = ${safe};
  const bindControl = (element, action) => {
    if (!element) return;
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    element.addEventListener('click', action);
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
    });
  };
  const init = () => document.querySelectorAll('.' + config.rootClass).forEach(root => {
    if (root.dataset.taptopSliderBound === 'true') return;
    root.dataset.taptopSliderBound = 'true';
    const items = [...root.querySelectorAll('.' + config.itemClass)];
    if (items.length < 2) return;
    const previous = root.querySelector('.' + config.previousClass);
    const next = root.querySelector('.' + config.nextClass);
    if (config.mode === 'scroll') {
      const scroller = root.querySelector('.t1196__slider');
      if (!scroller) return;
      const step = () => items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : items[0].offsetWidth;
      bindControl(previous, () => scroller.scrollBy({ left: -step(), behavior: 'smooth' }));
      bindControl(next, () => scroller.scrollBy({ left: step(), behavior: 'smooth' }));
      return;
    }
    root.setAttribute('role', 'region');
    root.setAttribute('aria-roledescription', 'carousel');
    root.setAttribute('tabindex', '0');
    const bullets = config.bulletClass ? [...root.querySelectorAll('.' + config.bulletClass)] : [];
    let index = Math.max(0, items.findIndex(item => item.classList.contains('toolkit-slide-active')));
    const show = nextIndex => {
      index = (nextIndex + items.length) % items.length;
      items.forEach((item, n) => {
        const active = n === index;
        item.classList.toggle('toolkit-slide-active', active);
        item.classList.toggle('t-slds__item_active', active);
        item.setAttribute('aria-hidden', String(!active));
      });
      bullets.forEach((bullet, n) => {
        const active = n === index;
        bullet.classList.toggle('toolkit-bullet-active', active);
        bullet.classList.toggle('t-slds__bullet_active', active);
        const control = bullet.querySelector('button') || bullet;
        if (active) control.setAttribute('aria-current', 'true');
        else control.removeAttribute('aria-current');
      });
    };
    bindControl(previous, () => show(index - 1));
    bindControl(next, () => show(index + 1));
    bullets.forEach((bullet, n) => bindControl(bullet.querySelector('button') || bullet, () => show(n)));
    root.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    });
    let touchX = null;
    root.addEventListener('touchstart', event => { touchX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
    root.addEventListener('touchend', event => {
      if (touchX === null) return;
      const delta = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
      touchX = null;
      if (Math.abs(delta) > 40) show(index + (delta < 0 ? 1 : -1));
    }, { passive: true });
    show(index);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;
}

// A Swiper-structured track (.swiper > .swiper-wrapper > .swiper-slide): the
// slides stay editable layers in a flex row; the script moves the wrapper,
// keeps Swiper's state classes on the slides and disables the arrows at the
// ends. Embed CSS lays out the initial state for the editor canvas; the script
// replaces it with measured positions once it adds toolkit-slider-ready.
function buildTrackCode(config) {
  const safe = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<script>
(function () {
  'use strict';
  const config = ${safe};
  const sliderSnaps = ${sliderSnaps.toString()};
  const sliderActive = ${sliderActive.toString()};
  const init = () => document.querySelectorAll('.' + config.rootClass).forEach(root => {
    if (root.dataset.taptopSliderBound === 'true') return;
    const wrapper = root.querySelector('.' + config.wrapperClass);
    if (!wrapper || !wrapper.parentElement) return;
    const view = wrapper.parentElement;
    const items = [...wrapper.children].filter(item => item.classList.contains(config.itemClass));
    if (items.length < 2) return;
    root.dataset.taptopSliderBound = 'true';
    root.classList.add('toolkit-slider-ready');
    // The classes Swiper puts on its container; Swiper's own CSS depends on them.
    view.classList.add('swiper-initialized', 'swiper-horizontal', 'swiper-backface-hidden');
    const previous = root.querySelector('.' + config.previousClass);
    const next = root.querySelector('.' + config.nextClass);
    view.setAttribute('role', 'region');
    view.setAttribute('aria-roledescription', 'carousel');
    view.setAttribute('tabindex', '0');
    view.style.touchAction = 'pan-y';
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
    wrapper.style.transitionProperty = 'transform';
    let snaps = [0];
    let lefts = [0];
    let index = config.start;
    const measure = () => {
      const style = getComputedStyle(view);
      const width = view.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const first = items[0].offsetLeft;
      lefts = items.map(item => item.offsetLeft - first);
      snaps = sliderSnaps({ lefts, widths: items.map(item => item.offsetWidth), view: width, centered: config.centered, loop: config.loop });
      index = Math.min(Math.max(index, 0), snaps.length - 1);
    };
    const setDisabled = (control, disabled) => {
      if (!control) return;
      control.classList.toggle('swiper-button-disabled', disabled);
      control.setAttribute('aria-disabled', String(disabled));
    };
    const render = animate => {
      wrapper.style.transitionDuration = animate ? config.speed + 'ms' : '0ms';
      wrapper.style.transform = 'translate3d(' + (-snaps[index]) + 'px, 0px, 0px)';
      const active = config.centered || config.loop ? Math.min(index, items.length - 1) : sliderActive({ lefts, snap: snaps[index] });
      items.forEach((item, n) => {
        item.classList.toggle('swiper-slide-active', n === active);
        item.classList.toggle('swiper-slide-prev', n === active - 1);
        item.classList.toggle('swiper-slide-next', n === active + 1);
      });
      setDisabled(previous, !config.loop && index === 0);
      setDisabled(next, !config.loop && index === snaps.length - 1);
    };
    const go = target => {
      const last = snaps.length - 1;
      const wanted = config.loop ? (target + snaps.length) % snaps.length : Math.min(Math.max(target, 0), last);
      if (wanted === index) return;
      index = wanted;
      render(true);
    };
    const bindControl = (element, step, label) => {
      if (!element) return;
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      if (label) element.setAttribute('aria-label', label);
      element.addEventListener('click', event => { event.preventDefault(); go(index + step); });
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(index + step); }
      });
    };
    const labels = config.labels || {};
    bindControl(previous, -1, labels.previous);
    bindControl(next, 1, labels.next);
    view.addEventListener('keydown', event => {
      if (event.target !== view) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
    });
    // Swipe and mouse drag: one step per gesture past 40px; a drag cancels the click it ends with.
    let startX = null;
    let dragged = false;
    view.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) { startX = event.clientX; dragged = false; } });
    view.addEventListener('pointerup', event => {
      if (startX === null) return;
      const delta = event.clientX - startX;
      startX = null;
      if (Math.abs(delta) > 40) { dragged = true; go(index + (delta < 0 ? 1 : -1)); }
    });
    view.addEventListener('pointercancel', () => { startX = null; });
    view.addEventListener('click', event => { if (dragged) { event.preventDefault(); event.stopPropagation(); dragged = false; } }, true);
    view.addEventListener('dragstart', event => event.preventDefault());
    let frame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { measure(); render(false); });
    });
    measure();
    render(false);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;
}

module.exports = { buildSliderEmbedCode, sliderSnaps, sliderActive };
