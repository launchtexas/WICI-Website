/* =========================================
   WiCi — Protocol page interactivity
   - Reveal-on-scroll for dv- elements
   - Hero smoke rings: kgolid/p5ycho
     "smokerings", p5 calls translated to
     plain canvas, algorithm unchanged
   - Byrne card art for research receipts
   - Developer Preview access form
   ========================================= */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        initReveal();
        initPaperArt();
        initDevForm();
    });

    /* ---- Reveal on scroll ----
       common.js owns the shared selector list; this page's dv- elements
       get their own pass so common.js stays untouched (and uncached
       copies of it stay valid). Same classes, same observer settings. */
    function initReveal() {
        const targets = Array.from(document.querySelectorAll(
            '.dv-hero-text, .dv-hero-waves, .dv-section-head, .dv-layer, .dv-pillar, ' +
            '.dv-ledger, .dv-ledger-note, .dv-chain-step, .dv-equation, .dv-prose, ' +
            '.dv-collapse, .dv-stat, .dv-tiers, .dv-arith, .dv-contrast-panel, ' +
            '.dv-vram, .dv-ruler, .dv-voiceline, .dv-diff, .dv-hub, .dv-scenario, ' +
            '.dv-doc-card, .dv-paper, .dv-faq-row, .dv-close-beat, .dv-access-inner'
        ));
        targets.forEach(el => el.classList.add('reveal'));

        if (!('IntersectionObserver' in window)) {
            targets.forEach(el => el.classList.add('is-visible'));
            return;
        }

        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

        targets.forEach(el => io.observe(el));
    }

    function initPaperArt() {
        const paint = () => {
            if (!window.WiCiByrne) return;
            document.querySelectorAll('.dv-paper canvas[data-art-seed]').forEach((canvas) => {
                window.WiCiByrne.paint(canvas, canvas.getAttribute('data-art-seed'));
            });
        };
        paint();

        let timer = null;
        window.addEventListener('resize', () => {
            clearTimeout(timer);
            timer = setTimeout(paint, 150);
        });
    }

    /* ---- Developer access form (verified signup API) ---- */
    function initDevForm() {
        const form = document.getElementById('devForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const honey = form.querySelector('[name="_honey"]');
            if (honey && honey.value) return;

            const email = form.querySelector('[name="email"]').value || '';
            const message = form.querySelector('[name="message"]').value || '';
            const payload = window.WiCiSignup.withContext(form, {
                email,
                message,
            });

            form.querySelectorAll('input, textarea, button').forEach(el => el.disabled = true);
            window.WiCiSignup.setPending(form);

            try {
                await window.WiCiSignup.submit(payload);
            } catch (err) {
                const subject = encodeURIComponent('WiCi Developer Preview');
                const body = encodeURIComponent(`Email: ${email}\nBuilding: ${message}`);
                window.WiCiSignup.setError(
                    form,
                    `mailto:contact@wici.ai?subject=${subject}&body=${body}`
                );
                return;
            }

            window.WiCiSignup.setSuccess(form, 'Request received ✓');

            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'contact_form_submit',
                form_name: form.dataset.formName || 'technology-access',
            });
        });
    }
})();
