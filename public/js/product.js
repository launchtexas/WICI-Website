/* =========================================
   WiCi One — Product page interactivity
   Loaded by wici-one.html only.
   - Device horizontal scrollytelling (closed device → x-rays)
   - (Benchmark workload switcher: js/specs.js, shared with the buy page)
   - Use Cases tabs (one media stage, a row of buttons under it, stacked beside the caption on phones, media controls)
   - Use Cases floor plan (rooms on the plan and rows in the list pick one case)
   - Why It Matters picture strip (the picked card wide, one caption under the row)
   - Card rail: In summary (prev / next)
   - Newsletter signup form
   - Signup pop-up (20 seconds in, or at the Benchmarks band) and its pill
     (the only floating pill since the signup mode went, Oct 2, 2026)
   - FAQ search (a field over the questions: rank, filter, mark, open an answer)
   ========================================= */

(function () {
    'use strict';

    // Vertical "hold" before the horizontal track starts translating.
    // Lets the intro title sit centered for a short stretch of scroll so
    // the entrance to the section feels deliberate instead of
    // immediately yanking sideways.
    // The CSS `.device-flow` height is grown by exactly this much so
    // the four feature transitions keep their original 100vh-each feel
    // — keep these two values in sync if you tune them.
    const DEVICE_INTRO_HOLD_PX = 300;

    // The matching dead zone at the far end: once the last slide has
    // landed the section stays pinned for this much more scroll before
    // it releases, so the page doesn't start moving on again the instant
    // the sequence finishes. Both holds are added to the `.device-flow`
    // height in CSS — keep the three numbers in sync.
    const DEVICE_OUTRO_HOLD_PX = 300;

    // Fraction of each render's slot spent fading into the next one.
    // At 1.0 every pixel of scroll is fading — the artwork is always
    // mid-dissolve and never settles on a still frame. Lower it to buy
    // a hold at the end of each slot: 0.4 would fade over the first
    // 40% and sit on the finished image for the remaining 60%.
    //
    // Slots are divided by render count, not slide count, so this stays
    // decoupled from the text either way.
    const DEVICE_FADE_SPAN = 1;

    document.addEventListener('DOMContentLoaded', () => {
        initDeviceHorizontal();
        initNewsletterForm();
        initFaq();
        initSignupPop();
        initWhyStrip();
        initUseCaseRooms();
        initCasesFloor();
        initWhyUnfold();
        initRails();
        initIdeaFilm();
        initFilmSheet();
    });

    /* ---- Why It Matters: the comparison cards unfold on scroll ----
       Five cards against an AI PC or cloud gaming. Each is a pair of panels:
       WiCi One's way, and under it the other way, hinged on the first
       one's lower edge. The markup and the stylesheet draw them open;
       here the second panels are folded up (.is-unfold) and each opens
       as its own progress runs from 0 to 1, written to the card as --e
       (eased).

       Desktop pins the block: it becomes a tall track with the stage
       stuck under the nav and the product bar (.is-pinned), and one
       scroll opens the five from left to right, each starting a little
       after the one before; a "Scroll to unfold" line fades as it goes.
       It pins only from 1000px wide, where the whole stage fits under
       the bars, and where `overflow: clip` exists (the section clips,
       and a section that scrolls would stop the stage sticking). In a
       short desktop window it does not pin, and each card opens as it
       rises into view, one after the other along the row. Under 1000px
       the cards are rows that unfold to the right (the stylesheet turns
       the hinge), and there the scroll only starts them: each row opens
       in its own time once it is on screen, a CSS transition, because a
       fold tied to a finger's scroll stutters on a phone (Oct 4, 2026).
       Reduced motion leaves everything open and still. */
    function initWhyUnfold() {
        const root = document.querySelector('[data-unfold]');
        if (!root) return;
        const stage = root.querySelector('.why-compare-stage');
        const inner = root.querySelector('.why-compare-inner');
        const hint = root.querySelector('.why-compare-hint');
        const cards = Array.from(root.querySelectorAll('.why-compare-card'));
        if (!stage || !inner || !cards.length) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        // The pinned scroll: card i opens over SPAN of it, starting
        // STAGGER after card i - 1 (the designer's figures).
        const STAGGER = 0.12;
        const SPAN = Math.max(0.2, 1 - STAGGER * (cards.length - 1)) * 0.85;
        // Not pinned: a card opens while its top rises from 78% of the
        // window's height through the next 32%.
        const RISE_FROM = 0.78;
        const RISE_OVER = 0.32;
        // Rows: one starts once its top is above 88% of the window's
        // height, and no sooner than 110ms after the one before.
        const ROW_LINE = 0.88;
        const ROW_GAP = 110;

        const clamp = (v) => Math.max(0, Math.min(1, v));
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        const wide = window.matchMedia('(min-width: 1000px)');
        const canClip = !!(window.CSS && CSS.supports && CSS.supports('overflow', 'clip'));
        const nav = document.getElementById('nav');
        const bar = document.querySelector('.pnow-bar');

        root.classList.add('is-unfold');

        let pinned = false;
        let pinTop = 0;
        let cols = cards.map(() => 0);   // each card's place in its own row
        let lag = 0;
        let stacked = false;             // one card to a row
        // Rows: which have opened, their pending starts, and when the
        // last one started.
        let opened = cards.map(() => false);
        let timers = cards.map(() => 0);
        let lastStart = 0;

        const set = (card, t) => {
            const e = ease(clamp(t));
            card.style.setProperty('--e', e.toFixed(3));
            // The other way's label (and its band on desktop) comes in
            // with the first card.
            if (card === cards[0]) root.style.setProperty('--e-head', e.toFixed(3));
        };

        const update = () => {
            const vh = window.innerHeight || 1;
            if (pinned) {
                const rect = root.getBoundingClientRect();
                const run = rect.height - stage.offsetHeight;   // how far the page scrolls while the stage is stuck
                const p = clamp((pinTop - rect.top) / Math.max(1, run));
                cards.forEach((card, i) => set(card, (p - i * STAGGER) / SPAN));
                if (hint) hint.style.opacity = clamp(1 - p * 4).toFixed(2);
            } else if (stacked) {
                // Rows (under 1000px) are not tied to the scroll, which
                // stutters under a finger: each row opens in its own time
                // (a CSS transition, see the stylesheet) once it is well
                // on screen, and one after another even when a flick
                // brings them all in at once. A row that drops back below
                // the screen folds again, so the next pass replays it.
                const now = performance.now();
                cards.forEach((card, i) => {
                    const top = card.getBoundingClientRect().top;
                    if (!opened[i] && top < vh * ROW_LINE) {
                        opened[i] = true;
                        const at = Math.max(now, lastStart + ROW_GAP);
                        lastStart = at;
                        timers[i] = setTimeout(() => set(card, 1), at - now);
                    } else if (opened[i] && top > vh + 8) {
                        opened[i] = false;
                        clearTimeout(timers[i]);
                        set(card, 0);
                    }
                });
            } else {
                cards.forEach((card, i) => {
                    const q = (vh * RISE_FROM - card.getBoundingClientRect().top) / (vh * RISE_OVER);
                    set(card, q - cols[i] * lag);
                });
            }
        };

        // Decide whether the block pins, and where each card sits in its row.
        const measure = () => {
            root.classList.remove('is-pinned');
            pinned = false;
            if (canClip && wide.matches) {
                pinTop = (nav ? nav.offsetHeight : 0) + (bar ? bar.offsetHeight : 0);
                root.style.setProperty('--unfold-top', pinTop + 'px');
                root.classList.add('is-pinned');
                // The hint is part of the pinned stage: measure with it in place.
                if (inner.offsetHeight + 24 > stage.clientHeight) root.classList.remove('is-pinned');
                else pinned = true;
            }
            cols = cards.map((card) => cards.filter((other) =>
                Math.abs(other.offsetTop - card.offsetTop) < 4 && other.offsetLeft < card.offsetLeft - 1).length);
            const most = Math.max.apply(null, cols);
            lag = most ? Math.min(0.3, 0.9 / most) : 0;
            const rows = !most && cards.length > 1;
            if (rows !== stacked) {
                // Between the two layouts: start the rows from folded.
                stacked = rows;
                timers.forEach((timer) => clearTimeout(timer));
                opened = cards.map(() => false);
                lastStart = 0;
                if (stacked) cards.forEach((card) => set(card, 0));
            }
            update();
        };

        let raf = 0;
        const schedule = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = 0; update(); });
        };

        // Follow the scroll only while the block is near the window.
        let near = false;
        const listen = (on) => {
            if (on === near) return;
            near = on;
            if (on) {
                window.addEventListener('scroll', schedule, { passive: true });
                update();
            } else {
                window.removeEventListener('scroll', schedule);
            }
        };
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                listen(entries.some((entry) => entry.isIntersecting));
            }, { rootMargin: '50% 0px 50% 0px' }).observe(root);
        } else {
            listen(true);
        }

        let resizeTimer = 0;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(measure, 120);
        });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
        measure();
    }

    /* ---- Use Cases: the floor plan ----
       The plan's five room buttons and the list's five rows pick the same
       thing: one use case, always exactly one. Picking it tints the room
       (the SVG floor group with the same data-room), fills its pin, and
       opens its row; the other rows close. The markup ships with the
       first case picked and every row's text showing, so the section
       reads without this script; the first run here closes the rest.

       Phones (720px and under) show the picked case on one card under
       the plan in place of the list, so the text stays next to the plan: see
       buildFloorCards. */
    function initCasesFloor() {
        const root = document.querySelector('[data-floor]');
        if (!root) return;

        const rooms = Array.from(root.querySelectorAll('.floor-room'));
        const grounds = Array.from(root.querySelectorAll('.floor-ground'));
        const items = Array.from(root.querySelectorAll('.floor-item'));
        if (!rooms.length || !items.length) return;

        let cards = null;

        // `from` is 'cards' when the card's own swipe picked the case, so
        // the card is not scrolled again under the finger.
        const select = (id, from) => {
            rooms.forEach((room) => {
                const on = room.dataset.case === id;
                room.classList.toggle('is-active', on);
                room.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            grounds.forEach((ground) => {
                ground.classList.toggle('is-active', ground.dataset.room === id);
            });
            items.forEach((item) => {
                const on = item.dataset.case === id;
                const row = item.querySelector('.floor-row');
                const panel = item.querySelector('.floor-panel');
                item.classList.toggle('is-open', on);
                if (row) row.setAttribute('aria-expanded', on ? 'true' : 'false');
                if (panel) panel.hidden = !on;
            });
            if (cards) cards.show(id, from);
        };

        rooms.forEach((room) => {
            room.addEventListener('click', () => select(room.dataset.case));
        });
        items.forEach((item) => {
            const row = item.querySelector('.floor-row');
            if (row) row.addEventListener('click', () => select(item.dataset.case));
        });

        cards = buildFloorCards(root, rooms, items, select);

        const first = items.find((item) => item.classList.contains('is-open')) || items[0];
        select(first.dataset.case);
    }

    /* The phone card. One white card under the plan: the room and its
       place in the five, the case's title, its text and link, then
       previous, a row of dots, and next. It is a scroll-snap track of
       five slides, so a swipe moves it under the finger; the slides are
       built here from the list's own rows (title, text, link) and the
       plan's room names, which keeps the copy in the markup once. A
       swipe, an arrow, a dot, or a room on the plan all pick the case
       (`pick`, initCasesFloor's select); the arrows wrap around, as in
       the designer's prototype. The stylesheet shows the card and hides
       the list at 720px and under once `.floor--cards` is set; without
       this script the list stays. */
    function buildFloorCards(root, rooms, items, pick) {
        const list = root.querySelector('.floor-list');
        if (!list || !list.parentNode) return null;

        const ids = items.map((item) => item.dataset.case);
        const total = items.length;
        const el = (tag, cls, text) => {
            const node = document.createElement(tag);
            if (cls) node.className = cls;
            if (text != null) node.textContent = text;
            return node;
        };
        const chevron = (d) => {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            const path = document.createElementNS(NS, 'path');
            [['width', '16'], ['height', '16'], ['viewBox', '0 0 16 16'], ['fill', 'none'], ['aria-hidden', 'true']]
                .forEach(([k, v]) => svg.setAttribute(k, v));
            [['d', d], ['stroke', 'currentColor'], ['stroke-width', '1.8'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]
                .forEach(([k, v]) => path.setAttribute(k, v));
            svg.appendChild(path);
            return svg;
        };
        const text = (node) => (node ? node.textContent.trim() : '');

        const wrap = el('div', 'floor-cards');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-roledescription', 'carousel');
        wrap.setAttribute('aria-label', 'Use cases');

        const track = el('div', 'floor-cards-track');
        const names = [];
        items.forEach((item, i) => {
            const room = rooms.find((r) => r.dataset.case === item.dataset.case);
            const roomName = text(room && room.querySelector('.floor-room-name'));
            const title = text(item.querySelector('.floor-row-title'));
            const body = item.querySelector('.floor-panel-body');
            const link = item.querySelector('.case-tile-link');
            names.push(roomName ? `${roomName}: ${title}` : title);

            const slide = el('div', 'floor-card');
            slide.dataset.case = item.dataset.case;
            slide.appendChild(el('p', 'floor-card-kicker', `${roomName ? roomName + ' · ' : ''}${i + 1} of ${total}`));
            slide.appendChild(el('h3', 'floor-card-title', title));
            if (body) slide.appendChild(el('p', 'floor-card-body', text(body)));
            if (link) slide.appendChild(link.cloneNode(true));
            track.appendChild(slide);
        });

        const nav = el('div', 'floor-cards-nav');
        const prev = el('button', 'floor-cards-btn');
        const next = el('button', 'floor-cards-btn floor-cards-btn--next');
        prev.type = 'button';
        next.type = 'button';
        prev.setAttribute('aria-label', 'Previous room');
        next.setAttribute('aria-label', 'Next room');
        prev.appendChild(chevron('M10 3 5 8l5 5'));
        next.appendChild(chevron('m6 3 5 5-5 5'));
        const dotRow = el('div', 'floor-cards-dots');
        const dots = ids.map((id, i) => {
            const dot = el('button', 'floor-cards-dot');
            dot.type = 'button';
            dot.setAttribute('aria-label', names[i]);
            dot.addEventListener('click', () => pick(id));
            dotRow.appendChild(dot);
            return dot;
        });
        nav.appendChild(prev);
        nav.appendChild(dotRow);
        nav.appendChild(next);

        wrap.appendChild(track);
        wrap.appendChild(nav);
        list.parentNode.insertBefore(wrap, list.nextSibling);
        root.classList.add('floor--cards');

        const phone = window.matchMedia('(max-width: 720px)');
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        let index = 0;          // the slide the card is on
        let target = null;      // a scroll started here is still on its way to this slide
        let timer = 0;
        let touching = false;   // a finger is on the card

        const nearest = () => {
            const w = track.clientWidth;
            if (!w) return index;
            return Math.max(0, Math.min(total - 1, Math.round(track.scrollLeft / w)));
        };

        // Once a scroll has come to rest: if a hand stopped it somewhere
        // else, the card's slide is the picked case.
        const settle = () => {
            clearTimeout(timer);
            target = null;
            const i = nearest();
            if (i !== index && phone.matches) pick(ids[i], 'cards');
        };

        const go = (i, instant) => {
            const x = i * track.clientWidth;
            if (Math.abs(track.scrollLeft - x) < 1) return;
            clearTimeout(timer);
            if (instant || reduce.matches) {
                target = null;
                track.scrollLeft = x;
                return;
            }
            // Our own scroll: the rooms it passes on the way are not
            // picked. The timer is for a scroll that never arrives.
            target = i;
            timer = setTimeout(settle, 2000);
            track.scrollTo({ left: x, behavior: 'smooth' });
        };

        track.addEventListener('scroll', () => {
            const i = nearest();
            if (target !== null) {
                if (i === target && Math.abs(track.scrollLeft - target * track.clientWidth) < 2) settle();
                return;
            }
            if (i !== index) pick(ids[i], 'cards');
        }, { passive: true });
        track.addEventListener('scrollend', settle);
        // A finger on the card takes over from a scroll still running.
        track.addEventListener('touchstart', () => {
            touching = true;
            clearTimeout(timer);
            target = null;
        }, { passive: true });

        prev.addEventListener('click', () => pick(ids[(index - 1 + total) % total]));
        next.addEventListener('click', () => pick(ids[(index + 1) % total]));

        // The track has no scroll position while the card is hidden, and
        // its slides change width with the screen: whenever its box
        // changes, put it back on the picked case, at once; and once more
        // when a change of width has settled (a rotation can pass through
        // several layouts). Never under a finger.
        let lastWidth = window.innerWidth;
        let alignTimer = 0;
        const align = () => { if (!touching) go(index, true); };
        if ('ResizeObserver' in window) new ResizeObserver(align).observe(track);
        window.addEventListener('resize', () => {
            if (window.innerWidth === lastWidth) return;
            lastWidth = window.innerWidth;
            clearTimeout(alignTimer);
            alignTimer = setTimeout(align, 150);
        });
        const lift = () => { touching = false; };
        track.addEventListener('touchend', lift, { passive: true });
        track.addEventListener('touchcancel', lift, { passive: true });

        return {
            show(id, from) {
                const i = ids.indexOf(id);
                if (i < 0) return;
                index = i;
                dots.forEach((dot, k) => {
                    dot.classList.toggle('is-active', k === i);
                    if (k === i) dot.setAttribute('aria-current', 'true');
                    else dot.removeAttribute('aria-current');
                });
                if (from !== 'cards' && phone.matches) go(i);
            }
        };
    }

    /* ---- The Big Idea's exploded turn ----
       A transparent looping film in place of the still. Nothing is fetched
       until the figure is within half a viewport; the
       film is fetched then, but the turn waits: it starts half a second
       after half the figure is on screen, so
       the exploded view holds for a beat before it moves. It starts at
       full speed: an eased start, the playback rate climbing from a
       fifth, was tried the same day and dropped, since a 31 fps film
       played that slowly steps from frame to frame. Once it has started
       it resumes at once, and it pauses once it is well off screen.
       Reduced motion, or a browser without IntersectionObserver, keeps
       the poster. */
    const IDEA_FILM_DELAY = 500;   // ms on screen before the turn starts

    function initIdeaFilm() {
        const film = document.querySelector('.big-figure--film video');
        if (!film || !('IntersectionObserver' in window)) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let fetched = false;
        let started = false;   // the turn has begun at least once
        let timer = 0;

        const play = () => {
            timer = 0;
            started = true;
            const p = film.play();
            if (p && p.catch) p.catch(() => {});
        };

        // Within half a viewport: fetch the film. Further away: stop.
        const near = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    if (fetched) return;
                    fetched = true;
                    film.preload = 'auto';
                    film.load();
                } else {
                    if (timer) { clearTimeout(timer); timer = 0; }
                    film.pause();
                }
            });
        }, { rootMargin: '50% 0px' });

        // Half of it on screen: start, after the beat the first time.
        const seen = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.intersectionRatio < 0.5) return;
                if (started) play();
                else if (!timer) timer = setTimeout(play, IDEA_FILM_DELAY);
            });
        }, { threshold: 0.5 });

        near.observe(film);
        seen.observe(film);
    }

    /* ---- Benchmark workload switcher ----
       The slash-separated tab strip above the benchmark table; each
       workload maps to one <tbody> of rows plus one .models-notes
       footnote group, toggled together via `hidden`. Same tab
       conventions as the developer page's code-mode switcher (roving
       tabindex, arrow keys) — but the panels stay plain <tbody> row
       groups so the table semantics survive. The default selection
       ships in the markup; JS only reacts to input. */
    /* ---- The tech explainer over the page (Oct 30, 2026) ----
       <dialog id="explainerSheet"> at the end of <body> (styles:
       product.css "Film sheet"), opened by any [data-film-sheet=
       "explainerSheet"] button; the Big Idea's "See how it works" for
       now. The film takes the site's own controls (window.WiCiFilm,
       common.js) and starts with sound on open, inside the click that
       asked for it; should it not start (a slow network, a browser that
       refuses), the bar is shown so the visitor can press play. Close
       square, a click on the backdrop and Escape close it; the film
       pauses where it is, so a second opening carries on, and focus
       goes back to the button that opened it. */
    function initFilmSheet() {
        const sheet = document.getElementById('explainerSheet');
        if (!sheet || typeof sheet.showModal !== 'function') return;
        const figure = sheet.querySelector('.film');
        const video = sheet.querySelector('video');
        const closeBtn = sheet.querySelector('.film-sheet-close');
        if (!figure || !video) return;

        if (window.WiCiFilm) window.WiCiFilm.controls(figure, video);
        else video.controls = true;

        let opener = null;
        const open = (button) => {
            opener = button;
            sheet.showModal();
            video.muted = false;
            const playing = video.play();
            if (playing && playing.catch) playing.catch(() => { figure.classList.add('is-started'); });
            const playBtn = figure.querySelector('.film-btn--play');
            (playBtn || closeBtn || sheet).focus({ preventScroll: true });
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: 'explainer_open', source: button.dataset.filmSource || 'big-idea' });
        };
        const close = () => { if (sheet.open) sheet.close(); };

        document.querySelectorAll('[data-film-sheet="explainerSheet"]').forEach((button) => {
            button.addEventListener('click', () => open(button));
        });
        if (closeBtn) closeBtn.addEventListener('click', close);
        // The backdrop: the dialog has no padding, so a click that lands
        // on the dialog itself is one outside the picture.
        sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
        sheet.addEventListener('close', () => {
            video.pause();
            if (opener) opener.focus({ preventScroll: true });
        });
    }

    /* ---- Why It Matters: the picture strip ----
       Four cards, always exactly one picked. Each picture carries its
       distance from the picked one as data-d (0 to 3), which the CSS
       turns into a width, and the picked card's caption is the one
       shown. A picture, the header's arrows, a sideways swipe on the
       row, and the arrow keys all pick a card. The markup ships with
       the first card picked and every caption in the flow, so the
       section reads without this script; `is-live` stacks the captions
       in one cell. */
    function initWhyStrip() {
        const root = document.querySelector('[data-why-strip]');
        if (!root) return;

        const panels = Array.from(root.querySelectorAll('.why-panel'));
        const captions = panels.map((panel) => document.getElementById(panel.getAttribute('aria-controls')));
        const section = root.closest('.section--why');
        const buttons = section ? Array.from(section.querySelectorAll('.why-nav .rail-nav-btn')) : [];
        if (panels.length < 2 || captions.some((caption) => !caption)) return;

        let current = Math.max(0, panels.findIndex((panel) => panel.classList.contains('is-active')));

        const pick = (index, focus) => {
            current = Math.min(panels.length - 1, Math.max(0, index));
            panels.forEach((panel, i) => {
                const on = i === current;
                panel.dataset.d = String(Math.abs(i - current));
                panel.classList.toggle('is-active', on);
                panel.setAttribute('aria-selected', on ? 'true' : 'false');
                panel.tabIndex = on ? 0 : -1;
                captions[i].classList.toggle('is-active', on);
            });
            buttons.forEach((btn) => {
                btn.disabled = Number(btn.dataset.dir) < 0 ? current === 0 : current === panels.length - 1;
            });
            if (focus) panels[current].focus({ preventScroll: true });
        };

        // A swipe ends in a click on whichever picture was under the
        // finger; that click must not pick a card of its own.
        let swiped = false;

        panels.forEach((panel, i) => {
            panel.addEventListener('click', () => {
                if (swiped) { swiped = false; return; }
                pick(i);
            });
            panel.addEventListener('keydown', (e) => {
                const to = e.key === 'ArrowRight' ? current + 1
                    : e.key === 'ArrowLeft' ? current - 1
                    : e.key === 'Home' ? 0
                    : e.key === 'End' ? panels.length - 1
                    : null;
                if (to === null) return;
                e.preventDefault();
                pick(to, true);
            });
        });

        buttons.forEach((btn) => {
            btn.addEventListener('click', () => pick(current + Number(btn.dataset.dir)));
        });

        // Touch: the page pans vertically only (`touch-action: pan-y` in
        // common.css), so a sideways swipe on the row reaches us whole.
        const SWIPE_MIN = 40;
        const row = root.querySelector('.why-panels');
        let startX = 0;
        let startY = 0;
        let pointerId = null;
        row.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            pointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            swiped = false;
        });
        row.addEventListener('pointerup', (e) => {
            if (pointerId !== e.pointerId) return;
            pointerId = null;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
            swiped = true;
            setTimeout(() => { swiped = false; }, 400);
            pick(current + (dx < 0 ? 1 : -1));
        });
        row.addEventListener('pointercancel', () => { pointerId = null; });
        // No native image drags out of the row (Firefox ignores
        // -webkit-user-drag).
        row.addEventListener('dragstart', (e) => e.preventDefault());

        root.classList.add('is-live');
        pick(current);
    }

    /* ---- Card rails (In summary) ----
       Every `[data-rail]` scroller pairs with the `.rail-nav` that
       follows it: prev / next scroll one card at a time and go quiet
       at either end. Touch and trackpad users just swipe, a mouse can
       drag the rail; the rails themselves are plain CSS scroll-snap. */
    function initRails() {
        document.querySelectorAll('[data-rail]').forEach((rail) => {
            const nav = rail.parentElement ? rail.parentElement.querySelector('.rail-nav') : null;
            if (!nav) return;
            const buttons = Array.from(nav.querySelectorAll('.rail-nav-btn'));

            const step = () => {
                const card = rail.firstElementChild;
                const gap = parseFloat(getComputedStyle(rail).columnGap || getComputedStyle(rail).gap) || 0;
                return card ? card.getBoundingClientRect().width + gap : rail.clientWidth * 0.8;
            };

            const update = () => {
                const max = rail.scrollWidth - rail.clientWidth - 1;
                buttons.forEach((btn) => {
                    const dir = Number(btn.dataset.dir);
                    btn.disabled = dir < 0 ? rail.scrollLeft <= 1 : rail.scrollLeft >= max;
                });
            };

            buttons.forEach((btn) => {
                btn.addEventListener('click', () => {
                    rail.scrollBy({ left: Number(btn.dataset.dir) * step(), behavior: 'smooth' });
                    // The scroll events refresh the ends as the rail moves;
                    // this catches the settled position after the smooth
                    // scroll (and browsers without `scrollend`).
                    setTimeout(update, 700);
                });
            });
            // No native image / link drags out of the rail (Firefox
            // ignores -webkit-user-drag).
            rail.addEventListener('dragstart', (e) => e.preventDefault());

            // Mouse drag scrolls the rail (touch and trackpads already
            // do). Snapping is switched off while the pointer is down
            // (`is-dragging`, see the CSS) so the rail follows the hand,
            // and the release lets it snap to the nearest card. A drag
            // swallows the click that would otherwise land on a card.
            const DRAG_THRESHOLD = 5;
            let pointerId = null;
            let startX = 0;
            let startScroll = 0;
            let dragging = false;
            rail.addEventListener('pointerdown', (e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                pointerId = e.pointerId;
                startX = e.clientX;
                startScroll = rail.scrollLeft;
                dragging = false;
            });
            rail.addEventListener('pointermove', (e) => {
                if (pointerId !== e.pointerId) return;
                const dx = e.clientX - startX;
                if (!dragging && Math.abs(dx) > DRAG_THRESHOLD) {
                    dragging = true;
                    rail.classList.add('is-dragging');
                    try { rail.setPointerCapture(pointerId); } catch (_) {}
                }
                if (dragging) {
                    rail.scrollLeft = startScroll - dx;
                    e.preventDefault();
                }
            });
            const endDrag = (e) => {
                if (pointerId !== e.pointerId) return;
                try { rail.releasePointerCapture(pointerId); } catch (_) {}
                pointerId = null;
                if (dragging) {
                    rail.classList.remove('is-dragging');
                    const suppressClick = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
                    rail.addEventListener('click', suppressClick, { capture: true, once: true });
                    setTimeout(() => rail.removeEventListener('click', suppressClick, { capture: true }), 0);
                    update();
                }
                dragging = false;
            };
            rail.addEventListener('pointerup', endDrag);
            rail.addEventListener('pointercancel', endDrag);
            rail.addEventListener('scroll', update, { passive: true });
            rail.addEventListener('scrollend', update);
            window.addEventListener('resize', update, { passive: true });
            update();
        });
    }

    /* ---- Device — horizontal scrollytelling ----
       An intro slide with the section title plus the four feature texts
       live inside a sticky horizontal track, while the artwork is
       pinned to the bottom of the viewport. This handler maps the
       user's vertical scroll progress through the section's sticky
       window onto a horizontal `translateX` on the track, so scrolling
       down slides the slides right-to-left, and fades the renders in
       underneath, one per slide. The renders themselves never move;
       the text is the only thing in motion. */
    function initDeviceHorizontal() {
        const flow = document.getElementById('deviceScroll');
        const features = flow ? flow.querySelector('.device-features') : null;
        const track = flow ? flow.querySelector('.device-track') : null;
        const section = flow ? flow.closest('.section--device') : null;
        // One render per slide, in DOM order. Index N pairs with layer N.
        const renders = section
            ? Array.from(section.querySelectorAll('.device-figure img'))
            : [];
        if (!flow || !features || !track || !section) return;

        const layers = Array.from(track.querySelectorAll('.device-layer'));
        if (layers.length < 2) return;

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let ticking = false;

        const clearState = () => {
            track.style.transform = '';
            renders.forEach((el) => {
                el.style.opacity = '';
            });
        };

        const apply = (progress) => {
            const vw = window.innerWidth || document.documentElement.clientWidth;

            // Slide one full viewport per layer transition. With N layers
            // there are N-1 transitions and the track travels (N-1) * vw.
            const maxOffset = (layers.length - 1) * vw;
            const offset = -progress * maxOffset;
            track.style.transform = `translate3d(${offset.toFixed(1)}px, 0, 0)`;

            // Swap the renders in place, one per slide: the closed device
            // on the intro, then the four internal x-rays (GPU, board,
            // I/O, thermal). The artwork never moves — it is a fixed
            // window the device changes behind, while only the text
            // travels sideways.
            //
            // `seg` is the position along the (N-1) transitions, so its
            // integer part is the render currently leading and its
            // fraction is how far that hand-off has run. Dividing by
            // DEVICE_FADE_SPAN would compress the fade into the front of
            // the slot and hold the finished image for the rest; at the
            // current 1 there is no hold and the artwork dissolves
            // continuously. Smoothstep still shapes each hand-off so it
            // eases in and out rather than running at a constant rate.
            //
            // Driven off the RENDER count so the artwork sequence stays
            // correct if the two ever differ again; today there is one
            // render per slide and they pair up.
            const spans = Math.max(1, renders.length - 1);
            const seg = Math.max(0, Math.min(spans, progress * spans));
            const lead = Math.min(renders.length - 1, Math.floor(seg));
            const fRaw = Math.min(1, (seg - lead) / DEVICE_FADE_SPAN);
            const f = fRaw * fRaw * (3 - 2 * fRaw);

            // The x-rays are additive rather than a true cross-fade:
            // once reached they stay at full opacity and the next one
            // fades in over the top. A symmetric fade would dip the
            // scene to half opacity at each midpoint — and because
            // every render is alpha artwork over the section background
            // rather than an opaque plate, that dip shows as the device
            // turning briefly translucent instead of as one image
            // becoming another. Stacking works here because all four
            // x-rays share one content bbox, so they cover each other
            // exactly.
            //
            // The closed device is the exception and cross-fades out
            // across the first transition: it is opaque, so left
            // underneath it would flatten every x-ray's glass shell.
            renders.forEach((el, i) => {
                let opacity = 0;
                if (i === 0) opacity = lead === 0 ? 1 - f : 0;
                else if (i <= lead) opacity = 1;
                else if (i === lead + 1) opacity = f;
                el.style.opacity = opacity.toFixed(3);
            });

            // Mirror the centered layer onto the section's `data-active`
            // (and the layer's `is-active` class) so any future styling
            // hooks keep working without a second listener. Round-to-nearest
            // means each layer "wins" the middle slice of its segment of
            // the scroll runway.
            const idx = Math.min(
                layers.length - 1,
                Math.max(0, Math.round(progress * (layers.length - 1)))
            );
            const activeLayer = layers[idx];
            layers.forEach((l) => l.classList.toggle('is-active', l === activeLayer));
            const key = activeLayer.dataset.layer || '';
            flow.setAttribute('data-active', key);
            section.setAttribute('data-active', key);
        };

        const update = () => {
            ticking = false;

            // Geometry of the sticky window. `flow` is 500vh tall in CSS
            // (one viewport per slide: intro + four layers) and `features`
            // is the sticky 100vh viewport; the difference is the runway
            // the user travels while pinned. Resolve them from layout
            // rather than the CSS literal so resizes and anything that
            // changes the runway height stay accurate.
            const flowRect = flow.getBoundingClientRect();
            const stickyDistance = flow.offsetHeight - features.offsetHeight;

            if (stickyDistance <= 0) {
                clearState();
                return;
            }

            // Progress in [0, 1] through the *active* portion of the
            // pinned window. The first `DEVICE_INTRO_HOLD_PX` of scroll
            // after the pin engages is a deliberate dead zone — the
            // intro title stays centered — so the horizontal motion
            // doesn't start the instant the user crosses the pin line.
            // DEVICE_OUTRO_HOLD_PX reserves the same at the far end:
            // progress saturates at 1 with that much sticky travel still
            // to go, so the finished scene holds before the section
            // releases. The travel between the two maps linearly to
            // [0, 1].
            const scrolled = -flowRect.top;
            const activeScrolled = Math.max(0, scrolled - DEVICE_INTRO_HOLD_PX);
            const activeDistance = Math.max(
                1,
                stickyDistance - DEVICE_INTRO_HOLD_PX - DEVICE_OUTRO_HOLD_PX
            );
            const progress = Math.max(0, Math.min(1, activeScrolled / activeDistance));

            apply(progress);
        };

        /* Auto lock-in: when a scroll gesture ends near either end of the
           pinned window, glide the rest of the way so the section sits
           exactly aligned — the intro slide centered at the near end, the
           finished scene at the far end. Both ends behave the same way:
           a wide band catches you arriving from outside the section, and
           a narrow one the width of that end's hold catches you stranded
           inside it. Requires programmatic scrolling to work — see the
           overflow-x note on <body> in common.css. Direction-aware so it
           never pulls against where the user was headed. */
        const LOCK_BAND_VH = 0.6;
        let lastY = window.scrollY;
        let scrollDir = 0;
        let lockTimer = null;
        let lockAnimating = false;
        let touchActive = false;

        /* Hand-rolled glide instead of scrollTo({behavior:'smooth'}):
           scrollTop is driven frame-by-frame with an ease-out, with
           `scroll-behavior` forced to auto for the duration (the CSS
           `smooth` on <html> would otherwise turn every frame's
           assignment into its own animation). If the user scrolls
           mid-glide the position deviates from the script's — that's
           the abort signal. */
        const glideBy = (dist) => {
            const scroller = document.scrollingElement || document.documentElement;
            const startY = scroller.scrollTop;
            const root = document.documentElement;
            const prevBehavior = root.style.scrollBehavior;
            root.style.scrollBehavior = 'auto';
            lockAnimating = true;
            const duration = Math.min(700, Math.max(300, Math.abs(dist) * 0.9));
            const t0 = performance.now();
            let expected = startY;
            const finish = () => {
                root.style.scrollBehavior = prevBehavior;
                lockAnimating = false;
            };
            const frame = (now) => {
                if (Math.abs(scroller.scrollTop - expected) > 24) { finish(); return; }
                const t = Math.min(1, (now - t0) / duration);
                const eased = 1 - Math.pow(1 - t, 3);
                expected = startY + dist * eased;
                scroller.scrollTop = expected;
                if (t < 1) requestAnimationFrame(frame);
                else finish();
            };
            requestAnimationFrame(frame);
        };

        const tryLock = () => {
            if (reducedMotion || lockAnimating || touchActive) return;
            if (document.documentElement.classList.contains('nav-menu-open')) return;
            const top = flow.getBoundingClientRect().top;
            const vh = window.innerHeight || document.documentElement.clientHeight;

            // Near end — target is `top === 0`, the moment the pin
            // engages. Entering doesn't require downward motion
            // (scrollDir can be 0 after a hash jump); it only must not be
            // an upward exit.
            const entering = scrollDir >= 0 && top > 2 && top < vh * LOCK_BAND_VH;
            const backingOut = scrollDir < 0 && top < -2 && top > -DEVICE_INTRO_HOLD_PX;
            if (entering || backingOut) {
                glideBy(top);
                return;
            }

            // Far end — target is the release point, where the sticky
            // window runs out. Measured the same way `update()` does, so
            // the two agree about where the section ends. `fromEnd` is
            // positive while there is travel left and negative once the
            // section has been scrolled past.
            const stickyDistance = flow.offsetHeight - features.offsetHeight;
            if (stickyDistance <= 0) return;
            const fromEnd = top + stickyDistance;
            const finishing = scrollDir >= 0 && fromEnd > 2 && fromEnd < DEVICE_OUTRO_HOLD_PX;
            const backingIn = scrollDir < 0 && fromEnd < -2 && fromEnd > -vh * LOCK_BAND_VH;
            if (finishing || backingIn) glideBy(fromEnd);
        };

        const armLock = () => {
            if (reducedMotion || lockAnimating || touchActive) return;
            clearTimeout(lockTimer);
            lockTimer = setTimeout(tryLock, 150);
        };

        const onScroll = () => {
            const y = window.scrollY;
            if (y !== lastY) scrollDir = y > lastY ? 1 : -1;
            lastY = y;
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
            armLock();
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        // A finger on the glass owns the scroll — never glide under it.
        window.addEventListener('touchstart', () => {
            touchActive = true;
            clearTimeout(lockTimer);
        }, { passive: true });
        window.addEventListener('touchend', () => {
            touchActive = false;
            armLock();
        }, { passive: true });
        window.addEventListener('touchcancel', () => {
            touchActive = false;
        }, { passive: true });

        update();
    }

    /* ---- Newsletter signup forms (WiCi One) ----
       Email-only signup, bound by class: the quick-CTA strip under the
       hero and the closing signup band share this handler. The UI only
       reports success after the public API confirms the matching request. */
    /* ---- Use Cases tabs ----
       Apple's tabbed media format: one media stage stacking a frame per
       case, then the four tabs: a centred row of separate buttons over
       the caption on desktop, stacked beside the caption on phones (the
       designer's mock, Oct 3, 2026; a segmented pill before). Picking
       a tab cross-fades its frame in (CSS opacity), marks it selected,
       and swaps the caption; the arrow keys, up/down or left/right, move
       between tabs, and the list's aria-orientation follows the layout.
       The pill-era helpers (centreTab, the chevron steps) are harmless
       no-ops now: the list no longer scrolls.

       Media: frames with a <video> hold a 10-second muted teaser (AV1
       with an H.264 fallback). The selected frame's teaser plays while
       at least half of the media is on screen and pauses when it leaves.
       A "Play full video" pill sits in the media's bottom-left corner
       while the teaser runs and moves to the middle once it ends; it
       swaps in the full film (data-full-av1 / data-full-h264, with
       sound) in place. The pause and full-screen buttons act on the
       selected frame (full screen is the browser's native video full
       screen, with native controls while in it; iOS uses its own
       player); a caption without `data-video` (a still) shows no
       controls. */
    function initUseCaseRooms() {
        const section = document.getElementById('rooms');
        if (!section) return;

        const media = section.querySelector('.rooms-media');
        const frames = media ? Array.from(media.querySelectorAll('.rooms-frame')) : [];
        const tabs = Array.from(section.querySelectorAll('.rooms-tab'));
        const captions = Array.from(section.querySelectorAll('.rooms-caption'));
        const tablist = section.querySelector('.rooms-tabs');
        const steps = Array.from(section.querySelectorAll('.rooms-tabs-step'));
        const controls = media ? media.querySelector('.rooms-controls') : null;
        const pauseBtn = controls ? controls.querySelector('.rooms-ctl--pause') : null;
        const fullBtn = controls ? controls.querySelector('.rooms-ctl--full') : null;
        const playFull = media ? media.querySelector('.rooms-play-full') : null;
        if (!media || frames.length < 2 || frames.length !== tabs.length || frames.length !== captions.length) return;

        let active = -1;
        let inView = false;

        const videoOf = (i) => frames[i] ? frames[i].querySelector('video') : null;
        const activeVideo = () => (active >= 0 ? videoOf(active) : null);
        // One play() request at a time: scroll events arrive every frame,
        // and a video that is still buffering stays `paused` until it
        // actually starts, so without the guard each scroll would queue
        // another play() promise. Cleared by the playing/pause handlers.
        const safePlay = (video) => {
            if (video.dataset.playReq) return;
            video.dataset.playReq = '1';
            const p = video.play();
            if (p && p.catch) p.catch(() => { video.dataset.playReq = ''; });
        };

        /* -- Teaser → full film -- */
        const teaserEnded = (video) => video.dataset.mode !== 'full' && video.ended;
        const startFull = (video) => {
            if (!video) return;
            if (video.dataset.mode === 'full') {
                if (video.ended) video.currentTime = 0;
                safePlay(video);
                return;
            }
            video.dataset.mode = 'full';
            video.dataset.userPaused = '';
            video.muted = false;
            video.loop = false;
            while (video.firstChild) video.removeChild(video.firstChild);
            const add = (src, type) => {
                if (!src) return;
                const source = document.createElement('source');
                source.src = src;
                source.type = type;
                video.appendChild(source);
            };
            add(video.dataset.fullAv1, 'video/mp4; codecs="av01.0.08M.08"');
            add(video.dataset.fullH264, 'video/mp4; codecs="avc1.640028"');
            video.load();
            // The full film plays under the site's own player (js/common.js,
            // the bar every other film has; Oct 29, 2026); the teaser's
            // pause / full-screen squares step aside (is-full, syncUi).
            if (window.WiCiFilm) window.WiCiFilm.controls(video.closest('.rooms-frame'), video);
            safePlay(video);
            syncUi();
        };

        /* -- Overlay controls follow the active frame's video -- */
        const syncUi = () => {
            const video = activeVideo();
            const hasFilm = !!(active >= 0 && captions[active].hasAttribute('data-video'));
            media.classList.toggle('is-no-controls', !hasFilm);
            media.classList.toggle('is-full', !!video && video.dataset.mode === 'full');
            if (pauseBtn) {
                pauseBtn.disabled = !video;
                const paused = !video || video.paused;
                pauseBtn.classList.toggle('is-paused', paused);
                pauseBtn.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
            }
            if (playFull) {
                // Teaser running: pill in the bottom-left corner. Teaser
                // ended: centered. Full film running: gone. Full film
                // ended: centered again, as a replay.
                const full = !!video && video.dataset.mode === 'full';
                playFull.hidden = !video || (full && !video.ended);
                playFull.classList.toggle('is-centered', !!video && video.ended);
                playFull.querySelector('span').textContent = full ? 'Replay full video' : 'Play full video';
            }
        };

        /* Only the active frame's video runs, and only while the section
           is on screen; a video the visitor paused stays paused, and a
           finished teaser rests on its last frame behind the button. */
        const syncPlayback = () => {
            frames.forEach((frame, i) => {
                const video = frame.querySelector('video');
                if (!video) return;
                const shouldPlay = i === active && inView && !video.dataset.userPaused && !video.ended;
                if (shouldPlay) {
                    if (video.paused) safePlay(video);
                } else if (!video.paused) {
                    video.pause();
                }
            });
        };

        frames.forEach((frame) => {
            const video = frame.querySelector('video');
            if (!video) return;
            const clearReq = () => { video.dataset.playReq = ''; };
            video.addEventListener('playing', clearReq);
            video.addEventListener('pause', clearReq);
            video.addEventListener('error', clearReq);
            video.addEventListener('ended', syncUi);
            video.addEventListener('play', syncUi);
            video.addEventListener('pause', syncUi);
        });

        if (playFull) playFull.addEventListener('click', () => startFull(activeVideo()));

        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                const video = activeVideo();
                if (!video) return;
                if (video.paused) {
                    video.dataset.userPaused = '';
                    if (video.ended && video.dataset.mode !== 'full') video.currentTime = 0;
                    safePlay(video);
                } else {
                    video.dataset.userPaused = '1';
                    video.pause();
                }
            });
        }

        if (fullBtn) {
            // Native video full screen everywhere: the <video> itself goes
            // full screen (with the browser's own controls while it is
            // there), which is what iOS does through its own player.
            let fsVideo = null;
            const exitFs = () => {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) exit.call(document);
            };
            fullBtn.addEventListener('click', () => {
                const video = activeVideo();
                if (!video) return;
                const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
                if (fsEl && fsEl === fsVideo) {
                    exitFs();
                    return;
                }
                if (video.requestFullscreen || video.webkitRequestFullscreen) {
                    fsVideo = video;
                    video.setAttribute('controls', '');
                    const req = video.requestFullscreen || video.webkitRequestFullscreen;
                    const p = req.call(video);
                    if (p && p.catch) {
                        p.catch(() => {
                            video.removeAttribute('controls');
                            fsVideo = null;
                        });
                    }
                } else if (video.webkitEnterFullscreen) {
                    // iOS Safari: the native player.
                    try { video.webkitEnterFullscreen(); } catch (e) { /* not ready yet */ }
                }
            });
            const syncFull = () => {
                const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
                const on = !!fsEl && fsEl === fsVideo;
                if (!on && fsVideo) {
                    fsVideo.removeAttribute('controls');
                    fsVideo = null;
                }
                fullBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'View full screen');
            };
            document.addEventListener('fullscreenchange', syncFull);
            document.addEventListener('webkitfullscreenchange', syncFull);
        }

        /* Phone chevrons: each shows while the pill has more tabs on its
           side (the list's edge fades with it); a press steps to the next
           tab that way, or just slides the list when there is none. */
        const syncSteps = () => {
            if (!tablist) return;
            const max = tablist.scrollWidth - tablist.clientWidth;
            const moreLeft = max > 1 && tablist.scrollLeft > 1;
            const moreRight = max > 1 && tablist.scrollLeft < max - 1;
            tablist.classList.toggle('is-more-left', moreLeft);
            tablist.classList.toggle('is-more-right', moreRight);
            steps.forEach((btn) => {
                btn.hidden = Number(btn.dataset.dir) < 0 ? !moreLeft : !moreRight;
            });
        };
        steps.forEach((btn) => {
            btn.addEventListener('click', () => {
                const dir = Number(btn.dataset.dir);
                const next = active + dir;
                if (next >= 0 && next < tabs.length) {
                    tabs[next].click();
                } else if (tablist) {
                    tablist.scrollBy({ left: dir * tablist.clientWidth * 0.6, behavior: 'smooth' });
                }
                setTimeout(syncSteps, 600);
            });
        });
        if (tablist) {
            tablist.addEventListener('scroll', syncSteps, { passive: true });
            window.addEventListener('resize', syncSteps, { passive: true });
        }

        /* The tabs are a row on desktop and a stacked column on phones
           (the 720px breakpoint in product.css); say which to assistive
           tech. */
        if (tablist && window.matchMedia) {
            const stacked = window.matchMedia('(max-width: 720px)');
            const syncOrientation = () => {
                tablist.setAttribute('aria-orientation', stacked.matches ? 'vertical' : 'horizontal');
            };
            syncOrientation();
            if (stacked.addEventListener) stacked.addEventListener('change', syncOrientation);
            else if (stacked.addListener) stacked.addListener(syncOrientation);
        }

        /* -- Tabs -- */
        const setActive = (index) => {
            if (index === active) return;
            active = index;
            frames.forEach((frame, i) => frame.classList.toggle('is-active', i === index));
            tabs.forEach((tab, i) => {
                const on = i === index;
                tab.classList.toggle('is-active', on);
                tab.setAttribute('aria-selected', on ? 'true' : 'false');
                tab.tabIndex = on ? 0 : -1;
            });
            captions.forEach((cap, i) => { cap.hidden = i !== index; });
            syncPlayback();
            syncUi();
        };

        // Centre the picked tab by scrolling the pill itself. Not
        // scrollIntoView: that also scrolls every scrollable ancestor,
        // the document included, so on a page that can move sideways
        // by even a scrollbar's width it shifts the whole page.
        const centreTab = (tab) => {
            if (!tablist) return;
            const tr = tab.getBoundingClientRect();
            const lr = tablist.getBoundingClientRect();
            const left = tablist.scrollLeft + (tr.left - lr.left) - (lr.width - tr.width) / 2;
            tablist.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
        };

        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => {
                setActive(i);
                centreTab(tab);
            });
            tab.addEventListener('keydown', (e) => {
                const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
                if (!dir) return;
                e.preventDefault();
                const next = (i + dir + tabs.length) % tabs.length;
                tabs[next].click();
                tabs[next].focus();
            });
        });

        /* Playback gate: the selected video runs only while at least
           half of the media is on screen. */
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    inView = entry.isIntersecting;
                    syncPlayback();
                });
            }, { threshold: 0.5 });
            io.observe(media);
        } else {
            inView = true;
        }

        setActive(0);
        syncSteps();
    }

    function initNewsletterForm() {
        document.querySelectorAll('.nl-form').forEach((form) => {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const honey = form.querySelector('[name="_honey"]');
                if (honey && honey.value) return;

                const data = new FormData(form);
                const email = (data.get('email') || '').toString();
                const message = (data.get('message') || '').toString().trim();

                const payload = window.WiCiSignup.withContext(form, {
                    email,
                    message,
                });

                form.querySelectorAll('input, textarea, button').forEach(el => el.disabled = true);
                window.WiCiSignup.setPending(form);

                try {
                    await window.WiCiSignup.submit(payload);
                } catch (err) {
                    const subject = encodeURIComponent('WiCi One Newsletter Signup');
                    const body = encodeURIComponent(message ? `Email: ${email}\nMessage: ${message}` : `Email: ${email}`);
                    window.WiCiSignup.setError(
                        form,
                        `mailto:contact@wici.ai?subject=${subject}&body=${body}`
                    );
                    return;
                }

                window.WiCiSignup.setSuccess(form, 'You’re on the list ✓');

                // Report the conversion to GTM, tagged with which of the
                // page's forms it came from (data-form-name attribute).
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push({
                    event: 'newsletter_signup',
                    form_name: form.dataset.formName || 'newsletter',
                });

                // Tell the page (the signup pop-up listens): this visitor
                // is on the list now.
                form.dispatchEvent(new CustomEvent('wici:signup', { bubbles: true }));

                // Signed up without a note? Offer to add one — it merges
                // into the record just created (same submission_id). The
                // pop-up's form opts out: it confirms and closes instead.
                if (!message && !('noFollowup' in form.dataset)) {
                    revealFollowup(form, email, payload.submission_id);
                }
            });
        });
    }

    /* ---- Post-signup note follow-up (every signup form on the page) ----
       Shown only after a verified email-only signup. Built on demand and
       appended to the form that succeeded, so its controls are live even
       though the form's own fields stay disabled. Re-POSTs with the same
       submission_id plus the note; the service merges it into the stored
       record, so no duplicate row is created. */
    function revealFollowup(form, email, submissionId) {
        if (form.querySelector('.nl-followup')) return;

        const details = form.querySelector('.nl-more');
        if (details) details.hidden = true;

        const box = document.createElement('div');
        box.className = 'nl-followup';
        box.setAttribute('aria-live', 'polite');
        box.innerHTML = '<textarea class="nl-textarea" rows="4" maxlength="512" '
            + 'placeholder="Optional: tell us a bit about yourself or what you’d build '
            + 'with WiCi One. Feedback and comments are welcome too. '
            + 'We may reach out to work together." '
            + 'aria-label="Optional note, feedback, or comments"></textarea>'
            + '<div class="nl-actions"><button type="button" class="cta cta--primary">'
            + '<span>Add note</span></button></div>';
        // Below the (now green) submit button, above the fine print — the
        // confirmation reads first, then the ask. Then make sure the
        // revealed panel is actually on screen.
        const anchor = form.querySelector('.nl-fineprint, .nl-success');
        form.insertBefore(box, anchor || null);
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        const textarea = box.querySelector('textarea');
        const button = box.querySelector('button');
        const label = button.querySelector('span');

        button.addEventListener('click', async () => {
            const note = textarea.value.trim();
            if (!note) {
                textarea.focus();
                return;
            }

            textarea.disabled = true;
            button.disabled = true;
            label.textContent = 'Adding…';

            try {
                await window.WiCiSignup.submit({
                    email: email,
                    submission_id: submissionId,
                    message: note,
                });
            } catch (err) {
                textarea.disabled = false;
                button.disabled = false;
                label.textContent = 'Try again';
                return;
            }

            button.classList.add('is-sent');
            label.textContent = 'Note added ✓';
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'newsletter_message',
                form_name: form.dataset.formName || 'newsletter',
            });
        });
    }

    /* ---- Signup pop-up ----
       The <dialog id="signupPop"> at the end of <body>, shown unasked
       once per page view: 20 seconds after load, or when the Benchmarks
       band (#models) scrolls into view, whichever comes first. Nothing
       is stored, so a reload shows it again; but it never opens once any
       form on the page has signed the visitor up, and it waits while the
       tab is in the background, a field has focus, a film is full screen
       or playing with sound, or the phone menu is open. A page that
       loads already at the band (a #models link, a restored scroll
       position) gets a few seconds first, and the band counts as reached
       only once it has stayed in view for a moment, so a scroll that
       passes through it (the page's own smooth scroll to a link's target,
       a flick down the page) doesn't count. A click on any link to #signup
       (the hero and floating CTAs, the phone drawer's) settles it for
       good: that visitor is on the way to the form, and the pop-up would
       only cut the scroll short. Nor does it open while the signup
       section (#signup, the closing card) is on screen, and its pill
       steps aside there too. A visit that came from one of our emails (utm_medium=email
       on the landing URL, banked for the visit by common.js) never sees
       it: that reader is on the list. Close button, "Not now", a
       click on the backdrop, and Escape close it; a verified signup
       through its own form swaps in the confirmation and closes it
       shortly after.
       Closed without a signup, it leaves a pill at the bottom centre
       (#signupPopLaunch, in the dress of the old floating CTA) that opens
       it again, as often as asked. */
    const POP_DELAY_MS = 20000;
    const POP_SCROLL_GRACE_MS = 3000;
    const POP_DWELL_MS = 800;   // how long the band must stay in view
    const POP_CLOSE_MS = 180;   // the way out, see product.css
    const POP_DONE_MS = 2200;   // how long the confirmation stays up

    function initSignupPop() {
        const pop = document.getElementById('signupPop');
        if (!pop || typeof pop.showModal !== 'function') return;

        const root = document.documentElement;
        const form = pop.querySelector('form');
        const launch = document.getElementById('signupPopLaunch');
        const loadedAt = Date.now();
        let settled = false;   // shown, or signed up through another form
        let signedUp = false;  // through any form on the page
        let asked = '';        // what called for it first: timer / benchmarks
        let timer = 0;
        let retry = 0;
        let dwell = 0;
        let observer = null;

        // Arrived from an email? Then not for this visit. collect() reads
        // the campaign params the way the forms do: this URL's, else the
        // landing page's from sessionStorage.
        const acquired = window.WiCiSignup ? window.WiCiSignup.collect(form) : {};
        if (/^email$/i.test(acquired.utm_medium || '')) return;

        const busy = () => {
            const active = document.activeElement;
            return document.hidden
                || (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
                || document.fullscreenElement || document.webkitFullscreenElement
                || root.classList.contains('nav-menu-open')
                || root.classList.contains('signup-in-view')
                || !!document.querySelector('dialog[open]')
                || Array.from(document.querySelectorAll('video')).some((video) => !video.paused && !video.muted);
        };

        const settle = () => {
            settled = true;
            window.clearTimeout(timer);
            window.clearTimeout(retry);
            window.clearTimeout(dwell);
            if (observer) observer.disconnect();
        };

        const open = (trigger) => {
            pop.showModal();
            root.classList.add('has-pop');
            if (launch) launch.classList.remove('is-visible');
            // A pointer device can type at once; on touch, focusing the
            // field would only throw the keyboard over the card.
            const typing = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
            (typing ? form.elements.email : pop.querySelector('.signup-pop-title')).focus({ preventScroll: true });
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'signup_popup_open',
                form_name: form.dataset.formName,
                trigger,
            });
        };

        // The unprompted opening.
        const show = () => {
            if (settled) return;
            if (busy()) {
                retry = window.setTimeout(show, 1000);
                return;
            }
            settle();
            open(asked);
        };

        const ask = (trigger) => {
            if (settled || asked) return;
            asked = trigger;
            show();
        };

        const close = () => {
            if (!pop.open || pop.classList.contains('is-closing')) return;
            pop.classList.add('is-closing');
            window.setTimeout(() => {
                pop.classList.remove('is-closing');
                pop.close();
            }, POP_CLOSE_MS);
        };

        timer = window.setTimeout(() => ask('timer'), POP_DELAY_MS);

        // Not over the closing card's own form; the pill waits there too.
        const signup = document.getElementById('signup');
        if (signup && 'IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                entries.forEach((entry) => root.classList.toggle('signup-in-view', entry.isIntersecting));
            }, { threshold: 0.15 }).observe(signup);
        }

        const bench = document.getElementById('models');
        if (bench && 'IntersectionObserver' in window) {
            observer = new IntersectionObserver((entries) => {
                window.clearTimeout(dwell);
                if (!entries.some((entry) => entry.isIntersecting)) return;
                const wait = Math.max(POP_DWELL_MS, POP_SCROLL_GRACE_MS - (Date.now() - loadedAt));
                dwell = window.setTimeout(() => ask('benchmarks'), wait);
            }, { rootMargin: '0px 0px -40% 0px' });
            observer.observe(bench);
        }

        // Off to the form by a link: no need to ask.
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a[href*="#signup"]');
            if (link && link.origin === window.location.origin && link.pathname === window.location.pathname) settle();
        });

        pop.querySelectorAll('[data-pop-close]').forEach((button) => {
            button.addEventListener('click', close);
        });
        // Escape: take the same way out as the buttons.
        pop.addEventListener('cancel', (event) => {
            event.preventDefault();
            close();
        });
        // A press and release that both land on the dialog itself, not
        // its content, are on the backdrop. (A text selection dragged out
        // of the field ends there too, hence the press check.)
        let pressedBackdrop = false;
        pop.addEventListener('pointerdown', (event) => {
            pressedBackdrop = event.target === pop;
        });
        pop.addEventListener('click', (event) => {
            if (event.target === pop && pressedBackdrop) close();
        });
        pop.addEventListener('close', () => {
            root.classList.remove('has-pop');
            // Closed without a signup: the pill keeps the offer in reach.
            if (launch && !signedUp) launch.classList.add('is-visible');
        });

        if (launch) {
            launch.addEventListener('click', () => {
                if (!pop.open) open('button');
            });
        }

        document.addEventListener('wici:signup', (event) => {
            settle();
            signedUp = true;
            if (launch) launch.classList.remove('is-visible');
            if (event.target !== form) return;
            pop.classList.add('is-done');
            pop.querySelector('.signup-pop-done .signup-pop-title').focus({ preventScroll: true });
            window.setTimeout(close, POP_DONE_MS);
        });
    }

    /* ---- FAQ: a search box over the questions ----
       The questions and answers are the page's own markup (#faqList);
       this works on those same nodes. Until something is typed the list
       holds the items marked data-popular (all of them if none is); the
       rest are there to be found. Typing ranks every question by how
       well the words match the question (3 points a word), its
       data-keywords (2), its answer (1), or the start of a word in any
       of them (half); a word also counts in its singular and as the one
       the answers use for it (SYNONYMS), once, at its best. The matches
       within reach of the best one show, best first, the matched words
       marked. The first row is lit: Enter, or a click, opens it in
       place as a panel with the answer, and Back (or Escape) returns to
       the list. Up and Down move the lit row; "/" puts the cursor in the
       field while the box is on screen; the field's placeholder types
       out the list's own questions (still under reduced motion). Marking
       rebuilds each paragraph from a kept copy, so the links in the
       answers survive and nothing typed is ever read as HTML. */
    function initFaq() {
        const box = document.querySelector('[data-faq]');
        if (!box) return;

        const field = box.querySelector('.faq-search');
        const input = box.querySelector('.faq-input');
        const clear = box.querySelector('.faq-clear');
        const meta = box.querySelector('.faq-meta');
        const list = box.querySelector('.faq-list');
        const back = box.querySelector('.faq-back');
        const backLabel = box.querySelector('.faq-back-label');
        const empty = box.querySelector('.faq-empty');
        const emptyQuery = box.querySelector('.faq-empty-query');
        const ask = box.querySelector('.faq-ask');
        const askSend = box.querySelector('.faq-ask-send');
        const askLabel = box.querySelector('.faq-ask-label');
        const askDone = box.querySelector('.faq-ask-done');
        const askForm = box.querySelector('.faq-ask-form');
        const askText = askLabel ? askLabel.textContent : '';
        const askBlankText = 'Ask the WiCi team a question';
        let askFailed = false;   // the last send failed: its label stays until the words change
        if (!field || !input || !list) return;

        const STOP = new Set(('a an the is it to of for and or in on do does i my me can what when who how ' +
            'will be are this that with your you if just why where which there have has any not no so at as ' +
            'by from about would could should than its but isn doesn don much another other wici one').split(' '));
        const REACH = 0.4;
        const SYNONYMS = {
            us: 'united states', outside: 'united states', abroad: 'united states', international: 'united states',
            money: 'refund', returns: 'return', cancellation: 'cancel', broken: 'defective',
            ship: 'shipping', deliver: 'delivery', private: 'privacy', secure: 'privacy', offline: 'local',
            wifi: 'wi-fi', pcs: 'pc',
        };
        const words = (text) => text.toLowerCase().replace(/[^a-z0-9$ ]/g, ' ').split(/\s+/)
            .filter((word) => word.length > 1 && !STOP.has(word));
        const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // "laptops" also looks for "laptop".
        const singular = (term) => (term.length > 3 && /[^s]s$/.test(term) ? term.slice(0, -1) : '');

        const items = Array.from(list.querySelectorAll('.faq-item')).map((el) => {
            const button = el.querySelector('.faq-q');
            const label = el.querySelector('.faq-q-text');
            const paragraphs = Array.from(el.querySelectorAll('.faq-a p'));
            const question = label.textContent.trim();
            const keys = (el.dataset.keywords || '').toLowerCase();
            const hay = (question + ' ' + keys + ' ' +
                paragraphs.map((p) => p.textContent).join(' ')).toLowerCase();
            return {
                el,
                button,
                label,
                question,
                questionLower: question.toLowerCase(),
                keys,
                hay,
                hayWords: words(hay),
                // Kept copies: the question and each paragraph as written.
                labelSource: label.cloneNode(true),
                paragraphs: paragraphs.map((p) => ({ el: p, source: p.cloneNode(true) })),
            };
        });
        if (!items.length) return;

        // What the list holds before anything is typed.
        const popular = items.filter((item) => item.el.hasAttribute('data-popular'));
        const home = popular.length ? popular : items;

        const score = (item, terms) => {
            let total = 0;
            terms.forEach((term) => {
                let best = 0;
                [term, singular(term), SYNONYMS[term]].filter(Boolean).forEach((alt) => {
                    const re = new RegExp('\\b' + escapeRe(alt) + (alt.length < 4 ? '\\b' : ''));
                    const points = re.test(item.questionLower) ? 3
                        : re.test(item.keys) ? 2
                        : re.test(item.hay) ? 1 : 0;
                    best = Math.max(best, points);
                });
                if (!best && term.length > 3) {
                    const stem = term.slice(0, 4);
                    if (item.hayWords.some((word) => word.startsWith(stem))) best = 0.5;
                }
                total += best;
            });
            return total;
        };

        // Rebuild `target` from its kept copy, wrapping every word that
        // starts with a search term in <mark>.
        const mark = (target, source, terms) => {
            target.textContent = '';
            source.childNodes.forEach((node) => target.appendChild(node.cloneNode(true)));
            if (!terms.length) return;
            const re = new RegExp('\\b(?:' + terms.map((term) => escapeRe(singular(term) || term)).join('|') + ')\\w*', 'gi');
            const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
            const texts = [];
            while (walker.nextNode()) texts.push(walker.currentNode);
            texts.forEach((node) => {
                const text = node.nodeValue;
                const frag = document.createDocumentFragment();
                let last = 0;
                let match;
                re.lastIndex = 0;
                while ((match = re.exec(text))) {
                    if (!match[0]) { re.lastIndex += 1; continue; }
                    if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
                    const hit = document.createElement('mark');
                    hit.textContent = match[0];
                    frag.appendChild(hit);
                    last = match.index + match[0].length;
                }
                if (!last) return;
                if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
                node.parentNode.replaceChild(frag, node);
            });
        };

        let terms = [];
        let results = home;
        let active = 0;
        let open = null;
        // The question sent to the team (its words, and as askKey reads
        // them), and whether this page view has signed up by any form.
        let sentQuestion = '';
        let sentKey = '';
        let signedUp = false;
        let signedKey = '';   // the sent question this form signed up with
        const askKey = (text) => text.toLowerCase().replace(/[\s?!.,;:]+$/, '').split(/\s+/).filter(Boolean).join(' ');

        const render = () => {
            const searching = terms.length > 0;
            if (clear) clear.hidden = !input.value;

            items.forEach((item) => {
                const shown = open ? item === open : results.includes(item);
                item.el.hidden = !shown;
                item.el.classList.toggle('is-open', item === open);
                item.el.classList.toggle('is-active', !open && results[active] === item);
                item.button.setAttribute('aria-expanded', item === open ? 'true' : 'false');
                mark(item.label, item.labelSource, shown && !open ? terms : []);
                item.paragraphs.forEach((p) => mark(p.el, p.source, item === open ? terms : []));
            });
            // Best match first.
            if (!open) results.forEach((item) => list.appendChild(item.el));

            const none = !open && !results.length;
            list.hidden = none;
            if (meta) {
                meta.hidden = !!open || none;
                const label = searching
                    ? results.length + (results.length === 1 ? ' answer' : ' answers')
                    : 'Frequently asked';
                if (meta.textContent !== label) meta.textContent = label;
            }
            if (back) {
                back.hidden = !open;
                if (backLabel) backLabel.textContent = searching ? 'Back to results' : 'Back to popular questions';
            }
            if (empty) {
                empty.hidden = !none;
                if (emptyQuery) emptyQuery.textContent = input.value.trim();
            }
            // Under every state of the list, an open answer included (a
            // match may not answer what was meant): with words typed, a way
            // to send them to the team, the button itself when nothing
            // matched; with none, a way into the field. Once sent, the
            // thanks and (until this page view signs up) the email field.
            if (ask) {
                const typed = input.value.trim().length >= 2;
                ask.hidden = false;
                ask.classList.toggle('is-empty', none);
                if (askLabel && askSend && !askSend.disabled && !askFailed) {
                    askLabel.textContent = typed ? askText : askBlankText;
                }
                const sent = typed && !!sentKey && sentKey === askKey(input.value);
                if (askSend) askSend.hidden = sent;
                if (askDone) askDone.hidden = !sent;
                if (askForm) askForm.hidden = signedUp && sentKey !== signedKey;
            }
        };

        const search = () => {
            terms = words(input.value);
            if (terms.length) {
                const ranked = items.map((item) => ({ item, points: score(item, terms) }))
                    .filter((entry) => entry.points > 0)
                    .sort((a, b) => b.points - a.points);
                // A common word matches most of the list: keep the matches
                // within reach of the best one.
                const floor = ranked.length ? ranked[0].points * REACH : 0;
                results = ranked.filter((entry) => entry.points >= floor).map((entry) => entry.item);
            } else {
                results = home;
            }
            active = 0;
            open = null;
            askFailed = false;
            render();
            window.clearTimeout(settle);
            if (terms.length && input.value.trim().length >= 2) settle = window.setTimeout(() => record(''), 1200);
        };

        // What is asked goes to webapi.wici.ai, the forms' service, for
        // hq.wici.ai/wici-one-page-questions/: the typed words once they settle (1.2 s
        // after the last keystroke, two characters or more, with how many
        // answers matched) and the answer opened after typing, with the
        // words typed to reach it, and a question sent with the Send button.
        // The service folds a query typed on from the tab's last one into
        // its row. A failure is ignored. Nothing identifies the visitor
        // but a random id for the tab, so one person's tries count once.
        const QUESTIONS_API_URL = 'https://webapi.wici.ai/questions';
        const sessionId = (() => {
            try {
                let id = sessionStorage.getItem('wici-faq-session');
                if (!id) {
                    id = Math.random().toString(36).slice(2, 12);
                    sessionStorage.setItem('wici-faq-session', id);
                }
                return id;
            } catch (error) { return ''; }
        })();
        let lastSent = '';
        let settle = 0;
        const record = (picked) => {
            const question = input.value.trim().slice(0, 200);
            if (!question && !picked) return;
            const key = question.toLowerCase() + '\n' + picked;
            if (key === lastSent) return;
            lastSent = key;
            const body = JSON.stringify({
                question, picked, hits: terms.length ? results.length : null,
                page: window.location.pathname, session_id: sessionId,
            });
            try {
                fetch(QUESTIONS_API_URL, {
                    method: 'POST', mode: 'cors', credentials: 'omit',
                    headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, keepalive: true,
                }).catch(() => {});
            } catch (error) { /* offline */ }
        };

        const pick = (item) => {
            open = item;
            render();
            window.clearTimeout(settle);
            // Only an answer reached through typed words is recorded; a
            // plain click on a listed question is not.
            if (input.value.trim()) record(item.label ? item.label.textContent.trim().slice(0, 200) : '');
        };
        const close = () => {
            const was = open;
            open = null;
            render();
            return was;
        };

        // Send: the typed words go to the same service, marked as sent to
        // the team. Only a confirmed reply shows the thanks.
        if (askSend) {
            askSend.addEventListener('click', async () => {
                const question = input.value.trim().slice(0, 200);
                if (askSend.disabled) return;
                // Nothing typed: the field is where the question goes.
                if (question.length < 2) {
                    if (open) close();
                    input.focus({ preventScroll: true });
                    const rect = field.getBoundingClientRect();
                    if (rect.top < 80 || rect.bottom > window.innerHeight) field.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    return;
                }
                window.clearTimeout(settle);
                askSend.disabled = true;
                if (askLabel) askLabel.textContent = 'Sending…';
                let ok = false;
                try {
                    const response = await fetch(QUESTIONS_API_URL, {
                        method: 'POST', mode: 'cors', credentials: 'omit',
                        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                        body: JSON.stringify({
                            question, picked: '', hits: terms.length ? results.length : null, submitted: true,
                            page: window.location.pathname, session_id: sessionId,
                        }),
                    });
                    const result = response.ok ? await response.json() : null;
                    ok = !!result && result.status === 'success';
                } catch (error) { ok = false; }
                askSend.disabled = false;
                askFailed = !ok;
                if (askLabel) askLabel.textContent = ok ? askText : 'Not sent. Try again';
                if (!ok) return;
                lastSent = question.toLowerCase() + '\n';
                sentQuestion = question;
                sentKey = askKey(question);
                render();
                const email = askForm && !askForm.hidden && askForm.querySelector('input[type="email"]');
                if (email && !email.disabled) email.focus({ preventScroll: true });
            });
        }

        // The email after a sent question: the newsletter list, with the
        // question in the signup's metadata so the reply can answer it.
        if (askForm && window.WiCiSignup) {
            askForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const honey = askForm.querySelector('[name="_honey"]');
                if (honey && honey.value) return;
                const email = (new FormData(askForm).get('email') || '').toString();
                const question = sentQuestion;
                const payload = window.WiCiSignup.withContext(askForm, { email, question });
                askForm.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
                window.WiCiSignup.setPending(askForm, 'Sending…');
                try {
                    await window.WiCiSignup.submit(payload);
                } catch (error) {
                    const subject = encodeURIComponent('WiCi One question');
                    const body = encodeURIComponent('Email: ' + email + '\nQuestion: ' + question);
                    window.WiCiSignup.setError(askForm, 'mailto:contact@wici.ai?subject=' + subject + '&body=' + body);
                    return;
                }
                window.WiCiSignup.setSuccess(askForm, 'Subscribed ✓');
                signedKey = sentKey;
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push({ event: 'newsletter_signup', form_name: askForm.dataset.formName || 'faq-question' });
                askForm.dispatchEvent(new CustomEvent('wici:signup', { bubbles: true }));
            });
        }
        // Signed up by any form on the page: no second invitation.
        document.addEventListener('wici:signup', () => {
            signedUp = true;
            render();
        });

        input.addEventListener('input', search);
        input.addEventListener('keydown', (event) => {
            if (open && event.key !== 'Escape') return;
            if (event.key === 'ArrowDown') {
                active = Math.min(active + 1, results.length - 1);
                render();
                event.preventDefault();
            } else if (event.key === 'ArrowUp') {
                active = Math.max(active - 1, 0);
                render();
                event.preventDefault();
            } else if (event.key === 'Enter') {
                if (results[active]) pick(results[active]);
                event.preventDefault();
            } else if (event.key === 'Escape') {
                if (open) close();
                else if (input.value) { input.value = ''; search(); }
                event.preventDefault();
            }
        });

        // The whole field is the target, not just the text.
        field.addEventListener('click', (event) => {
            if (event.target.closest('button')) return;
            input.focus();
        });
        if (clear) {
            clear.addEventListener('click', () => {
                input.value = '';
                search();
                input.focus();
            });
        }

        items.forEach((item) => {
            item.button.addEventListener('click', () => {
                if (open === item) close();
                else pick(item);
            });
            item.el.addEventListener('mousemove', () => {
                const index = results.indexOf(item);
                if (open || index < 0 || index === active) return;
                active = index;
                items.forEach((other) => other.el.classList.toggle('is-active', other === item));
            });
        });

        if (back) {
            back.addEventListener('click', () => {
                const was = close();
                if (was) was.button.focus({ preventScroll: true });
            });
        }

        // "/" puts the cursor in the field, while the box is on screen and
        // nothing else is being typed into.
        document.addEventListener('keydown', (event) => {
            if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = document.activeElement;
            if (target && (target === input || target.isContentEditable ||
                /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
            if (document.querySelector('dialog[open]')) return;
            const rect = box.getBoundingClientRect();
            if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
            event.preventDefault();
            input.focus();
        });

        // The placeholder types out the questions in the list, one after
        // another, while the box is on screen. It runs through the search-only ones too, so
        // the field shows what can be asked.
        const HINTS = items.map((item) => item.question);
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduceMotion && 'IntersectionObserver' in window) {
            let hint = 0;
            let length = 0;
            let deleting = false;
            let inView = false;
            let timer = 0;
            const tick = () => {
                timer = 0;
                if (!inView || document.hidden) return;
                const text = 'Try “' + HINTS[hint] + '”';
                let delay = deleting ? 22 : 55;
                if (!deleting) {
                    length += 1;
                    if (length >= text.length) { length = text.length; deleting = true; delay = 1600; }
                } else {
                    length -= 1;
                    if (length <= 0) { length = 0; deleting = false; hint = (hint + 1) % HINTS.length; }
                }
                input.placeholder = text.slice(0, length);
                timer = window.setTimeout(tick, delay);
            };
            const wake = () => { if (!timer && inView && !document.hidden) timer = window.setTimeout(tick, 55); };
            new IntersectionObserver((entries) => {
                entries.forEach((entry) => { inView = entry.isIntersecting; });
                wake();
            }).observe(box);
            document.addEventListener('visibilitychange', wake);
        }

        field.hidden = false;
        box.classList.add('is-ready');
        search();
    }
})();
