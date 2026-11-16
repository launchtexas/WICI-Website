/* The creator program page (partnerships/creators.html): the films block's
   deck of cards (a `data-demos` block holding a `.film` and `.cp-deck-ch`
   buttons), a click putting its film's sources, poster and title on the
   block's player and playing it (a copy of the homepage's initDemos in
   js/home.js, with the page's own class names; Oct 27, 2026). The pill and
   controls are the shared inline film's (initFilms in js/common.js). */
(function () {
    'use strict';
    function initDemos() {
        for (const block of document.querySelectorAll('[data-demos]')) {
            const figure = block.querySelector('.film');
            const video = figure && figure.querySelector('video');
            const deck = [...block.querySelectorAll('.cp-deck-ch')];
            if (!video || !deck.length) continue;
            const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
            const mark = (picked) => {
                for (const b of deck) {
                    b.classList.toggle('is-playing', b === picked);
                    b.setAttribute('aria-pressed', String(b === picked));
                }
            };
            for (const btn of deck) {
                btn.addEventListener('click', () => {
                    if (!btn.classList.contains('is-playing')) {
                        for (const src of [...video.querySelectorAll('source')]) src.remove();
                        for (const [key, type] of [['av1', 'video/mp4; codecs="av01.0.08M.08"'], ['h264', 'video/mp4; codecs="avc1.640028"']]) {
                            const src = document.createElement('source');
                            src.src = btn.dataset[key]; src.type = type;
                            video.append(src);
                        }
                        video.poster = btn.dataset.poster;
                        if (btn.dataset.title) video.setAttribute('aria-label', btn.dataset.title);
                        video.load();
                        mark(btn);
                    }
                    video.play().catch(() => {});
                    const r = figure.getBoundingClientRect();
                    if (r.top < 0 || r.bottom > window.innerHeight) figure.scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' });
                });
            }
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDemos);
    else initDemos();
})();
