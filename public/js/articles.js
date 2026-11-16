/* The blog template's behaviour on every article (Oct 31, 2026; on the
   SSD article alone the day before): the reading time in the left column
   and the contents. Both lists mark the section on screen (the last
   heading above a line a third of the way down); the bar pinned under the
   nav appears once the rail list, or the header on phones, has scrolled
   above the nav. Clicks on the links are handled by common.js. */
(function () {
    'use strict';

    /* Reading time: the prose's words at 230 a minute, rounded. */
    (function () {
        const prose = document.querySelector('.article-prose');
        const out = document.getElementById('readTime');
        if (!prose || !out) return;
        const clone = prose.cloneNode(true);
        clone.querySelectorAll('.related, .figure, table, pre, script, style').forEach((el) => el.remove());
        const words = (clone.textContent.match(/\S+/g) || []).length;
        const minutes = Math.max(1, Math.round(words / 230));
        out.textContent = minutes + ' minute read';
    })();

    /* The contents. */
    (function () {
        const links = Array.from(document.querySelectorAll('#contents a[href^="#"]'));
        const barLinks = Array.from(document.querySelectorAll('#tocBarList a[href^="#"]'));
        const heads = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
        const bar = document.getElementById('tocBar');
        if (!heads.length || !bar) return;
        const nav = document.getElementById('nav');
        const aside = document.querySelector('.aside');
        const header = document.querySelector('.article-header');
        const toggle = bar.querySelector('.toc-bar-toggle');
        const toggleT = bar.querySelector('.toc-bar-t');
        const setOpen = (open) => {
            bar.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', String(open));
        };
        toggle.addEventListener('click', () => setOpen(!bar.classList.contains('is-open')));
        barLinks.forEach((a) => a.addEventListener('click', () => setOpen(false)));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
        document.addEventListener('click', (e) => { if (!bar.contains(e.target)) setOpen(false); });
        let ticking = false;
        const update = () => {
            ticking = false;
            const navH = nav ? nav.offsetHeight : 0;
            const line = navH + window.innerHeight * 0.3;
            let current = heads[0];
            heads.forEach((h) => { if (h.getBoundingClientRect().top <= line) current = h; });
            const href = '#' + current.id;
            links.concat(barLinks).forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === href));
            toggleT.textContent = current.textContent;
            bar.style.top = navH + 'px';
            const railShown = aside && getComputedStyle(aside).display !== 'none';
            const ref = railShown ? aside : header;
            const gone = ref && ref.getBoundingClientRect().bottom <= navH;
            bar.classList.toggle('is-shown', gone);
            if (!gone) setOpen(false);
        };
        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        }, { passive: true });
        window.addEventListener('resize', update);
        update();
    })();
})();
