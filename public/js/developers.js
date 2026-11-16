/* WiCi developer overview interactions */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        initReveal();
        initCodeModes();
        initDevForm();
    });

    function initReveal() {
        const targets = Array.from(document.querySelectorAll(
            '.dev-hero-copy, .dev-hero-aside, .dev-hero-figure, .dev-section-head, .dev-benefit-card, .dev-mode-intro, ' +
            '.dev-layer-copy, .dev-layer-flow, .dev-code-card, .dev-path, ' +
            '.dev-deeper-card, .dev-faq-row, .dev-access-inner'
        ));

        targets.forEach((element) => element.classList.add('reveal'));

        if (!('IntersectionObserver' in window)) {
            targets.forEach((element) => element.classList.add('is-visible'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

        targets.forEach((element) => observer.observe(element));
    }

    function initCodeModes() {
        const tablist = document.querySelector('.dev-modes');
        const tabs = Array.from(document.querySelectorAll('[data-code-mode]'));
        const panels = Array.from(document.querySelectorAll('[data-code-panel]'));
        if (!tablist || !tabs.length || !panels.length) return;

        const stackedLayout = window.matchMedia('(max-width: 960px)');
        let selectedMode = (tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0])
            .getAttribute('data-code-mode');

        const renderLayout = () => {
            if (stackedLayout.matches) {
                tablist.setAttribute('role', 'list');
                tabs.forEach((tab) => {
                    tab.setAttribute('role', 'heading');
                    tab.setAttribute('aria-level', '3');
                    tab.removeAttribute('aria-selected');
                    tab.disabled = true;
                    tab.tabIndex = -1;
                });
                panels.forEach((panel) => {
                    panel.setAttribute('role', 'region');
                    panel.hidden = false;
                });
                return;
            }

            tablist.setAttribute('role', 'tablist');
            tabs.forEach((tab) => {
                const selected = tab.getAttribute('data-code-mode') === selectedMode;
                tab.setAttribute('role', 'tab');
                tab.removeAttribute('aria-level');
                tab.disabled = false;
                tab.setAttribute('aria-selected', selected ? 'true' : 'false');
                tab.tabIndex = selected ? 0 : -1;
            });
            panels.forEach((panel) => {
                panel.setAttribute('role', 'tabpanel');
                panel.hidden = panel.getAttribute('data-code-panel') !== selectedMode;
            });
        };

        const selectMode = (tab, { focus = false } = {}) => {
            if (stackedLayout.matches) return;
            selectedMode = tab.getAttribute('data-code-mode');
            renderLayout();

            if (focus) tab.focus();
        };

        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => selectMode(tab));
            tab.addEventListener('keydown', (event) => {
                let nextIndex = null;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
                if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = tabs.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                selectMode(tabs[nextIndex], { focus: true });
            });
        });

        if (stackedLayout.addEventListener) {
            stackedLayout.addEventListener('change', renderLayout);
        } else {
            stackedLayout.addListener(renderLayout);
        }

        renderLayout();
    }

    function initDevForm() {
        const form = document.getElementById('devForm');
        if (!form) return;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const honey = form.querySelector('[name="_honey"]');
            if (honey && honey.value) return;

            const email = form.querySelector('[name="email"]').value || '';
            const message = form.querySelector('[name="message"]').value || '';
            const payload = window.WiCiSignup.withContext(form, {
                email,
                message,
            });

            form.querySelectorAll('input, textarea, button').forEach((element) => {
                element.disabled = true;
            });
            window.WiCiSignup.setPending(form);

            try {
                await window.WiCiSignup.submit(payload);
            } catch (error) {
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
                form_name: form.dataset.formName || 'developers-access',
            });
        });
    }
})();
