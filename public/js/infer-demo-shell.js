(function () {
    'use strict';
    var timer;
    window.addEventListener('infer-demo-notice', function (event) {
        var notice = document.getElementById('demo-notice');
        notice.textContent = event.detail;
        clearTimeout(timer);
        timer = setTimeout(function () { notice.textContent = ''; }, 6000);
    });
    // Phone menus remain clickable and nothing inside scrolls, so the browser
    // pans the page natively. Never move the page from here: that carries this
    // frame under the finger and feeds back into its own touch coordinates.
    if (location.search === '?static=1') {
        document.documentElement.classList.add('infer-static-preview');
        return;
    }
    // Wheel and touch input do not bubble out of an iframe. Keep the app's
    // native scrollers, and hand only their overflow to the page.
    var bridgeWheel = false;
    var bridgeTouch = false;
    var ownershipManaged = false;
    var innerAllowed = true;
    function setInnerAllowed(value) {
        var changed = innerAllowed !== value;
        innerAllowed = value;
        document.documentElement.classList.toggle('infer-page-scroll', !value);
        if (changed) resetBoundary();
        if (value && gesture && gesture.page) {
            gesture.page = false;
            gesture.manual = true;
            gesture.samples = [{time: gesture.lastTime, y: gesture.lastY}];
        }
    }
    function handOff() {
        if (ownershipManaged) setInnerAllowed(false);
    }
    var boundaryPause = 0;
    var boundaryPane = null;
    var boundarySpent = 0;
    function resetBoundary() { boundaryPane = null; boundarySpent = 0; }
    // A short distance at the bottom lets visitors finish reading before the
    // download sheet moves over the demo. Chrome and upward input stay direct.
    function pauseAtBottom(path, deltaY) {
        if (deltaY < 0) { resetBoundary(); return deltaY; }
        if (!deltaY || !boundaryPause) return deltaY;
        var pane = path.find(function (element) {
            if (!(element instanceof HTMLElement)) return false;
            var overflow = getComputedStyle(element).overflowY;
            return (overflow === 'auto' || overflow === 'scroll') && element.scrollHeight - element.clientHeight > 1;
        });
        if (!pane) return deltaY;
        if (pane !== boundaryPane) { boundaryPane = pane; boundarySpent = 0; }
        var held = Math.min(deltaY, Math.max(0, boundaryPause - boundarySpent));
        boundarySpent += held;
        return deltaY - held;
    }
    window.addEventListener('message', function (event) {
        if (event.origin !== location.origin || event.source !== window.parent || window.parent === window) return;
        if (!event.data) return;
        if ((event.data.type === 'wici-infer:scroll-bridge' || event.data.type === 'wici-infer:scroll-owner') && typeof event.data.innerAllowed === 'boolean') {
            ownershipManaged = true;
            setInnerAllowed(event.data.innerAllowed);
        }
        if (event.data.type === 'wici-infer:scroll-bridge') {
            bridgeWheel = event.data.enabled === true;
            bridgeTouch = event.data.touch === true;
            if (Number.isFinite(event.data.boundaryPause)) boundaryPause = Math.max(0, event.data.boundaryPause);
        }
    });
    // Whether a pane on the event's path can still scroll the way the content
    // would move: deltaY > 0 reads like the wheel, the content going up.
    function canScroll(path, deltaY) {
        return path.some(function (element) {
            if (!(element instanceof HTMLElement)) return false;
            var overflow = getComputedStyle(element).overflowY;
            if (overflow !== 'auto' && overflow !== 'scroll') return false;
            var limit = element.scrollHeight - element.clientHeight;
            return limit > 1 && (deltaY > 0 ? element.scrollTop < limit - 1 : element.scrollTop > 1);
        });
    }
    function tell(data) {
        window.parent.postMessage(data, location.origin);
    }
    // Spend a wheel delta once, from the innermost pane outward. A large
    // gesture can finish a pane and pass its remainder to the page immediately.
    function consumeWheel(path, deltaY) {
        var remaining = deltaY;
        path.forEach(function (element) {
            if (!remaining || !(element instanceof HTMLElement)) return;
            var overflow = getComputedStyle(element).overflowY;
            if (overflow !== 'auto' && overflow !== 'scroll') return;
            var limit = Math.max(0, element.scrollHeight - element.clientHeight);
            if (limit <= 1) return;
            var before = Math.max(0, Math.min(limit, element.scrollTop));
            element.scrollTop = Math.max(0, Math.min(limit, before + remaining));
            remaining -= element.scrollTop - before;
        });
        return remaining;
    }
    window.addEventListener('wheel', function (event) {
        if (!bridgeWheel || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey ||
            !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        var path = event.composedPath();
        var unit = event.deltaMode === 1 ? 100 / 6 : event.deltaMode === 2 ? window.innerHeight : 1;
        var delta = event.deltaY * unit;
        if (!innerAllowed) {
            if (event.cancelable) event.preventDefault();
            tell({type: 'wici-infer:wheel', inside: false, deltaY: delta, deltaMode: 0});
            return;
        }
        if (!event.cancelable) {
            var inside = canScroll(path, delta);
            if (inside) resetBoundary();
            var overflow = inside ? 0 : pauseAtBottom(path, delta);
            if (!inside && Math.abs(overflow) >= 0.5) handOff();
            tell({type: 'wici-infer:wheel', inside: inside || Math.abs(overflow) < 0.5, deltaY: overflow, deltaMode: 0});
            return;
        }
        event.preventDefault();
        var remaining = consumeWheel(path, delta);
        if (Math.abs(delta - remaining) > 0.5) resetBoundary();
        remaining = pauseAtBottom(path, remaining);
        if (Math.abs(remaining) >= 0.5) handOff();
        tell({type: 'wici-infer:wheel', inside: Math.abs(remaining) < 0.5, deltaY: remaining, deltaMode: 0});
    }, {passive: false});

    // Native touch stays with its pane until it reaches an edge. Keep observing
    // the gesture so the next movement can continue on the parent page.
    var gesture = null;
    window.addEventListener('touchstart', function (event) {
        gesture = null;
        if (!bridgeTouch || event.touches.length !== 1) return;
        var touch = event.touches[0];
        gesture = {path: event.composedPath(), x: touch.clientX, y: touch.clientY, lastY: touch.clientY,
            samples: [{time: event.timeStamp, y: touch.clientY}], page: false, vertical: false, manual: !innerAllowed, lastTime: event.timeStamp};
        tell({type: 'wici-infer:touch', phase: 'start'}); // Ends a glide still running on the page.
    }, {passive: true});
    window.addEventListener('touchmove', function (event) {
        if (!gesture || event.touches.length !== 1) return;
        var touch = event.touches[0];
        var deltaY = gesture.lastY - touch.clientY;
        if (!gesture.vertical) {
            var dx = touch.clientX - gesture.x;
            var dy = touch.clientY - gesture.y;
            if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
            if (Math.abs(dx) > Math.abs(dy)) { gesture = null; return; }
            gesture.vertical = true;
        }
        gesture.lastTime = event.timeStamp;
        if (innerAllowed && !gesture.page && gesture.manual) {
            if (event.cancelable) event.preventDefault();
            var remaining = consumeWheel(gesture.path, deltaY);
            if (Math.abs(remaining - deltaY) > 0.5) resetBoundary();
            deltaY = remaining;
        } else if (innerAllowed && !gesture.page && canScroll(gesture.path, deltaY)) {
            resetBoundary();
            gesture.lastY = touch.clientY;
            gesture.samples = [{time: event.timeStamp, y: touch.clientY}];
            return;
        }
        if (event.cancelable) event.preventDefault();
        gesture.lastY = touch.clientY;
        if (innerAllowed) deltaY = pauseAtBottom(gesture.path, deltaY);
        if (!deltaY) {
            gesture.samples = [{time: event.timeStamp, y: touch.clientY}];
            return;
        }
        handOff();
        gesture.page = true;
        gesture.manual = true;
        gesture.samples.push({time: event.timeStamp, y: touch.clientY});
        while (gesture.samples.length > 2 && event.timeStamp - gesture.samples[1].time > 100) gesture.samples.shift();
        tell({type: 'wici-infer:touch', phase: 'move', deltaY: deltaY});
    }, {passive: false});
    function endTouch(event) {
        if (!gesture) return;
        if (gesture.page) {
            // Pixels per millisecond over the last 100 ms of the swipe; a finger
            // that rested before lifting does not glide.
            var first = gesture.samples[0];
            var last = gesture.samples[gesture.samples.length - 1];
            var velocity = event.timeStamp - last.time > 80 || last.time === first.time ? 0 : (first.y - last.y) / (last.time - first.time);
            tell({type: 'wici-infer:touch', phase: 'end', velocity: velocity});
        }
        gesture = null;
    }
    window.addEventListener('touchend', endTouch, {passive: true});
    window.addEventListener('touchcancel', endTouch, {passive: true});
}());
