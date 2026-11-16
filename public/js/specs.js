/* =========================================
   WiCi One benchmarks — workload switcher and accordion
   The #models band of wici-one.html carries the figures
   twice: each .models-table-wrap owns one slash-separated tab strip
   (.models-switch) that swaps which <tbody> and which .models-notes group
   of its table is visible (shown above 720px), and a .bench-acc accordion
   (shown at phone widths; also shop/wici-one.html's Benchmarks sheet at every
   width), animated by initAccordion below. Styles live in css/specs.css.
   ========================================= */

(function () {
    'use strict';

    function initSwitch(wrap) {
        const tabs = Array.from(wrap.querySelectorAll('.models-switch-tab'));
        const table = wrap.querySelector('.models-table');
        const groups = Array.from(wrap.querySelectorAll(
            '.models-table tbody[data-workload], .models-notes[data-workload]'
        ));
        if (!tabs.length || !groups.length) return;

        const select = (tab, { focus = false } = {}) => {
            const key = tab.dataset.workload;
            tabs.forEach((t) => {
                const on = t === tab;
                t.setAttribute('aria-selected', on ? 'true' : 'false');
                t.tabIndex = on ? 0 : -1;
            });
            groups.forEach((g) => {
                g.hidden = g.dataset.workload !== key;
            });
            // Point the table's description at the visible footnote
            // group only — aria-describedby flattens hidden targets
            // too, so a static all-groups list would read every
            // workload's notes at once.
            if (table) table.setAttribute('aria-describedby', 'models-notes-' + key);
            if (focus) tab.focus();
        };

        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => select(tab));
            tab.addEventListener('keydown', (event) => {
                let nextIndex = null;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
                if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = tabs.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                select(tabs[nextIndex], { focus: true });
            });
        });
    }

    /* Benchmark accordion (.bench-acc): slide the groups open and shut.
       Exclusivity moves from the <details> `name` attribute to this
       script so the closing group can animate out while the next one
       animates in; without the script the markup still works natively,
       just without motion. Height and bottom padding animate together
       (border-box can't shrink below its padding), and a click mid-way
       picks up from the current height. */
    function initAccordion(acc) {
        const groups = Array.from(acc.querySelectorAll('.bench-group'));
        if (!groups.length || typeof Element.prototype.animate !== 'function') return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease').trim()
            || 'cubic-bezier(0.2, 0.7, 0.2, 1)';

        function slide(group, opening) {
            const body = group.querySelector('.bench-group-body');
            if (reduce.matches) {
                group.open = opening;
                return;
            }
            const from = group.open ? body.getBoundingClientRect().height : 0;
            body.getAnimations().forEach((a) => a.cancel());
            group.open = true;
            const full = body.offsetHeight;
            const pad = parseFloat(getComputedStyle(body).paddingBottom) || 0;
            const ratio = full ? from / full : 0;
            body.style.overflow = 'hidden';
            const anim = body.animate([
                { height: from + 'px', paddingBottom: (pad * ratio) + 'px', opacity: ratio },
                { height: (opening ? full : 0) + 'px', paddingBottom: (opening ? pad : 0) + 'px', opacity: opening ? 1 : 0 },
            ], { duration: 280, easing });
            anim.onfinish = () => {
                body.style.overflow = '';
                if (!opening) group.open = false;
            };
            anim.oncancel = () => { body.style.overflow = ''; };
        }

        /* The product pages pin the open group's head under the nav on
           phones (position: sticky, css/product.css). When a head is
           tapped there, scroll it up to that line so the group reads from
           its title, allowing for a group above it collapsing at the same
           time. A head that isn't sticky (the buy sheet) is left alone. */
        function pinHead(group, closing) {
            const head = group.querySelector('summary');
            const style = getComputedStyle(head);
            if (style.position !== 'sticky') return;
            let delta = head.getBoundingClientRect().top - (parseFloat(style.top) || 0);
            closing.forEach((other) => {
                if (other.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    delta -= other.querySelector('.bench-group-body').getBoundingClientRect().height;
                }
            });
            if (Math.abs(delta) < 2) return;
            window.scrollBy({ top: delta, behavior: reduce.matches ? 'auto' : 'smooth' });
        }

        groups.forEach((group) => {
            group.removeAttribute('name');
            group.querySelector('summary').addEventListener('click', (event) => {
                event.preventDefault();
                if (group.open) {
                    slide(group, false);
                    return;
                }
                const closing = groups.filter((other) => other !== group && other.open);
                pinHead(group, closing);
                closing.forEach((other) => slide(other, false));
                slide(group, true);
            });
        });
    }

    /* Compare table (.vs-table-wrap): a row of dots above the table,
       one per device column, shown only while the wrap scrolls
       sideways. A dot fills when its column is fully in view past the
       pinned label column (a 5% tolerance for subpixel rounding), and
       pressing one scrolls just far enough to bring that column fully
       into view. The last column is padded so the scroll can run far
       enough to hide the WiCi column under the labels. A
       ResizeObserver covers the buy sheet, whose table has no size
       until the dialog opens. */
    function initCompareDots(wrap) {
        const table = wrap.querySelector('.vs-table');
        const heads = table ? Array.from(table.querySelectorAll('thead th:not(:first-child)')) : [];
        if (!heads.length) return;
        const pinned = table.querySelector('thead th:first-child');
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        const pinnedWidth = () => (pinned ? pinned.offsetWidth : 0);
        const dots = document.createElement('div');
        dots.className = 'vs-dots';
        dots.setAttribute('aria-label', 'Scroll the comparison to a column');
        heads.forEach((th) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'vs-dot';
            const name = Array.from(th.childNodes)
                .filter((n) => !(n.nodeType === 1 && (n.classList.contains('vs-fn') || n.tagName === 'IMG')))
                .map((n) => n.textContent).join('').trim();
            dot.setAttribute('aria-label', 'Show the ' + name + ' column');
            dot.addEventListener('click', () => {
                const a = th.offsetLeft;
                const b = a + th.offsetWidth;
                const viewLeft = wrap.scrollLeft + pinnedWidth();
                const viewRight = wrap.scrollLeft + wrap.clientWidth;
                let target = wrap.scrollLeft;
                if (b > viewRight) target += b - viewRight;
                else if (a < viewLeft) target -= viewLeft - a;
                target = Math.max(0, Math.min(target, wrap.scrollWidth - wrap.clientWidth));
                wrap.scrollTo({ left: target, behavior: reduce.matches ? 'auto' : 'smooth' });
            });
            dots.appendChild(dot);
        });
        dots.hidden = true;
        wrap.parentNode.insertBefore(dots, wrap);

        /* Trailing room in the last column so the first device column
           can slide fully under the pinned labels: scrolled to the end,
           only the other columns show, instead of a strip of the WiCi
           column beside the labels. Only while the table scrolls at
           all, so desktop is untouched. */
        const lastCells = Array.from(table.querySelectorAll('thead th:last-child, tbody td:last-child'));
        function fit() {
            lastCells.forEach((c) => { c.style.paddingRight = ''; });
            const range = table.offsetWidth - wrap.clientWidth;
            if (range <= 0 || heads.length < 2) return;
            const extra = heads[1].offsetLeft - pinnedWidth() - range;
            if (extra <= 0) return;
            lastCells.forEach((c) => {
                c.style.paddingRight = (parseFloat(getComputedStyle(c).paddingRight) + extra) + 'px';
            });
        }

        function update() {
            const scrollable = wrap.scrollWidth > wrap.clientWidth + 1;
            dots.hidden = !scrollable;
            if (!scrollable) return;
            const left = wrap.scrollLeft + pinnedWidth();
            const right = wrap.scrollLeft + wrap.clientWidth;
            heads.forEach((th, i) => {
                const a = th.offsetLeft;
                const b = a + th.offsetWidth;
                const seen = Math.max(0, Math.min(b, right) - Math.max(a, left));
                dots.children[i].classList.toggle('is-on', th.offsetWidth > 0 && seen / th.offsetWidth >= 0.95);
            });
        }

        const refit = () => { fit(); update(); };
        wrap.addEventListener('scroll', update, { passive: true });
        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(refit).observe(wrap);
        } else {
            window.addEventListener('resize', refit);
        }
        refit();
    }

    function init() {
        document.querySelectorAll('.models-table-wrap').forEach(initSwitch);
        document.querySelectorAll('.bench-acc').forEach(initAccordion);
        document.querySelectorAll('.vs-table-wrap').forEach(initCompareDots);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
