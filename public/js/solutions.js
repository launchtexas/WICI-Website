/* =========================================
   WiCi — Solutions pages
   Loaded by local-ai.html and creative-production.html.
   - Demo film: the product page's 10-second teaser plays muted
     when scrolled into view; "Play the full film" swaps in the
     full cut with sound (data-full-av1 / data-full-h264) under the
     site's own controls (window.WiCiFilm, js/common.js).
   ========================================= */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-film]').forEach(initFilm);
    });

    function initFilm(figure) {
        const video = figure.querySelector('video');
        const button = figure.querySelector('.sol-film-full');
        if (!video) return;

        let full = false;

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (full) return;
                    if (entry.isIntersecting) {
                        video.play().catch(() => {});
                    } else {
                        video.pause();
                    }
                });
            }, { threshold: 0.4 });
            io.observe(video);
        }

        if (!button) return;
        button.addEventListener('click', () => {
            const av1 = figure.dataset.fullAv1;
            const h264 = figure.dataset.fullH264;
            if (!av1 && !h264) return;
            full = true;
            video.pause();
            video.innerHTML = '';
            if (av1) {
                const s = document.createElement('source');
                s.src = av1; s.type = 'video/mp4; codecs="av01.0.08M.08"';
                video.appendChild(s);
            }
            if (h264) {
                const s = document.createElement('source');
                s.src = h264; s.type = 'video/mp4; codecs="avc1.640028"';
                video.appendChild(s);
            }
            video.muted = false;
            video.loop = false;
            // The site's own controls (js/common.js, shared with every
            // other film since Oct 29, 2026); the browser's without them.
            if (window.WiCiFilm) window.WiCiFilm.controls(figure, video); else video.controls = true;
            video.load();
            video.play().catch(() => {});
            button.hidden = true;
        });
    }
})();
