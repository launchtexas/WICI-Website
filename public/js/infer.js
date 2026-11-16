(function () {
    'use strict';
    const hero = document.querySelector('.infer-frontier');
    const svg = hero && hero.querySelector('svg.infer-hero-art');
    if (!svg) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const blocks = new Map();
    const groups = new Map();
    svg.querySelectorAll('[data-infer-block]').forEach(function (element) {
        const key = element.dataset.inferGroup || element;
        if (!groups.has(key)) groups.set(key, {elements: [], lines: [], x: 0, y: 0, vx: 0, vy: 0, returning: false});
        const group = groups.get(key);
        group.elements.push(element);
        blocks.set(element, group);
    });
    svg.querySelectorAll('[data-infer-branch]').forEach(function (element) {
        const group = groups.get(element.dataset.inferBranch);
        if (!group) return;
        const tip = element.dataset.inferTip.split(' ').map(Number);
        const anchor = element.dataset.inferAnchor.split(' ').map(Number);
        const dx = tip[0] - anchor[0], dy = tip[1] - anchor[1];
        const lengthSquared = dx * dx + dy * dy;
        const original = element.getAttribute('d');
        // The exported dashes are separate M/C segments. Deform their original
        // control points, preserving every dash and the supplied resting curve.
        const tokens = original.match(/[MC]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g);
        const points = [];
        for (let i = 0; i < tokens.length;) {
            if (tokens[i] === 'M' || tokens[i] === 'C') { points.push(tokens[i++]); continue; }
            const x = Number(tokens[i++]), y = Number(tokens[i++]);
            const t = Math.max(0, Math.min(1, ((x - anchor[0]) * dx + (y - anchor[1]) * dy) / lengthSquared));
            // Smoothstep keeps the center anchored and the moving tip tangent
            // steady, bending the middle of the connection instead of kinking it.
            points.push({x: x, y: y, weight: t * t * (3 - 2 * t)});
        }
        group.lines.push({element: element, original: original, points: points});
    });
    let active = null;
    let frame = 0;
    let previousTime = 0;
    let entranceObserver = null;
    let driftFrame = 0;
    let driftTime = 0;
    let artworkVisible = false;
    let windowFocused = true;
    let lastScroll = window.scrollY;
    let artworkScale = 1;
    const drifting = Array.from(groups.values()).filter(function (block) { return block.lines.length; });
    drifting.forEach(function (block, index) {
        block.driftX = block.driftY = block.bounce = block.bounceVelocity = 0;
        block.driftPhase = index * 1.7;
    });

    function paint(block) {
        const x = block.x + (block.driftX || 0);
        const y = block.y + (block.driftY || 0);
        block.elements.forEach(function (element) {
            element.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
        });
        block.lines.forEach(function (line) {
            line.element.setAttribute('d', line.points.map(function (point) {
                if (typeof point === 'string') return point;
                return (point.x + x * point.weight).toFixed(3) + ' ' + (point.y + y * point.weight).toFixed(3);
            }).join(' '));
        });
    }
    function rest(block) {
        block.x = block.y = block.vx = block.vy = 0;
        block.returning = false;
        block.delayUntil = 0;
        block.entry = false;
        block.swayStart = null;
        block.driftX = block.driftY = block.bounce = block.bounceVelocity = 0;
        block.elements.forEach(function (element) {
            element.removeAttribute('transform');
            element.classList.remove('is-pulling');
        });
        block.lines.forEach(function (line) { line.element.setAttribute('d', line.original); });
    }
    function releasePointer() {
        if (!active) return;
        const id = active.id;
        active.block.elements.forEach(function (element) { element.classList.remove('is-pulling'); });
        active = null;
        hero.classList.remove('is-pulling-block');
        if (hero.hasPointerCapture(id)) hero.releasePointerCapture(id);
    }
    function reset() {
        if (entranceObserver) { entranceObserver.disconnect(); entranceObserver = null; }
        hero.classList.remove('is-entering');
        releasePointer();
        window.cancelAnimationFrame(frame);
        frame = 0;
        groups.forEach(rest);
    }
    function settle(time) {
        const elapsed = Math.min((time - previousTime) / 1000, .032);
        previousTime = time;
        let pending = false;
        groups.forEach(function (block) {
            if (!block.returning) return;
            if (time < block.delayUntil) { pending = true; return; }
            if (block.swayStart != null) {
                const progress = Math.min(1, (time - block.swayStart) / 2400);
                if (progress === 1) { rest(block); return; }
                const envelope = Math.sin(Math.PI * progress) * Math.exp(-2 * progress);
                const wave = Math.sin(progress * Math.PI * 6 + block.swayPhase);
                block.x = Math.cos(block.swayPhase) * 8 * envelope * wave;
                block.y = Math.sin(block.swayPhase) * 6 * envelope * wave;
                paint(block);
                pending = true;
                return;
            }
            const stiffness = block.entry ? 100 : 240;
            const damping = block.entry ? 16 : 20;
            let remaining = elapsed;
            while (remaining > 0) {
                const dt = Math.min(remaining, 1 / 120);
                block.vx += (-stiffness * block.x - damping * block.vx) * dt;
                block.vy += (-stiffness * block.y - damping * block.vy) * dt;
                block.x += block.vx * dt;
                block.y += block.vy * dt;
                remaining -= dt;
            }
            if (block.entry && Math.hypot(block.x, block.y) < .35 && Math.hypot(block.vx, block.vy) < 2) {
                block.x = block.y = block.vx = block.vy = 0;
                block.swayStart = time;
                paint(block);
                pending = true;
            } else if (Math.hypot(block.x, block.y) < .1 && Math.hypot(block.vx, block.vy) < .8) rest(block);
            else { paint(block); pending = true; }
        });
        frame = pending ? window.requestAnimationFrame(settle) : 0;
        if (!pending) hero.classList.remove('is-entering');
    }
    function finish(event) {
        if (!active || event.pointerId !== active.id) return;
        const block = active.block;
        releasePointer();
        if (reducedMotion.matches || Math.hypot(block.x, block.y) < .1) { rest(block); return; }
        block.vx = block.vy = 0;
        block.returning = true;
        if (!frame) {
            previousTime = performance.now();
            frame = window.requestAnimationFrame(settle);
        }
    }
    function point(event, matrix) {
        return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    }
    function unbend(value, limit) {
        return limit * Math.atanh(Math.max(-.999999, Math.min(.999999, value / limit)));
    }
    hero.addEventListener('pointerdown', function (event) {
        if (!event.isPrimary || event.button !== 0 || active) return;
        const block = blocks.get(event.target.closest('[data-infer-block]'));
        if (!block) return;
        // Finish the entrance before handing direct manipulation to the visitor.
        if (hero.classList.contains('is-entering')) reset();
        // Convert screen coordinates through the responsive SVG viewBox.
        const screen = svg.getScreenCTM();
        if (!screen) return;
        const inverse = screen.inverse();
        const limit = 180 / Math.hypot(screen.a, screen.b);
        const start = point(event, inverse);
        active = {id: event.pointerId, block: block, inverse: inverse, limit: limit,
            start: start, x: unbend(block.x, limit), y: unbend(block.y, limit)};
        // Pick up the exact displayed position, including the small idle drift.
        block.x += block.driftX || 0;
        block.y += block.driftY || 0;
        active.x = unbend(block.x, limit);
        active.y = unbend(block.y, limit);
        block.driftX = block.driftY = block.bounce = block.bounceVelocity = 0;
        block.returning = false;
        block.elements.forEach(function (element) { element.classList.add('is-pulling'); });
        hero.classList.add('is-pulling-block');
        hero.setPointerCapture(event.pointerId);
        if (event.pointerType !== 'touch') event.preventDefault();
    });
    hero.addEventListener('pointermove', function (event) {
        if (!active || event.pointerId !== active.id) return;
        const current = point(event, active.inverse);
        active.block.x = active.limit * Math.tanh((current.x - active.start.x + active.x) / active.limit);
        active.block.y = active.limit * Math.tanh((current.y - active.start.y + active.y) / active.limit);
        paint(active.block);
    });
    hero.addEventListener('pointerup', finish);
    hero.addEventListener('pointercancel', finish);
    hero.addEventListener('lostpointercapture', finish);
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    window.addEventListener('keydown', function (event) { if (event.key === 'Escape') reset(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) reset(); });
    reducedMotion.addEventListener('change', reset);
    hero.classList.add('has-draggable-blocks');

    // Ambient movement uses screen-pixel amplitudes, so mobile scaling cannot
    // amplify it. It shares paint() with dragging, keeping each wire attached.
    function updateArtworkScale() {
        const matrix = svg.getScreenCTM();
        artworkScale = matrix ? Math.max(.1, Math.hypot(matrix.a, matrix.b)) : 1;
    }
    function drift(time) {
        driftFrame = 0;
        if (!artworkVisible || !windowFocused || document.hidden || reducedMotion.matches) return;
        const dt = Math.min((time - driftTime) / 1000 || 1 / 60, .04);
        driftTime = time;
        if (!entranceObserver && !hero.classList.contains('is-entering')) {
            drifting.forEach(function (block) {
                if (block.returning || active && active.block === block) return;
                block.bounceVelocity += (-64 * block.bounce - 10 * block.bounceVelocity) * dt;
                block.bounce = Math.max(-6, Math.min(6, block.bounce + block.bounceVelocity * dt));
                const phase = time / 1000 * .85 + block.driftPhase;
                const targetX = Math.sin(phase * .7) * 3 / artworkScale;
                const targetY = (Math.sin(phase) * 5 + block.bounce) / artworkScale;
                const blend = 1 - Math.exp(-5 * dt);
                block.driftX += (targetX - block.driftX) * blend;
                block.driftY += (targetY - block.driftY) * blend;
                paint(block);
            });
        }
        driftFrame = window.requestAnimationFrame(drift);
    }
    function syncDrift() {
        if (driftFrame) window.cancelAnimationFrame(driftFrame);
        driftFrame = 0;
        lastScroll = window.scrollY;
        if (artworkVisible && windowFocused && !document.hidden && !reducedMotion.matches) {
            driftTime = performance.now();
            driftFrame = window.requestAnimationFrame(drift);
        } else {
            drifting.forEach(function (block) {
                block.driftX = block.driftY = block.bounce = block.bounceVelocity = 0;
                if (!block.returning && !(active && active.block === block)) paint(block);
            });
        }
    }
    window.addEventListener('scroll', function () {
        const delta = Math.max(-40, Math.min(40, window.scrollY - lastScroll));
        lastScroll = window.scrollY;
        if (!artworkVisible || !windowFocused || document.hidden || reducedMotion.matches || entranceObserver || hero.classList.contains('is-entering')) return;
        drifting.forEach(function (block) {
            if (block.returning || active && active.block === block) return;
            const impulse = -delta * (.35 + .15 * Math.sin(block.driftPhase));
            block.bounceVelocity = Math.max(-42, Math.min(42, block.bounceVelocity + impulse));
        });
    }, {passive: true});
    window.addEventListener('resize', function () { updateArtworkScale(); syncDrift(); });
    window.addEventListener('blur', function () { windowFocused = false; syncDrift(); });
    window.addEventListener('focus', function () { windowFocused = true; syncDrift(); });
    document.addEventListener('visibilitychange', syncDrift);
    reducedMotion.addEventListener('change', syncDrift);
    updateArtworkScale();
    if ('IntersectionObserver' in window) {
        const driftObserver = new IntersectionObserver(function (entries) {
            artworkVisible = entries.some(function (entry) { return entry.isIntersecting; });
            updateArtworkScale();
            syncDrift();
        });
        driftObserver.observe(hero);
    }


    // Reveal once when the artwork is in view; reuse the drag spring and curve
    // deformation so tiles, terminals and wires remain one connected object.
    if (!reducedMotion.matches && 'IntersectionObserver' in window) {
        const entering = [];
        groups.forEach(function (block) {
            const boxes = block.elements.map(function (element) { return element.getBBox(); });
            const box = boxes.reduce(function (largest, current) {
                return current.width * current.height > largest.width * largest.height ? current : largest;
            });
            if (box.width * box.height < 900) return; // Central particle cluster stays anchored.
            const x = box.x + box.width / 2, y = box.y + box.height / 2;
            if (x < 400) block.x = -320;
            else if (x > 800) block.x = 320;
            else block.y = y < 337 ? -240 : 240;
            paint(block);
            entering.push(block);
        });
        entranceObserver = new IntersectionObserver(function (entries) {
            if (!entranceObserver || !entries.some(function (entry) { return entry.isIntersecting && entry.intersectionRatio >= .45; })) return;
            entranceObserver.disconnect();
            entranceObserver = null;
            hero.classList.add('is-entering');
            const now = performance.now();
            entering.forEach(function (block, index) {
                block.returning = true;
                block.entry = true;
                block.swayPhase = index * 1.2;
                block.delayUntil = now + 180 + (index % 5) * 80;
            });
            previousTime = now;
            if (!frame) frame = window.requestAnimationFrame(settle);
        }, {threshold: .45, rootMargin: '0px 0px -12% 0px'});
        entranceObserver.observe(hero);
    }
}());

(function () {
    'use strict';
    const nav = document.querySelector('.infer-local-nav');
    if (!nav) return;
    const toggle = nav.querySelector('.infer-local-toggle');
    const sectionsMenu = nav.querySelector('.infer-local-links');
    const narrow = window.matchMedia('(max-width: 960px)');
    const sections = Array.from(nav.querySelectorAll('[data-infer-section]')).map(function (link) {
        return {link: link, target: document.getElementById(link.dataset.inferSection)};
    }).filter(function (section) { return section.target; });

    // Download is a plain link to #get-started (the flyout went on Nov 3,
    // 2026), so the sections menu is the only menu here.
    function closeMenus() {
        sectionsMenu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', function () {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        sectionsMenu.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (event) {
        if (!event.target.closest('a')) return;
        // Keep keyboard focus on a visible control when the flyout closes.
        if (narrow.matches && sectionsMenu.contains(event.target)) toggle.focus({preventScroll: true});
        closeMenus();
    });
    nav.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        if (toggle.getAttribute('aria-expanded') === 'true') {
            closeMenus();
            toggle.focus();
        }
    });
    nav.addEventListener('focusout', function (event) {
        if (event.relatedTarget && !nav.contains(event.relatedTarget)) closeMenus();
    });
    document.addEventListener('pointerdown', function (event) {
        if (!nav.contains(event.target)) closeMenus();
    });
    narrow.addEventListener('change', closeMenus);
    nav.addEventListener('focusin', queueUpdate);

    const mainNav = document.getElementById('nav');
    if (mainNav) {
        mainNav.addEventListener('focusin', queueUpdate);
        mainNav.addEventListener('focusout', queueUpdate);
    }
    // A same-page hash link jumps with the main nav out of the way, whichever
    // way it goes, so the section lands under the product bar alone, as
    // data-nav-yields tells common.js. The demo's scroll bridge sits the jump
    // out too (infer-jump on <html>); infer:jumpend fires when scrolling stops.
    let jumping = false;
    let jumpIdle = 0;
    function settleJump() {
        window.clearTimeout(jumpIdle);
        jumpIdle = window.setTimeout(function () {
            jumping = false;
            delete document.documentElement.dataset.inferJump;
            window.dispatchEvent(new Event('infer:jumpend'));
        }, 160);
    }
    document.addEventListener('click', function (event) {
        const link = event.target.closest && event.target.closest('a[href^="#"]');
        const hash = link && link.getAttribute('href');
        if (!hash || hash === '#' || !document.getElementById(hash.slice(1))) return;
        jumping = true;
        document.documentElement.dataset.inferJump = '';
        settleJump();
    }, true);
    let pending = false;
    const hero = document.querySelector('.infer-hero');
    let pastHero = false;
    let lastScrollY = Math.max(0, window.scrollY);
    let scrollingUp = false;
    // Touch tablets take the phone's path: a finger scrolls the page natively.
    const phone = window.matchMedia('(max-width: 720px), (hover: none) and (pointer: coarse)');
    const demoPreview = document.getElementById('demo-preview');
    const downloadSheet = document.getElementById('get-started');
    let mobileDemoVisible = false;
    const lightSections = Array.from(document.querySelectorAll('#research, #benchmarks, #app, #wici-one, .footer'));
    function updateCurrentSection() {
        pending = false;
        const headerHeight = mainNav ? mainNav.offsetHeight : 0;
        // A small return buffer keeps trackpad jitter at the hero boundary
        // from repeatedly reversing the fade. Navigation never shifts the page.
        const heroBottom = hero ? hero.getBoundingClientRect().bottom : -window.scrollY;
        if (heroBottom <= headerHeight) pastHero = true;
        else if (heroBottom > headerHeight + 24) pastHero = false;
        // Below the hero the header takes its dark tint; over the photo it is light glass.
        if (mainNav) mainNav.classList.toggle('is-past-hero', pastHero);
        const mainNavInUse = document.documentElement.classList.contains('nav-menu-open') ||
            mainNav && (mainNav.querySelector(':focus-visible') || mainNav.querySelector('[aria-expanded="true"]'));
        const showProductNav = pastHero;
        // Keep the phone's navigation at one stable height throughout the demo
        // and its download handoff. Upward iframe input must not reveal another
        // header above it. Measure the fixed product bar's height, not its
        // animated position, and leave a return buffer at both boundaries.
        if (phone.matches && demoPreview && downloadSheet) {
            const demoTop = demoPreview.getBoundingClientRect().top;
            const sheetTop = downloadSheet.getBoundingClientRect().top;
            const barHeight = nav.offsetHeight;
            if (demoTop < window.innerHeight && sheetTop > barHeight) mobileDemoVisible = true;
            else if (demoTop > window.innerHeight + 32 || sheetTop < barHeight - 32) mobileDemoVisible = false;
        } else mobileDemoVisible = false;
        const hideMainNav = showProductNav && (!scrollingUp || mobileDemoVisible) && !mainNavInUse;
        if (mainNav) {
            mainNav.classList.toggle('is-product-nav-active', hideMainNav);
            mainNav.inert = hideMainNav;
        }
        nav.style.setProperty('--infer-main-nav-offset', !hideMainNav ? headerHeight + 'px' : '0px');
        nav.classList.toggle('is-shown', showProductNav);
        nav.inert = !showProductNav;
        if (!showProductNav) closeMenus();
        const navBounds = nav.getBoundingClientRect();
        const navBottom = Math.max(0, navBounds.bottom);
        const navMiddle = navBounds.top + navBounds.height / 2;
        nav.classList.toggle('is-light', lightSections.some(function (section) {
            const bounds = section.getBoundingClientRect();
            return bounds.top <= navMiddle && bounds.bottom > navMiddle;
        }));
        const threshold = navBottom + 25;
        let current = sections[0];
        sections.forEach(function (section) {
            if (section.target.getBoundingClientRect().top <= threshold) current = section;
        });
        sections.forEach(function (section) {
            if (section === current) section.link.setAttribute('aria-current', 'location');
            else section.link.removeAttribute('aria-current');
        });
    }
    function queueUpdate() {
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(updateCurrentSection);
    }
    nav.classList.add('is-enhanced');
    toggle.hidden = false;
    window.addEventListener('scroll', function () {
        // A fixed-body mobile menu temporarily reports scrollY = 0.
        if (document.documentElement.classList.contains('nav-menu-open')) return;
        const scrollY = Math.max(0, window.scrollY);
        // No distance threshold: the first upward movement reveals both bars.
        if (jumping) {
            scrollingUp = false;
            settleJump();
        } else if (scrollY !== lastScrollY) scrollingUp = scrollY < lastScrollY;
        lastScrollY = scrollY;
        queueUpdate();
    }, {passive: true});
    window.addEventListener('resize', queueUpdate);
    window.addEventListener('load', queueUpdate);
    updateCurrentSection();
}());

(function () {
    'use strict';
    const frame = document.getElementById('infer-demo');
    const stage = document.querySelector('.infer-preview-stage');
    if (!frame || !stage) return;
    // Touch tablets take the phone's path: a finger scrolls the page natively.
    const phone = window.matchMedia('(max-width: 720px), (hover: none) and (pointer: coarse)');
    const originalTitle = frame.title;
    const source = frame.getAttribute('src');
    function updatePreviewMode() {
        frame.inert = false;
        frame.setAttribute('data-static-preview', String(phone.matches));
        frame.title = phone.matches ? 'WiCi Infer app preview with simulated data' : originalTitle;
        stage.removeAttribute('role');
        stage.removeAttribute('aria-label');
        // A fresh Home screen on each mode change; never retain a scrolled or
        // selected desktop pane in the phone's non-scrolling presentation.
        const target = source + (phone.matches ? '?static=1' : '');
        if (frame.getAttribute('src') !== target) frame.setAttribute('src', target);
    }
    phone.addEventListener('change', updatePreviewMode);
    updatePreviewMode();
}());

(function () {
    'use strict';
    var frame = document.getElementById('infer-demo');
    if (!frame) return;
    var root = document.documentElement;
    var preview = document.getElementById('demo-preview');
    var downloadSheet = document.getElementById('get-started');
    var managesOwnership = !!(preview && downloadSheet);
    var owner = 'page';
    var released = false;
    var departed = false;
    var releaseDirection = 1;
    var previousY = window.scrollY;
    function previewReady() {
        if (frame.getAttribute && frame.getAttribute('data-static-preview') === 'true') return false;
        if (!managesOwnership) return true;
        var style = window.getComputedStyle(preview);
        var rect = preview.getBoundingClientRect();
        var app = frame.getBoundingClientRect();
        var sheet = downloadSheet.getBoundingClientRect();
        var top = parseFloat(style.top) || 0;
        // Short/reduced-motion layouts are not sticky: their fully visible
        // frame can still receive input, without trapping an oversized frame.
        var pinned = style.position !== 'sticky' || Math.abs(rect.top - top) <= 2;
        return pinned && app.top >= -1 && app.bottom <= window.innerHeight + 1 && sheet.top >= app.bottom - 1;
    }
    function publishOwner() {
        frame.contentWindow.postMessage({type: 'wici-infer:scroll-owner', innerAllowed: owner === 'inner'}, location.origin);
    }
    function updateOwner() {
        if (!managesOwnership) return;
        var y = window.scrollY;
        if (root.dataset.inferJump !== undefined) {
            // A hash jump passes through the demo without being caught by it;
            // where it lands is judged afresh when it stops.
            if (owner === 'inner') { owner = 'page'; publishOwner(); }
            released = false; departed = false; previousY = y;
            return;
        }
        var direction = Math.sign(y - previousY);
        previousY = y;
        var ready = previewReady();
        if (owner === 'inner' && !ready) {
            owner = 'page'; released = true; departed = true;
            releaseDirection = direction || 1;
            publishOwner();
        } else if (owner === 'page') {
            if (released && !ready) {
                departed = true;
                var pinTop = parseFloat(window.getComputedStyle(preview).top) || 0;
                // Re-enter from whichever side the visitor actually left,
                // including reversing above the demo before reaching downloads.
                releaseDirection = preview.getBoundingClientRect().top > pinTop + 2 ? -1 : 1;
            }
            if (ready && (!released || (departed && direction === -releaseDirection))) {
                owner = 'inner'; released = false; departed = false;
                // Finish the approach at the app, rather than letting residual
                // page momentum immediately carry the download sheet over it.
                var lenis = window.lenis;
                if (lenis && typeof lenis.scrollTo === 'function') lenis.scrollTo(y, {immediate: true});
                publishOwner();
            }
        }
    }
    function releaseToPage(delta) {
        if (!managesOwnership || owner !== 'inner' || !delta) return;
        owner = 'page'; released = true; departed = false;
        releaseDirection = Math.sign(delta);
        publishOwner();
    }
    function connectScrollBridge() {
        updateOwner();
        frame.contentWindow.postMessage({
            type: 'wici-infer:scroll-bridge',
            enabled: true,
            touch: true,
            boundaryPause: window.innerHeight * 0.1,
            innerAllowed: managesOwnership ? owner === 'inner' : undefined
        }, location.origin);
    }
    // The page's own locks: the mobile menu, the buy sheet, an open dialog
    // (common.js holds Lenis for the same states).
    function locked() {
        var lenis = window.lenis;
        if (lenis && (lenis.isStopped || lenis.isLocked)) return true;
        return root.classList.contains('nav-menu-open') || root.classList.contains('has-sheet') || !!document.querySelector('dialog[open]');
    }
    function scrollPreview(data) {
        var lenis = window.lenis;
        if (locked()) return;
        if (typeof data.inside !== 'boolean' || !Number.isFinite(data.deltaY) ||
            ![0, 1, 2].includes(data.deltaMode)) return;
        if (data.inside) {
            // Cancel residual page momentum as soon as the app takes the wheel,
            // without stop/start (which would also change the page's scroll lock).
            if (lenis && typeof lenis.scrollTo === 'function') lenis.scrollTo(window.scrollY, {immediate: true});
            return;
        }
        releaseToPage(data.deltaY);
        // Match Lenis's wheel normalization and easing, including accumulated
        // targetScroll so rapid trackpad events do not keep restarting the motion.
        var unit = data.deltaMode === 1 ? 100 / 6 : data.deltaMode === 2 ? window.innerHeight : 1;
        if (!lenis || typeof lenis.scrollTo !== 'function') {
            window.scrollBy(0, data.deltaY * unit);
            return;
        }
        lenis.scrollTo(lenis.targetScroll + data.deltaY * unit * lenis.options.wheelMultiplier, {
            programmatic: false,
            lerp: lenis.options.lerp,
            duration: lenis.options.duration,
            easing: lenis.options.easing
        });
    }
    // A swipe the preview cannot take moves the page by the finger's distance,
    // then glides with the release speed. Native touch scrolling never reaches
    // Lenis, so this works with or without it.
    function touchPreview(data) {
        if (locked()) return;
        var lenis = window.lenis && typeof window.lenis.scrollTo === 'function' ? window.lenis : null;
        if (data.phase === 'start') {
            if (lenis) lenis.scrollTo(window.scrollY, {immediate: true});
        } else if (data.phase === 'move') {
            if (!Number.isFinite(data.deltaY)) return;
            releaseToPage(data.deltaY);
            if (lenis) lenis.scrollTo(window.scrollY + data.deltaY, {immediate: true});
            else window.scrollBy(0, data.deltaY);
        } else if (data.phase === 'end') {
            if (!Number.isFinite(data.velocity) || Math.abs(data.velocity) < 0.25) return;
            var limit = window.innerHeight * 2.5;
            var distance = Math.max(-limit, Math.min(limit, data.velocity * 350));
            if (lenis) lenis.scrollTo(window.scrollY + distance, {programmatic: false, duration: 1, easing: lenis.options.easing});
            else window.scrollBy({top: distance, behavior: 'smooth'});
        }
    }
    window.addEventListener('message', function (event) {
        if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data) return;
        if (event.data.type === 'wici-infer:wheel') scrollPreview(event.data);
        else if (event.data.type === 'wici-infer:touch') touchPreview(event.data);
    });
    // Covers a cached iframe mounting before this page's scripts finish loading.
    frame.addEventListener('load', connectScrollBridge);
    window.addEventListener('resize', connectScrollBridge);
    window.addEventListener('scroll', updateOwner, {passive: true});
    window.addEventListener('infer:jumpend', updateOwner);
    // common.js creates Lenis on DOMContentLoaded, after this script runs.
    document.addEventListener('DOMContentLoaded', connectScrollBridge);
    connectScrollBridge();
}());

/* Email signups (#researchUpdatesForm in the lab-notes band). Same flow as the newsletter forms on the product
   page: honeypot, shared submit through js/signup.js (which adds form_name,
   list, source_page and the campaign context), then the GTM
   newsletter_signup event tagged with the form name so each source stays
   distinguishable in analytics too. Each form's button labels and mailto
   subject come from its data-signup-pending / -done / -subject. */
(function () {
    'use strict';

    if (!window.WiCiSignup) return;

    function bind(form) {
        if (!form) return;

        form.addEventListener('submit', async function (event) {
            event.preventDefault();

            const honey = form.querySelector('[name="_honey"]');
            if (honey && honey.value) return;

            const email = form.querySelector('[name="email"]').value || '';
            const fields = { email };
            if (form.dataset.cta) fields.cta = form.dataset.cta;
            const payload = window.WiCiSignup.withContext(form, fields);

            form.querySelectorAll('input, button').forEach(function (element) { element.disabled = true; });
            window.WiCiSignup.setPending(form, form.dataset.signupPending || 'Sending…');

            try {
                await window.WiCiSignup.submit(payload);
            } catch (error) {
                const subject = encodeURIComponent(form.dataset.signupSubject || 'WiCi Infer updates');
                const body = encodeURIComponent('Email: ' + email);
                window.WiCiSignup.setError(form, 'mailto:contact@wici.ai?subject=' + subject + '&body=' + body);
                return;
            }

            window.WiCiSignup.setSuccess(form, form.dataset.signupDone || 'Subscribed ✓');

            window.dataLayer = window.dataLayer || [];
            const conversion = {
                event: 'newsletter_signup',
                form_name: form.dataset.formName,
            };
            if (form.dataset.cta) conversion.cta = form.dataset.cta;
            window.dataLayer.push(conversion);
            form.dispatchEvent(new CustomEvent('wici:signup', { bubbles: true }));
        });
    }

    bind(document.getElementById('researchUpdatesForm'));

    /* Phones and tablets (html.infer-mobile, set in the page head) cannot
       install a desktop app, so there both download buttons open a dialog
       (#inferDownloadDialog; wired in the picker block below): an email field
       for the link, a Newsletter signup (newsletter_signup with form_name
       infer-mobile-download-link, plus cta: download), over the two
       installers for those who want one anyway. A browser without
       <dialog> gets the desktop buttons back. */
    const dialog = document.getElementById('inferDownloadDialog');
    if (dialog) {
        const root = document.documentElement;
        if (typeof dialog.showModal !== 'function') {
            root.classList.remove('infer-mobile');
        } else {
            const form = dialog.querySelector('.infer-mlink-form');
            const note = dialog.querySelector('.infer-mlink-note');
            bind(form);
            form.addEventListener('wici:signup', function () { note.hidden = false; });
            // The class tells js/common.js to hold Lenis while the dialog is open.
            dialog.addEventListener('close', function () { root.classList.remove('infer-dl-open'); });
            dialog.querySelector('.infer-dl-close').addEventListener('click', function () { dialog.close(); });
            dialog.addEventListener('click', function (event) {
                const box = dialog.getBoundingClientRect();
                const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
                if (event.target === dialog && !inside) dialog.close();
            });
            window.WiCiInferDownloadDialog = function () {
                if (dialog.open) return;
                dialog.showModal();
                root.classList.add('infer-dl-open');
            };
        }
    }
})();

// Independent disclosures share a horizontal row and full-width content area.
(function () {
    const notes = document.getElementById('benchmark-notes');
    if (!notes) return;
    const triggers = notes.querySelector('.infer-note-triggers');
    if (!triggers) return;
    const buttons = Array.from(triggers.querySelectorAll('button[aria-controls]'));
    function setOpen(button, open) {
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        button.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
    }
    buttons.forEach(function (button) {
        setOpen(button, false);
        button.addEventListener('click', function () {
            setOpen(button, button.getAttribute('aria-expanded') !== 'true');
        });
    });
    notes.classList.add('is-enhanced');
    triggers.hidden = false;
    function revealHash() {
        buttons.forEach(function (button) {
            if (window.location.hash === '#' + button.getAttribute('aria-controls')) setOpen(button, true);
        });
    }
    revealHash();
    window.addEventListener('hashchange', revealHash);
}());

// Native disclosure, with dismissal matching the other page dropdowns.
(function () {
    // The primary button follows the visitor's system (html[data-infer-os], set
    // in the page head): the Windows installer on Windows, and on a system the
    // page cannot name it opens the menu instead of downloading.
    const os = (document.documentElement.dataset || {}).inferOs;
    document.querySelectorAll('.infer-download-picker').forEach(function (picker) {
    const split = picker.closest('.infer-download-split');
    const primary = split.querySelector(':scope > .cta');
    if (os === 'windows' && primary.hasAttribute('data-download')) {
        primary.href = picker.querySelector('a[data-download="windows"]').href;
        primary.dataset.download = 'windows';
    }
    // On phones and tablets both primary buttons open the download dialog.
    const openDialog = document.documentElement.classList && document.documentElement.classList.contains('infer-mobile') && window.WiCiInferDownloadDialog;
    if (openDialog) {
        primary.setAttribute('href', '#');
        primary.removeAttribute('data-download');
        primary.setAttribute('role', 'button');
        primary.setAttribute('aria-haspopup', 'dialog');
        primary.addEventListener('click', function (event) {
            event.preventDefault();
            openDialog();
        });
    } else if (os === 'unknown') {
        // "#" so neither the hash-link scroll (js/common.js) nor a download
        // click (GTM, a[data-download]) answers this button.
        primary.setAttribute('href', '#');
        primary.removeAttribute('data-download');
        primary.setAttribute('role', 'button');
        primary.setAttribute('aria-haspopup', 'true');
        primary.addEventListener('click', function (event) {
            event.preventDefault();
            picker.open = !picker.open;
        });
    }
    document.addEventListener('click', function (event) {
        if (!split.contains(event.target)) picker.open = false;
    });
    picker.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            picker.open = false;
            picker.querySelector('summary').focus();
        }
    });
    picker.addEventListener('focusout', function (event) {
        if (!picker.contains(event.relatedTarget)) picker.open = false;
    });
    });
}());
