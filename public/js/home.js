/* =========================================
   WiCi — Home interactivity
   Loaded by index.html only.
   - The film hero (initFilmHero, later on Oct 28, 2026): the whole
     brand film playing over the hero's still on a click, the bar as
     its progress and its pause
   - The nav bar: sticky over the hero; the activity badge takes its
     accent back once the hero has scrolled out from under it
     (is-past-hero)
   - The product block's turntable: WiCi One drawn apart, turning,
     and following a sideways drag
   - The research panel's dot field (initDots): a grid of dots behind
     the rows, drifting on a slow noise field and leaning toward the
     pointer
   - The blocks under the statement (initBlocks, Oct 28, 2026): the
     research rows, the demo films' rows, and the entrances
   The statement panel's word split, stickers and scroll scrub
   (initHero, Oct 21 to Oct 28, 2026) are in git history up to 0631918;
   the hero panel's stepped cut-outs, the film slides and dialog, the
   tech cards, the launch banner's parallax and solutions pill, the
   article feed, and the waitlist form went with the Oct 20, 2026
   homepage; the product page's
   ?now closing card keeps its own turntable in js/product-now.js.
   ========================================= */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        initFilmHero();
        initNavPastHero();
        initTurntable();
        initDots();
        initBlocks();
        initInferFigures();
    });

    /* ---- The film hero (later on Oct 28, 2026) ----
       A click on the bar in the idle state starts the film (is-playing
       on the section: the CSS takes the statement out and brings the
       film up over the still); its play ring pauses it while it plays
       (is-paused) and resumes it after; its accent cell, "Back", Escape,
       or the film's end stops it. The
       bar's --p, 0 to 1, is the film's progress, written each frame
       while it plays; both faces of the bar carry the same words,
       written together. (The preview's looping silent cuts, and the bar
       as their progress, stood here for an hour.) */
    function initFilmHero() {
        const hero = document.getElementById('statement');
        const film = hero && hero.querySelector('.fh-film');
        const bar = hero && hero.querySelector('.fh-bar');
        if (!film || !bar) return;
        const labels = bar.querySelectorAll('.fh-bar-label');
        const times = bar.querySelectorAll('.fh-bar-time');
        const IDLE_LABEL = bar.getAttribute('aria-label');
        const FULL = times[0].textContent;
        const fmt = (t) => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
        const setText = (nodes, text) => nodes.forEach((n) => { if (n.textContent !== text) n.textContent = text; });
        const setP = (p) => bar.style.setProperty('--p', Math.min(1, Math.max(0, p || 0)).toFixed(4));
        let mode = 'idle';   // idle | playing | paused
        // The viewport's visible height as the page loaded (the browser's
        // toolbars shown), for the phone stage's height: a browser whose
        // svh is off gets corrected by it (on Chrome for iOS 156 all of
        // these agreed with svh, 683 on an iPhone 15 Pro, measured with
        // a probe page: its toolbars just leave a short screen). The
        // smallest of innerHeight, a fixed inset-0 element's height and
        // visualViewport wins, and the stylesheet takes the smaller of
        // that and svh. Set once, and again only when the
        // width changes (a turn), never on the resize a hiding toolbar
        // sends.
        // The copy's height on phones, for the still's height (css/home.css):
        // measured at init, once the fonts are in, and on every resize.
        const copy = hero.querySelector('.fh-copy');
        const copyH = () => { if (copy && window.innerWidth <= 720) hero.style.setProperty('--fh-copy-h', copy.offsetHeight + 'px'); };
        copyH();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(copyH);
        window.addEventListener('load', copyH);
        window.addEventListener('resize', copyH);
        const vh = () => {
            const probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
            document.body.appendChild(probe);
            let h = Math.min(window.innerHeight, probe.getBoundingClientRect().height || Infinity, (window.visualViewport && window.visualViewport.height) || Infinity);
            probe.remove();
            if (h > 0 && isFinite(h)) hero.style.setProperty('--fh-vh', Math.round(h) + 'px');
        };
        let vw = window.innerWidth;
        vh();
        window.addEventListener('resize', () => { if (window.innerWidth !== vw) { vw = window.innerWidth; vh(); } });
        // The next film ("How it works", the tech explainer; its files on
        // the video's data-next-*): from 10 s before the hero film's end
        // a "Watch next one" prompt stands on the stage (.fh-next, is-next
        // on the section), and a click on it, or the end of the film,
        // swaps the explainer in and plays it; its end closes the hero.
        const NEXT_AT = 10;
        const next = film.dataset.nextAv1 ? { av1: film.dataset.nextAv1, h264: film.dataset.nextH264, poster: film.dataset.nextPoster, title: film.dataset.nextTitle || 'the next film' } : null;
        const own = { sources: Array.from(film.querySelectorAll('source')).map((n) => n.cloneNode(true)), poster: film.getAttribute('poster'), label: film.getAttribute('aria-label') };
        let current = 'own';   // own | next
        let offered = false;
        const load = (sources, poster, label) => {
            film.querySelectorAll('source').forEach((n) => n.remove());
            sources.forEach((n) => film.appendChild(n));
            if (poster) film.setAttribute('poster', poster);
            if (label) film.setAttribute('aria-label', label);
            film.load();
        };
        const source = (src, type) => { const n = document.createElement('source'); n.src = src; n.type = type; return n; };

        // The bar's progress: one frame loop while the film plays.
        let ticking = false;
        const tick = () => {
            const d = film.duration;
            setP(mode === 'idle' || !d ? 0 : film.currentTime / d);
            if (mode === 'playing' && !film.paused && !film.ended) requestAnimationFrame(tick); else ticking = false;
        };
        const wake = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };

        const start = () => {
            mode = 'playing';
            hero.classList.add('is-playing');
            hero.classList.remove('is-paused');
            setP(0);
            setText(labels, 'Back');
            setText(times, fmt(0));
            bar.setAttribute('aria-label', 'Close the film');
            film.muted = false;
            hero.classList.remove('is-muted');
            film.currentTime = 0;
            film.play().catch(() => {});
        };
        const stop = () => {
            mode = 'idle';
            hero.classList.remove('is-playing', 'is-paused', 'is-next');
            film.pause();
            setText(labels, 'Watch the film');
            setText(times, FULL);
            bar.setAttribute('aria-label', IDLE_LABEL);
            setP(0);
            offered = false;
            if (current === 'next') { current = 'own'; load(own.sources.map((n) => n.cloneNode(true)), own.poster, own.label); }
        };
        const playNext = () => {
            if (!next || current === 'next') { stop(); return; }
            current = 'next';
            offered = false;
            hero.classList.remove('is-next', 'is-paused');
            mode = 'playing';
            setP(0);
            setText(labels, 'Back');
            setText(times, fmt(0));
            bar.setAttribute('aria-label', 'Close the film');
            load([source(next.av1, 'video/mp4; codecs="av01.0.08M.08"'), source(next.h264, 'video/mp4; codecs="avc1.640028"')], next.poster, next.title);
            film.muted = false;
            film.play().catch(() => {});
        };
        // The prompt on the stage, centred a little under the middle
        //; the bar keeps "Back".
        const prompt = hero.querySelector('.fh-next');
        if (prompt && next) { prompt.hidden = false; prompt.setAttribute('aria-label', 'Watch the next film, ' + next.title); prompt.addEventListener('click', (e) => { e.stopPropagation(); playNext(); }); }
        const offer = () => {
            if (offered || !next || current !== 'own') return;
            offered = true;
            hero.classList.add('is-next');
        };
        // While the film plays the accent cell gives way to a Back ring,
        // which closes it; the play ring pauses and
        // resumes; a click anywhere
        // else on the bar seeks to that point, the bar's whole width being
        // the film's length; the mute ring
        // toggles the sound. The keyboard's
        // Enter on the bar is Back.
        const seek = (x) => {
            const r = bar.getBoundingClientRect(), d = film.duration;
            if (!d || !r.width) return;
            const p = Math.min(1, Math.max(0, (x - r.left) / r.width));
            film.currentTime = p * d;
            setP(p);
            setText(times, fmt(film.currentTime));
        };
        bar.addEventListener('click', (e) => {
            if (mode === 'idle') start();
            else if (!e.clientX && !e.clientY || e.target.closest('.fh-bar-label, .fh-bar-close')) stop();
            else if (e.target.closest('.fh-bar-play')) { if (mode === 'playing') film.pause(); else film.play().catch(() => {}); }
            else if (e.target.closest('.fh-bar-mute')) { film.muted = !film.muted; hero.classList.toggle('is-muted', film.muted); }
            else seek(e.clientX);
        });
        // A click on the film itself pauses and resumes it too.
        film.addEventListener('click', () => {
            if (mode === 'playing') film.pause();
            else if (mode === 'paused') film.play().catch(() => {});
        });
        film.addEventListener('play', () => {
            if (!hero.classList.contains('is-playing')) return;
            mode = 'playing';
            hero.classList.remove('is-paused');
            wake();
        });
        film.addEventListener('pause', () => {
            if (mode === 'idle' || film.ended) return;
            mode = 'paused';
            hero.classList.add('is-paused');
        });
        film.addEventListener('timeupdate', () => {
            if (mode === 'idle') return;
            setText(times, fmt(film.currentTime));
            if (current === 'own' && film.duration && film.duration - film.currentTime <= NEXT_AT) offer();
        });
        film.addEventListener('ended', () => { if (current === 'own' && next) playNext(); else stop(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode !== 'idle') stop(); });
    }

    /* ---- The nav past the hero ----
       On the homepage the bar sticks to the top over the hero
       (body.nl-home in css/home.css), its activity badge in ink there;
       is-past-hero, once the hero's bar has scrolled up under the nav,
       gives the badge its accent back. Measured on the bar: the stage is
       sticky and the section display: contents, so neither has a usable
       box (is-past-logo, for the statement panel's stacked logo, went
       with it on Oct 28, 2026). */
    function initNavPastHero() {
        const nav = document.getElementById('nav');
        const bar = document.querySelector('#statement .fh-bar');
        if (!nav || !bar) return;
        const update = () => {
            if (document.documentElement.classList.contains('nav-menu-open')) return;
            nav.classList.toggle('is-past-hero', bar.getBoundingClientRect().bottom <= nav.offsetHeight);
        };
        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
    }

    /* ---- Turntable ----
       The <figure data-turntable> in #product holds a still, frame 0
       of the exploded turn (the device fully apart). Its 200 frames
       (data-frames + 000 to data-count - 1, with the data-ext suffix,
       each the still's size, WebP with alpha) are fetched as soon as the rest
       of the page is in, or sooner if the panel is on screen. They play
       on a canvas that takes the still's place as soon as frame 0 is in
       (`is-live`): one frame every FRAME_MS, looping, only while the
       panel is on screen, and never ahead of the download. Once all are
       in (`is-ready`) a sideways drag turns the device instead, the
       near face following the pointer, a full turn per figure width;
       letting go resumes the loop from the frame the drag left. The
       "Drag to rotate" hint shows from then on and goes with the first
       drag (`is-dragged`). Reduced motion keeps the drag and drops the
       loop. A copy of the product page's closing-card turntable, with
       the frames drawn to the canvas's size and the suffix configurable. */
    const FRAME_MS = 64;     // 200 frames over the exploded turn's 12.8 s (15.6 fps)
    const DRAG_START_PX = 4; // sideways travel before a press is a drag

    function initTurntable() {
        const figure = document.querySelector('[data-turntable]');
        const still = figure && figure.querySelector('img');
        if (!still) return;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = Number(still.getAttribute('width'));
        canvas.height = Number(still.getAttribute('height'));
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', still.alt);
        still.after(canvas);

        const base = figure.dataset.frames;
        const count = Number(figure.dataset.count);
        const ext = figure.dataset.ext || '.webp';
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const frames = [];
        const failed = new Set();
        let pending = count;
        let live = false;
        let frame = 0;
        let onScreen = false;
        let raf = 0;
        let last = 0;
        let press = null;

        const wrap = (index) => ((index % count) + count) % count;

        const draw = (index) => {
            const image = frames[index];
            if (!image || !image.complete || !image.naturalWidth) return false;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            frame = index;
            return true;
        };

        const show = (index, step) => {
            for (let tries = 0; tries < count; tries++) {
                if (draw(wrap(index + tries * step))) return true;
            }
            return false;
        };

        const advance = () => {
            let next = wrap(frame + 1);
            for (let tries = 0; tries < count && failed.has(next); tries++) next = wrap(next + 1);
            return draw(next);
        };

        const tick = (now) => {
            raf = 0;
            if (!onScreen || (press && press.dragging)) return;
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
                image.src = base + String(index).padStart(3, '0') + ext;
                frames.push(image);
            }
        };

        if (document.readyState === 'complete') {
            load('low');
        } else {
            window.addEventListener('load', () => load('low'), { once: true });
        }

        if ('IntersectionObserver' in window) {
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
            if (event.pointerType === 'mouse') event.preventDefault();
        });

        figure.addEventListener('pointermove', (event) => {
            if (!press || event.pointerId !== press.id) return;
            if (!press.dragging) {
                if (Math.abs(event.clientX - press.x) < DRAG_START_PX) return;
                press.dragging = true;
                press.x = event.clientX;
                press.frame = frame;
                press.width = figure.getBoundingClientRect().width || 1;
                figure.setPointerCapture(press.id);
                figure.classList.add('is-dragged');
            }
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

    /* ---- The research panel's dot field ----
 A grid
       of small dots over the whole panel, behind the card, each drifting
       a few pixels on a slow noise field; near the pointer they lean
       toward it and brighten, the hero's magnet pull on the app tiles.
       The pointer is eased, and its presence fades in and out, so
       nothing jumps when it arrives or leaves. The canvas is the panel's
       size at the device's density (2x at most). Off screen nothing
       runs; under reduced motion one still frame; where the canvas is
       not shown (1040px and under, the card filling the panel) the loop
       never starts. */
    function initDots() {
        const panel = document.getElementById('research');
        const canvas = panel && panel.querySelector('.nl-dots');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const noise = makeNoise();
        const GAP = 26;      // px between dots
        const REACH = 190;   // px, how far the pointer is felt
        const DRIFT = 7;     // px, the noise field's sway
        const PULL = 14;     // px, the lean toward the pointer at its centre
        let w = 0, h = 0, t = 0, on = false, visible = false, last = 0, raf = 0;
        const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, in: false, over: 0 };

        const shown = () => canvas.offsetParent !== null;

        function draw() {
            ctx.clearRect(0, 0, w, h);
            for (let gy = GAP; gy < h; gy += GAP) {
                for (let gx = GAP; gx < w; gx += GAP) {
                    const nx = noise(gx / 300, gy / 300, t * 0.05);
                    const ny = noise(gx / 300 + 9.1, gy / 300 + 3.7, t * 0.05);
                    let x = gx + nx * DRIFT, y = gy + ny * DRIFT, a = 0.2, r = 1.3;
                    const dx = pointer.x - x, dy = pointer.y - y, d = Math.hypot(dx, dy);
                    if (d < REACH) {
                        const k = 1 - d / REACH, pull = k * k * PULL * pointer.over;
                        x += dx / (d + 1) * pull;
                        y += dy / (d + 1) * pull;
                        a += 0.5 * k * pointer.over;
                        r += 0.9 * k * pointer.over;
                    }
                    ctx.fillStyle = `rgba(255,255,255,${a})`;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        function frame(now) {
            if (!on) return;
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            t += dt;
            if (pointer.in) {
                if (pointer.x < -1e3) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
                pointer.x += (pointer.tx - pointer.x) * 0.08;
                pointer.y += (pointer.ty - pointer.y) * 0.08;
                pointer.over += (1 - pointer.over) * 0.06;
            } else {
                pointer.over -= pointer.over * 0.04;
                if (pointer.over < 0.002) { pointer.over = 0; pointer.x = -1e4; pointer.y = -1e4; }
            }
            draw();
            raf = requestAnimationFrame(frame);
        }

        const start = () => {
            if (on || reduced || !visible || !shown()) return;
            on = true;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        };
        const stop = () => { on = false; cancelAnimationFrame(raf); };

        const size = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            w = rect.width; h = rect.height;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (!on) draw();
            start();
        };

        panel.addEventListener('pointermove', (event) => {
            const rect = canvas.getBoundingClientRect();
            pointer.tx = event.clientX - rect.left;
            pointer.ty = event.clientY - rect.top;
            pointer.in = true;
        });
        panel.addEventListener('pointerleave', () => { pointer.in = false; });

        size();
        window.addEventListener('resize', size);
        if (reduced) return;
        if (!('IntersectionObserver' in window)) { visible = true; start(); return; }
        new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible) start(); else stop();
        }, { threshold: 0.02 }).observe(panel);
    }

    /* Perlin noise in three dimensions with a fixed permutation, summed
       over three octaves; returns about -1 to 1. The third axis is time. */
    function makeNoise() {
        const P = new Uint8Array(512);
        const p = [];
        for (let i = 0; i < 256; i++) p[i] = i;
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const k = p[i]; p[i] = p[j]; p[j] = k; }
        for (let i = 0; i < 512; i++) P[i] = p[i & 255];
        const fade = (v) => v * v * v * (v * (v * 6 - 15) + 10);
        const lerp = (a, b, v) => a + (b - a) * v;
        const grad = (hash, x, y, z) => {
            const g = hash & 15;
            const u = g < 8 ? x : y, v = g < 4 ? y : (g === 12 || g === 14 ? x : z);
            return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
        };
        const one = (x, y, z) => {
            const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
            x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
            const u = fade(x), v = fade(y), s = fade(z);
            const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
            return lerp(
                lerp(lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u), lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u), v),
                lerp(lerp(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u), lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v),
                s);
        };
        return (x, y, z) => one(x, y, z) * 0.6 + one(x * 2.1, y * 2.1, z * 1.3) * 0.28 + one(x * 4.3, y * 4.3, z * 1.7) * 0.12;
    }

    /* ---- The blocks under the statement (Oct 28, 2026) ----
       The full-page layout's behaviour: the research rows (one open at a
       time, growing open as their text rises in), the demo films (a row
       swaps its film into the player and plays it without moving the
       page), the demo rail's play link, and the entrances (blocks rise,
       rows slide in from the right in turn, pictures grow from 93%, once,
       as they come on screen; the WiCi One line's two halves follow the
       scroll in from either side). Still under reduced motion. */
    /* The WiCi Infer block's figures count up from 0 to their value over
       1.4 s, eased out, once the figures row is a third on screen; under
       reduced motion they show their value at once. */
    function initInferFigures() {
        var row = document.querySelector('.ix-infer-figures');
        if (!row) return;
        var nums = [].slice.call(row.querySelectorAll('[data-count]'));
        var show = function (el, v) {
            var dec = (el.getAttribute('data-count').split('.')[1] || '').length;
            el.textContent = v.toFixed(dec) + '\u00d7';
        };
        var finish = function () { nums.forEach(function (el) { show(el, parseFloat(el.getAttribute('data-count'))); }); };
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { finish(); return; }
        var run = function () {
            var t0 = null, dur = 1400;
            var frame = function (t) {
                if (t0 === null) t0 = t;
                var p = 1 - Math.pow(1 - Math.min(1, (t - t0) / dur), 3);
                nums.forEach(function (el) { show(el, parseFloat(el.getAttribute('data-count')) * p); });
                if (p < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        };
        var io = new IntersectionObserver(function (entries) {
            if (!entries.some(function (e) { return e.isIntersecting; })) return;
            io.disconnect(); run();
        }, { threshold: 0.35 });
        io.observe(row);
    }

    function initBlocks() {
        // The research rows: one open at a time. A row opens by growing to
        // its height while its text rises in, the link a beat after; the
        // row it replaces folds shut at the same time. Instant under
        // reduced motion.
        var still = window.matchMedia('(prefers-reduced-motion: reduce)');
        var accEase = 'cubic-bezier(0.22, 1, 0.36, 1)';
        var setOpen = function (item, on) {
            var body = item.querySelector('.ix-acc-body');
            if (item.classList.contains('is-open') === on) return;
            item.classList.toggle('is-open', on);
            item.querySelector('.ix-acc-head').setAttribute('aria-expanded', String(on));
            (body._anims || []).forEach(function (a) { a.cancel(); });
            body._anims = [];
            if (still.matches || !body.animate) { body.hidden = !on; return; }
            var pad = getComputedStyle(body).paddingBottom;
            if (on) {
                body.hidden = false;
                var h = body.getBoundingClientRect().height;
                body._anims.push(body.animate(
                    [{ height: '0px', paddingBottom: '0px' }, { height: h + 'px', paddingBottom: pad }],
                    { duration: 560, easing: accEase }));
                [].forEach.call(body.children, function (el, i) {
                    body._anims.push(el.animate(
                        [{ opacity: 0, transform: 'translate3d(0, 18px, 0)' }, { opacity: 1, transform: 'none' }],
                        { duration: 520, delay: 120 + i * 90, easing: accEase, fill: 'backwards' }));
                });
            } else {
                var from = body.getBoundingClientRect().height;
                var fold = body.animate(
                    [{ height: from + 'px', paddingBottom: pad, opacity: 1 }, { height: '0px', paddingBottom: '0px', opacity: 0 }],
                    { duration: 420, easing: accEase });
                body._anims.push(fold);
                fold.onfinish = function () { body.hidden = true; };
            }
        };
        document.querySelectorAll('[data-accordion]').forEach(function (acc) {
            var items = acc.querySelectorAll('.ix-acc-item');
            items.forEach(function (item) {
                item.querySelector('.ix-acc-head').addEventListener('click', function () {
                    var open = !item.classList.contains('is-open');
                    items.forEach(function (other) { setOpen(other, other === item && open); });
                });
            });
        });
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // The demo films: a row swaps its film into the player and plays
        // it, without scrolling the page to the player.
        document.querySelectorAll('[data-demos]').forEach(function (block) {
            var video = block.querySelector('.film video');
            var deck = [].slice.call(block.querySelectorAll('.ix-tab'));
            deck.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (!btn.classList.contains('is-playing')) {
                        [].slice.call(video.querySelectorAll('source')).forEach(function (s) { s.remove(); });
                        [['av1', 'video/mp4; codecs="av01.0.08M.08"'], ['h264', 'video/mp4; codecs="avc1.640028"']].forEach(function (k) {
                            var s = document.createElement('source');
                            s.src = btn.dataset[k[0]]; s.type = k[1];
                            video.appendChild(s);
                        });
                        video.poster = btn.dataset.poster;
                        if (btn.dataset.title) video.setAttribute('aria-label', btn.dataset.title);
                        video.load();
                        deck.forEach(function (b) {
                            b.classList.toggle('is-playing', b === btn);
                            b.setAttribute('aria-pressed', String(b === btn));
                        });
                    }
                    video.play().catch(function () {});
                });
            });
        });
        // The demo rail's link plays the player.
        document.querySelectorAll('[data-play-demo]').forEach(function (b) {
            b.addEventListener('click', function () {
                var fig = document.querySelector('.ix-demos-film');
                var pill = fig && fig.querySelector('.film-play');
                if (pill && !pill.hidden) pill.click(); else if (fig) fig.querySelector('video').play().catch(function () {});
                fig && fig.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
            });
        });
        // Entrances: blocks, rows and pictures play once as they come on
        // screen (CSS above); the big WiCi One line's two halves follow
        // the scroll in from either side. Still under reduced motion.
        if (!reduced) {
            var once = [].slice.call(document.querySelectorAll('[data-anim="rise"], [data-anim="row"], [data-anim="zoom"]'));
            if ('IntersectionObserver' in window && once.length) {
                once.forEach(function (el) {
                    el.style.setProperty('--i', el.getAttribute('data-i') || '0');
                    // Once in, drop the stagger so hover colours answer at once.
                    el.addEventListener('transitionend', function () { el.style.transitionDelay = '0s'; }, { once: true });
                });
                document.documentElement.classList.add('ix-motion');
                var seen = new IntersectionObserver(function (es) {
                    es.forEach(function (e) {
                        if (!e.isIntersecting) return;
                        e.target.classList.add('is-in');
                        seen.unobserve(e.target);
                    });
                }, { rootMargin: '0px 0px -6% 0px' });
                once.forEach(function (el) { seen.observe(el); });
            }
            var sides = [].slice.call(document.querySelectorAll('[data-anim="fromL"], [data-anim="fromR"]'));
            var queued = false;
            // After inspirux.com's "SELECTED WORKS": the
            // slide runs the whole way the words cross the viewport, from
            // their top at its foot to 40% from its top, mapped to the
            // scroll in a straight line, each half starting half its own
            // width out; and the shown offset chases the target a little
            // behind the scroll (a per-frame lerp, about half a second
            // to catch up), so the words glide rather than track every
            // wheel step. The progress is read off the words, not the row:
            // the first row's box holds the turntable, which stands well
            // above the words, and on phones that row is display:
            // contents, with no box at all, so the words take the
            // transform there too.
            var wordsOf = function (el) { return el.querySelector(':scope > span') || el; };
            var targetOf = function (el) { return getComputedStyle(el).display === 'contents' ? wordsOf(el) : el; };
            var state = sides.map(function (el) { return { el: el, cur: null, to: 0 }; });
            var running = false;
            var frame = function () {
                var settled = true;
                state.forEach(function (s) {
                    if (s.cur === null) s.cur = s.to;
                    s.cur += (s.to - s.cur) * 0.085;
                    if (Math.abs(s.to - s.cur) < 0.1) s.cur = s.to; else settled = false;
                    targetOf(s.el).style.transform = s.cur === 0 ? '' : 'translate3d(' + s.cur.toFixed(1) + 'px,0,0)';
                });
                if (settled) running = false; else requestAnimationFrame(frame);
            };
            var update = function () {
                queued = false;
                var vh = window.innerHeight || 900;
                state.forEach(function (s) {
                    var words = wordsOf(s.el);
                    var r = words.getBoundingClientRect();
                    var p = (vh - r.top) / (vh * 0.60);
                    p = p < 0 ? 0 : p > 1 ? 1 : p;
                    var travel = targetOf(s.el).getBoundingClientRect().width * 0.5;
                    var off = (1 - p) * travel;
                    s.to = s.el.getAttribute('data-anim') === 'fromL' ? -off : off;
                });
                if (!running) { running = true; requestAnimationFrame(frame); }
            };
            var queue = function () { if (!queued) { queued = true; requestAnimationFrame(update); } };
            if (sides.length) {
                window.addEventListener('scroll', queue, { passive: true });
                window.addEventListener('resize', queue);
                update();
            }
        }
    }
})();
