/* =========================================
   WiCi — Event page interactivity
   Loaded by events/wici-one-launch.html only.
   - The hero collage's teaser
   ========================================= */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        initCollageVideos();
    });

    // The hero collage's cut-out plays its muted teaser a fixed number of
    // times (data-plays-max, default 2) and then rests on its last frame, the
    // closing title card. The OS reduced-motion setting keeps the poster.
    function initCollageVideos() {
        const videos = document.querySelectorAll('.ev-collage-slot video');
        if (!videos.length) return;
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const play = (video) => {
            const attempt = video.play();
            if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
        };
        videos.forEach((video) => {
            if (reduce) {
                video.removeAttribute('autoplay');
                video.pause();
                return;
            }
            const max = Math.max(1, parseInt(video.dataset.playsMax || '2', 10) || 2);
            let plays = 0;
            video.addEventListener('ended', () => {
                plays += 1;
                video.dataset.plays = String(plays);
                if (plays < max) {
                    video.currentTime = 0;
                    play(video);
                }
                // Otherwise stay on the final frame.
            });
            play(video);
        });
        if (reduce) return;
        // Browsers pause background media; nudge an unfinished play back
        // when the page returns to view.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            videos.forEach((video) => { if (video.paused && !video.ended) play(video); });
        });
    }
})();
