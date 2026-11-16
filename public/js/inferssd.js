(function () {
    'use strict';

    const ribbon = document.querySelector('.ssd-hero-art');
    if (ribbon) {
        const svg = ribbon.querySelector('svg');
        const streams = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        streams.classList.add('ssd-ribbon-streams');
        svg.querySelectorAll('g > path').forEach(function (path, index) {
            if (index % 8 !== 3) return;
            const stream = path.cloneNode(false);
            stream.setAttribute('pathLength', '1000');
            stream.style.animationDelay = -(index / 8) + 's';
            streams.appendChild(stream);
        });
        svg.appendChild(streams);

        // Pause decorative work when the hero or browser tab is out of view.
        let inView = false;
        function updateMotion() {
            ribbon.dataset.motion = inView && !document.hidden ? 'running' : 'paused';
        }
        const observer = new IntersectionObserver(function (entries) {
            inView = entries[0].isIntersecting;
            updateMotion();
        });
        observer.observe(ribbon);
        document.addEventListener('visibilitychange', updateMotion);
    }

    // Static content remains readable without JavaScript.
    document.querySelectorAll('[data-switcher]').forEach(function (group) {
        const kind = group.dataset.switcher;
        const buttons = Array.from(group.querySelectorAll('button[data-choice]'));
        // Each model owns its metric selection and result panels.
        const scope = group.closest('[data-panel="model"]') || document;
        const panels = Array.from(scope.querySelectorAll('[data-panel="' + kind + '"]'));
        function select(value) {
            buttons.forEach(function (button) {
                button.setAttribute('aria-pressed', String(button.dataset.choice === value));
            });
            panels.forEach(function (panel) { panel.hidden = panel.dataset.value !== value; });
        }
        buttons.forEach(function (button) {
            button.addEventListener('click', function () { select(button.dataset.choice); });
        });
        group.hidden = false;
        select(group.dataset.default);
    });

    document.querySelectorAll('.ssd-copy').forEach(function (button) {
        button.hidden = false;
        button.addEventListener('click', async function () {
            const code = document.getElementById(button.dataset.copy);
            try {
                await navigator.clipboard.writeText(code.textContent);
                button.textContent = 'Copied';
                button.dataset.copyStatus = 'copied';
            } catch (_) {
                const range = document.createRange();
                range.selectNodeContents(code);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                button.textContent = 'Select & copy';
                button.dataset.copyStatus = 'selected';
            }
            window.setTimeout(function () { button.textContent = 'Copy'; }, 2200);
        });
    });
}());
