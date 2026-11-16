/* Research content is static HTML. Highlight the current area while scrolling. */
(function () {
    'use strict';
    const nav = document.querySelector('.rs-area-nav');
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll('.rs-area-nav-links a[href^="#"]'));
    const sections = links.map(link => document.getElementById(link.hash.slice(1)));
    let scheduled = false;
    const siteNav = document.getElementById('nav') || document.querySelector('.nav');
    function update() {
        scheduled = false;
        const bounds = nav.getBoundingClientRect();
        const stuck = bounds.top <= parseFloat(getComputedStyle(nav).top) + 1;
        nav.classList.toggle('is-stuck', stuck);
        const boundary = bounds.bottom + 100;
        let current = -1;
        sections.forEach((section, index) => {
            if (stuck && section && section.getBoundingClientRect().top <= boundary) current = index;
        });
        links.forEach((link, index) => {
            if (index === current) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        });
    }
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(update);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    function measureNav() {
        /* The bar pins flush under the site nav, whatever its height. */
        if (siteNav) nav.style.setProperty('--rs-nav-top', siteNav.getBoundingClientRect().height + 'px');
        const offset = nav.getBoundingClientRect().height + parseFloat(getComputedStyle(nav).top) + 24;
        document.querySelector('.rs-research').style.setProperty('--rs-scroll-offset', offset + 'px');
        schedule();
    }
    /* Under 961px the capsules fold behind the Menu button; Escape, a
       click outside, focus leaving and a chosen link close the panel. */
    const toggle = nav.querySelector('.rs-area-nav-toggle');
    const panel = nav.querySelector('.rs-area-nav-links');
    if (toggle && panel) {
        const setOpen = open => {
            panel.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        };
        toggle.hidden = false;
        nav.classList.add('is-enhanced');
        toggle.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
        panel.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
        document.addEventListener('click', event => { if (!nav.contains(event.target)) setOpen(false); });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && panel.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
        });
        nav.addEventListener('focusout', event => { if (event.relatedTarget && !nav.contains(event.relatedTarget)) setOpen(false); });
    }
    new ResizeObserver(measureNav).observe(nav);
    window.addEventListener('resize', measureNav);
    measureNav();
    update();
})();

/* Homepage Research dot field, kept visually identical to initDots in home.js. */
(function () {
    'use strict';
    function initDots() {
        const panel = document.querySelector('.rs-hero');
        const canvas = panel && panel.querySelector('.rs-dots');
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

    initDots();
})();
