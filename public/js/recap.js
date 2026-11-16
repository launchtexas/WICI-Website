/* Launch recap (events/wici-one-launch-recap.html only): the virtual
   launch's floor plan and its list of stations, and the lightbox for the
   designs. */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-films], [data-tabs]').forEach(initTabs);
        document.querySelectorAll('[data-film-parts]').forEach(initFilmParts);
        initTour();
        initLightbox();
    });

    /* ---- Tabs over one stage ----
       The films under the title (Hero film / Zili interview / Full
       walkthrough with CEO in the control over the stage, Moments /
       Behind the scenes as small pills under it, a second tab list over
       the same panels, [data-films]) and each demo
       station's films and design ([data-tabs]): one panel at a time.
       Leaving a panel pauses its film. The arrow keys move along the tabs,
       as in any tab list. The walkthrough's tab opens a "Coming soon"
       placeholder; the film itself, in
       parts (initFilmParts below), is a panel hidden in the markup that
       no tab names until a [data-film-unlock] button inside the
       placeholder (the small dot in its corner, for those who know of
       it) or a #walkthrough address swaps it in: the tab then controls
       the film's panel, the placeholder goes, and the film opens. Without
       the script the tabs stay hidden and every panel not hidden in the
       markup shows. */
    function initTabs(root) {
        const lists = Array.from(root.querySelectorAll('[role="tablist"]'));
        const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
        const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
        if (!lists.length || !tabs.length || panels.some((p) => !p)) return;

        const show = (i, focus) => {
            tabs.forEach((tab, n) => {
                const on = n === i;
                tab.setAttribute('aria-selected', on ? 'true' : 'false');
                tab.tabIndex = on ? 0 : -1;
                panels[n].hidden = !on;
                if (!on) panels[n].querySelectorAll('video').forEach((v) => v.pause());
            });
            if (focus) tabs[i].focus();
        };

        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => show(i));
            tab.addEventListener('keydown', (e) => {
                let n = -1;
                if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
                else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') n = 0;
                else if (e.key === 'End') n = tabs.length - 1;
                if (n < 0) return;
                e.preventDefault();
                show(n, true);
            });
        });

        // A placeholder's unlock: the film it names takes the placeholder's
        // place under the tab, and opens.
        const unlock = (button) => {
            const film = document.getElementById(button.dataset.filmUnlock);
            const i = panels.findIndex((p) => p.contains(button));
            if (!film || i < 0 || panels[i] === film) return;
            panels[i].hidden = true;
            panels[i].removeAttribute('role');
            panels[i] = film;
            tabs[i].setAttribute('aria-controls', film.id);
            show(i);
        };
        const unlocks = Array.from(root.querySelectorAll('[data-film-unlock]'));
        unlocks.forEach((button) => button.addEventListener('click', () => unlock(button)));

        lists.forEach((list) => { list.hidden = false; });
        show(Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')));
        if (location.hash === '#walkthrough') {
            const button = unlocks.find((b) => b.dataset.filmUnlock === 'filmPanel-walkthrough');
            if (button) unlock(button);
        }
    }

    /* ---- A film in parts ----
       The walkthrough with the CEO is seven files, one per chapter, under
       GitHub's file size limit, played as one film on one <video>: a
       chapter button loads its part (its source swapped in)
       and starts it, through the play pill (initFilms, js/common.js) if
       the film has not started; a part that ends hands over to the next.
       The chapter bar fills to the film's overall time. Without this
       script the first part plays and the chapters do nothing. */
    function initFilmParts(root) {
        const video = root.querySelector('video');
        const pill = root.querySelector('.film-play');
        const items = Array.from(root.querySelectorAll('.recap-chapters li'));
        if (!video || !items.length) return;
        const buttons = items.map((li) => li.querySelector('button'));
        const starts = buttons.map((b) => parseFloat(b.dataset.start) || 0);
        const total = parseFloat(root.dataset.total) || starts[starts.length - 1] + 60;
        let part = 0;
        let started = false;

        const load = (i) => {
            if (i === part) return;
            part = i;
            // One H.264 source per part (data-h264); an AV1 one would go first
            // as data-av1 and a second <source>.
            const sources = video.querySelectorAll('source');
            const urls = [buttons[i].dataset.av1, buttons[i].dataset.h264].filter(Boolean);
            sources.forEach((source, n) => { if (urls[n]) source.src = urls[n]; });
            video.removeAttribute('poster');   // no flash of the first frame's poster between parts
            video.load();
        };
        const play = (i, at) => {
            load(i);
            const go = () => {
                if (at) video.currentTime = at;
                video.play().catch(() => {});
            };
            if (pill && !pill.hidden) pill.click();
            if (video.readyState >= 1) go();
            else video.addEventListener('loadedmetadata', go, { once: true });
        };

        buttons.forEach((button, i) => {
            button.addEventListener('click', () => play(i, 0));
        });
        video.addEventListener('play', () => { started = true; mark(); });
        video.addEventListener('ended', () => {
            if (part + 1 < buttons.length) play(part + 1, 0);
        });
        ['timeupdate', 'seeked', 'pause'].forEach((name) => video.addEventListener(name, mark));

        function mark() {
            const now = starts[part] + video.currentTime;
            items.forEach((li, i) => {
                const start = starts[i];
                const end = i + 1 < starts.length ? starts[i + 1] : total;
                const fill = started ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 0;
                li.style.setProperty('--fill', fill.toFixed(4));
                const on = started && i === part;
                buttons[i].classList.toggle('is-current', on);
                if (on) buttons[i].setAttribute('aria-current', 'true');
                else buttons[i].removeAttribute('aria-current');
            });
        }
    }

    /* ---- Virtual launch ----
       The stations run in full down the list. The one in view is the
       picked one: its pin fills, its room tints, its furniture takes the
       accent, the visitor's ring walks to it, and its entry is tinted.
       A pin, a room's name, or the arrow keys
       scroll the page to a station, which then becomes the one in view.
       Without this script the pins are links to the stations. */
    function initTour() {
        const root = document.querySelector('[data-tour]');
        if (!root) return;

        const items = Array.from(root.querySelectorAll('.tour-item'));
        if (!items.length) return;
        const ids = items.map((item) => item.dataset.stop);

        // The pins become buttons and the stations lose their ids, so
        // common.js's hash scrolling (on a click, and its re-anchoring of
        // a #stop-… address on load) leaves the page to this script; a
        // #stop-… address is read below instead.
        items.forEach((item) => item.removeAttribute('id'));
        const pins = Array.from(root.querySelectorAll('.tour-pin')).map((link) => {
            const pin = document.createElement('button');
            pin.type = 'button';
            pin.className = link.className;
            pin.dataset.stop = link.dataset.stop;
            pin.setAttribute('style', link.getAttribute('style'));
            pin.setAttribute('aria-label', link.getAttribute('aria-label'));
            pin.textContent = link.textContent;
            link.replaceWith(pin);
            return pin;
        });

        const zones = Array.from(root.querySelectorAll('.tour-zone'));
        const grounds = Array.from(root.querySelectorAll('.plan-zone'));
        const marks = Array.from(root.querySelectorAll('.tour-svg [data-stop]'));
        const you = root.querySelector('.tour-you');
        const plan = root.querySelector('.tour-plan');
        const bar = document.getElementById('nav');
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        let index = -1;

        const show = (i) => {
            i = Math.max(0, Math.min(items.length - 1, i));
            if (i === index) return;
            index = i;
            const id = ids[i];
            const zone = items[i].dataset.zone;

            items.forEach((item, n) => item.classList.toggle('is-current', n === i));
            pins.forEach((pin) => {
                if (pin.dataset.stop === id) pin.setAttribute('aria-current', 'step');
                else pin.removeAttribute('aria-current');
            });
            zones.forEach((z) => z.classList.toggle('is-active', z.dataset.zone === zone));
            grounds.forEach((g) => g.classList.toggle('is-active', g.dataset.zone === zone));
            marks.forEach((m) => m.classList.toggle('is-current', m.dataset.stop === id));

            const pin = pins.find((p) => p.dataset.stop === id);
            if (you && pin) {
                ['--x', '--y', '--tx', '--ty'].forEach((v) => {
                    you.style.setProperty(v, pin.style.getPropertyValue(v));
                });
            }
        };

        // Where a station's top should land: under the nav, or, where the
        // plan sticks over the list (below 961px), under the plan.
        const landing = () => {
            if (!root.classList.contains('tour--tall') && plan && getComputedStyle(plan).position === 'sticky') {
                const top = parseFloat(getComputedStyle(plan).top) || 0;
                return top + plan.offsetHeight + 12;
            }
            return (bar ? bar.offsetHeight : 0) + 24;
        };

        // The station in view: the first one still on screen, so the plan
        // moves on to the next station as soon as one has scrolled out of
        // sight under the nav (or under the sticking plan).
        let lock = -1;          // a scroll started here, on its way to this station
        let lockTimer = 0;
        const spy = () => {
            if (lock >= 0) return;
            const line = landing() + 4;   // a hair of slack for rounding at a pin's landing
            let i = items.findIndex((item) => item.getBoundingClientRect().bottom > line);
            if (i < 0) i = items.length - 1;
            show(i);
        };
        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                spy();
            });
        };

        const release = () => {
            clearTimeout(lockTimer);
            lock = -1;
            spy();
        };

        const go = (i, instant) => {
            i = Math.max(0, Math.min(items.length - 1, i));
            show(i);
            if (history.replaceState) history.replaceState(null, '', `#stop-${ids[i]}`);
            const top = items[i].getBoundingClientRect().top + window.scrollY - landing();
            // The stations passed on the way are not picked.
            lock = i;
            clearTimeout(lockTimer);
            lockTimer = setTimeout(release, instant || reduce.matches ? 60 : 1200);
            window.scrollTo({ top: Math.max(0, top), behavior: instant || reduce.matches ? 'instant' : 'smooth' });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('scrollend', () => { if (lock >= 0) release(); });
        window.addEventListener('resize', onScroll);

        pins.forEach((pin) => {
            pin.addEventListener('click', () => go(ids.indexOf(pin.dataset.stop)));
        });
        zones.forEach((zone) => {
            zone.addEventListener('click', () => {
                go(items.findIndex((item) => item.dataset.zone === zone.dataset.zone));
            });
        });

        // Left / right while focus is in the section.
        root.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            go(index + (e.key === 'ArrowRight' ? 1 : -1));
        });

        // The upright plan beside the list on wide screens; the plan on
        // its side, over the list, below that.
        const svg = root.querySelector('.tour-svg');
        const tall = window.matchMedia('(min-width: 961px)');
        const orient = () => {
            root.classList.toggle('tour--tall', tall.matches);
            if (svg) svg.setAttribute('viewBox', tall.matches ? '570 110 900 1860' : '-70 0 1870 850');
        };
        orient();
        if (tall.addEventListener) tall.addEventListener('change', orient);

        root.classList.add('is-live');

        const fromHash = () => {
            const m = location.hash.match(/^#stop-([a-z-]+)$/);
            return m ? ids.indexOf(m[1]) : -1;
        };
        const start = fromHash();
        show(start >= 0 ? start : 0);
        if (start >= 0) {
            // A shared link to a station: scroll to it once the page has
            // settled.
            const later = () => setTimeout(() => go(start, true), 60);
            if (document.readyState === 'complete') later();
            else window.addEventListener('load', later, { once: true });
        } else {
            spy();
        }
        window.addEventListener('hashchange', () => {
            const i = fromHash();
            if (i >= 0) go(i, true);
        });
    }

    /* ---- Lightbox ----
       Each design on a station is a button carrying its large file
       (`data-full`) and a caption; it opens in a native <dialog>.
       Close button, a click outside the picture, or Escape close it. */
    function initLightbox() {
        const box = document.getElementById('recapBox');
        if (!box || typeof box.showModal !== 'function') return;
        const img = box.querySelector('img');
        const caption = box.querySelector('figcaption');
        const close = box.querySelector('.recap-box-close');

        document.querySelectorAll('.tour-shot[data-full]').forEach((shot) => {
            shot.addEventListener('click', () => {
                const thumb = shot.querySelector('img');
                img.src = shot.dataset.full;
                img.alt = thumb ? thumb.alt : '';
                caption.textContent = shot.dataset.caption || '';
                box.showModal();
            });
        });

        if (close) close.addEventListener('click', () => box.close());
        box.addEventListener('click', (e) => {
            if (e.target === box || e.target.classList.contains('recap-box-figure')) box.close();
        });
        box.addEventListener('close', () => {
            img.removeAttribute('src');
        });
    }
})();
