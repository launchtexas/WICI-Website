/* =========================================
   WiCi One product page, the Buy page's own script (js/product-now.js)
   Loaded in the <head> of wici-one.html. Until Oct 2, 2026 the page had
   two modes and this script switched on the ?now one (the preorder
   variant that lived at wici-one-now.html until Sept 28, 2026) by
   flagging <html class="is-now">; the signup mode is gone (see
   archive/wici-one-signup-mode) and the class is in the markup, which
   css/product-now.css still scopes to. ?now in the URL is ignored and
   harmless. Every `[data-preorder]`
   link (slots: nav-mobile, bar, quick (hero went with the price pill and quick-5060 / quick-5090 with the edition rows, Oct 26, 2026),
   reserve-5060, reserve-5090, closing, closing-compare, faq) pushes a
   `wici_one_buy_start` dataLayer event for GTM, with the slot it came from
   and the price it shows (`data-price`, else the starting price), before
   the browser follows the link to shop/wici-one. Mirrors buy.js's `wici_one_config_confirmed`.
   It also shows the product bar once the hero has scrolled out from
   under the nav, and runs
   the closing card's 360° turntable (`initTurntable`): the frames play
   on a canvas, and a sideways drag turns the device.
   No dependencies.
   ========================================= */

(function () {
    'use strict';

    /* The product bar is hidden over the hero by `is-bar-watched` (see
       initBarPastHero). Set here, in the head, before the first paint:
       set once the DOM was in, the bar painted shown for a frame and then
       faded out over the announcement bar on every load (Oct 26, 2026). */
    document.documentElement.classList.add('is-bar-watched');
    /* The nav's white surface over the hero's photo (`is-over-hero`, see
       initBarPastHero, which corrects it once the page is in): set here
       too, so the bar is not bare for the first frames. */
    document.documentElement.classList.add('is-over-hero');

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-preorder]').forEach((link) => {
            link.addEventListener('click', () => {
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push({
                    event: 'wici_one_buy_start',
                    form_name: 'wici-one-now',
                    cta_location: link.dataset.preorder || '',
                    price: Number(link.dataset.price) || 3499,
                    currency: 'USD',
                });
            });
        });

        initBarPastHero();
        initTurntable();
    });

    /* ---- The product bar past the hero ----
       The bar (.pnow-bar, fixed under the nav by css/product-now.css) is
       hidden over the hero and comes in the moment the hero's bottom
       edge (#overview) passes the nav's bottom edge: `is-shown` on the
       bar, `is-bar-watched` on <html> so the stylesheet hides it only
       while this runs (without the script the bar stays shown). The same
       watch puts `is-over-hero` on <html> while the hero's photo
       (.phero-photo) is still behind the nav, which the stylesheet gives
       its frosted white surface for it from the first paint (the bar is
       bare at the top of a page until it scrolls; a dark glass with
       white type from Oct 22 to Oct 26, 2026). */
    function initBarPastHero() {
        const bar = document.getElementById('pnowBar');
        const hero = document.getElementById('overview');
        const photo = hero && hero.querySelector('.phero-photo');
        const nav = document.getElementById('nav');
        if (!bar || !hero) {
            document.documentElement.classList.remove('is-bar-watched');
            return;
        }
        const update = () => {
            const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
            bar.classList.toggle('is-shown', hero.getBoundingClientRect().bottom <= navBottom);
            if (photo) document.documentElement.classList.toggle('is-over-hero', photo.getBoundingClientRect().bottom > navBottom);
        };
        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
    }

    /* ---- Closing card turntable ----
       The <figure data-turntable> in #closing holds a still, frame 0 of
       the 360° turn. Its 200 frames (data-frames, 000.webp to 199.webp,
       each the data-crop box of the still's frame) are fetched as soon
       as the rest of the page is in (the load event, at low priority so
       they stay behind whatever the visitor scrolls to), or sooner if
       the card is already a screen away. They play on a canvas that
       takes the still's place as soon as frame 0 is in (`is-live`):
       37.5 fps, looping, only while the card is on screen, and never
       ahead of the download, so on a slow line the turn waits on each
       frame until it arrives rather than skipping. Once all 200 are in
       (`is-ready`) a sideways drag on the figure turns the device
       instead, the near face following the pointer, a full turn per
       column width; letting go resumes the loop from the frame the drag
       left. The "Drag to rotate" hint under the device shows from then
       on and goes with the first drag (`is-dragged`). Reduced motion
       keeps the drag and drops the loop. */
    const FRAME_MS = 80 / 3; // 37.5 fps: the 25 fps render, half again as fast
    const DRAG_START_PX = 4; // sideways travel before a press is a drag

    function initTurntable() {
        const figure = document.querySelector('[data-turntable]');
        const still = figure && figure.querySelector('img');
        if (!still) return;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        // The attributes, not .width / .height, which give the laid-out size.
        canvas.width = Number(still.getAttribute('width'));
        canvas.height = Number(still.getAttribute('height'));
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', still.alt);
        still.after(canvas);

        const base = figure.dataset.frames;
        const count = Number(figure.dataset.count);
        const [cropX, cropY] = figure.dataset.crop.split(',').map(Number);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const frames = [];
        const failed = new Set(); // frames that will never arrive
        let pending = count;  // frames still on their way
        let live = false;     // the canvas has taken over from the still
        let frame = 0;        // the frame on the canvas
        let onScreen = false;
        let raf = 0;
        let last = 0;         // when the frame on the canvas was due
        let press = null;     // { id, x, frame, width, dragging } while a pointer is down

        const wrap = (index) => ((index % count) + count) % count;

        const draw = (index) => {
            const image = frames[index];
            if (!image || !image.complete || !image.naturalWidth) return false;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, cropX, cropY);
            frame = index;
            return true;
        };

        // Shows the frame asked for, or the nearest one after it (or, with
        // step -1, before it) if that one failed to load.
        const show = (index, step) => {
            for (let tries = 0; tries < count; tries++) {
                if (draw(wrap(index + tries * step))) return true;
            }
            return false;
        };

        // The loop's next frame: the one after this, past any that failed.
        // False while that frame is still on its way, and the loop waits
        // on the current one.
        const advance = () => {
            let next = wrap(frame + 1);
            for (let tries = 0; tries < count && failed.has(next); tries++) next = wrap(next + 1);
            return draw(next);
        };

        const tick = (now) => {
            raf = 0;
            if (!onScreen || (press && press.dragging)) return;
            // A long gap (a hidden tab, a frame that was slow to arrive)
            // resumes from here rather than racing to catch up.
            if (now - last > 5 * FRAME_MS) last = now - FRAME_MS;
            if (now - last >= FRAME_MS && advance()) last += FRAME_MS;
            raf = window.requestAnimationFrame(tick);
        };

        const play = () => {
            if (raf || reduced || !live || !onScreen || (press && press.dragging)) return;
            last = window.performance.now();
            raf = window.requestAnimationFrame(tick);
        };

        const settle = (index, ok) => {
            if (!ok) failed.add(index);
            pending -= 1;
            // The canvas takes over with frame 0, or, if that one failed,
            // with the first that did arrive once all are accounted for.
            if (!live && ((index === 0 && ok) || !pending) && show(0, 1)) {
                live = true;
                figure.classList.add('is-live');
                play();
            }
            if (live && !pending) figure.classList.add('is-ready');
        };

        const load = (priority) => {
            if (frames.length) return;
            for (let index = 0; index < count; index++) {
                const image = new Image();
                image.fetchPriority = priority;
                image.onload = () => settle(index, true);
                image.onerror = () => settle(index, false);
                image.src = base + String(index).padStart(3, '0') + '.webp';
                frames.push(image);
            }
        };

        if (document.readyState === 'complete') {
            load('low');
        } else {
            window.addEventListener('load', () => load('low'), { once: true });
        }

        if ('IntersectionObserver' in window) {
            // The page is still loading and the card is nearly in view:
            // the frames can't wait for the rest.
            new IntersectionObserver((entries, observer) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                observer.disconnect();
                load('auto');
            }, { rootMargin: '100% 0px' }).observe(figure);
            new IntersectionObserver((entries) => {
                onScreen = entries[entries.length - 1].isIntersecting;
                play();
            }).observe(figure);
        } else {
            onScreen = true;
        }

        figure.addEventListener('pointerdown', (event) => {
            if (pending || press || (event.pointerType === 'mouse' && event.button !== 0)) return;
            press = { id: event.pointerId, x: event.clientX, frame, width: 1, dragging: false };
            // A mouse press would otherwise start a text selection.
            if (event.pointerType === 'mouse') event.preventDefault();
        });

        figure.addEventListener('pointermove', (event) => {
            if (!press || event.pointerId !== press.id) return;
            if (!press.dragging) {
                // The loop runs on until the pointer has travelled sideways:
                // a tap, or a swipe that scrolls the page, never stops it.
                if (Math.abs(event.clientX - press.x) < DRAG_START_PX) return;
                press.dragging = true;
                press.x = event.clientX;
                press.frame = frame;
                press.width = figure.getBoundingClientRect().width || 1;
                figure.setPointerCapture(press.id);
                figure.classList.add('is-dragged');
            }
            // The turn carries the near face to the left, so a drag to the
            // left runs it forward and a drag to the right runs it back.
            const turned = Math.round(((press.x - event.clientX) / press.width) * count);
            show(press.frame + turned, event.clientX > press.x ? -1 : 1);
        });

        const release = (event) => {
            if (!press || event.pointerId !== press.id) return;
            press = null;
            play();
        };
        figure.addEventListener('pointerup', release);
        figure.addEventListener('pointercancel', release);
        figure.addEventListener('lostpointercapture', release);
    }
})();
