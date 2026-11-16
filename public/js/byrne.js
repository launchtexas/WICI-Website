/* =========================================
   WiCi — Byrne-style generative card art
   Port of kgolid/byrne-generator (ISC, Kjetil Golid)
   https://github.com/kgolid/byrne-generator
   - No p5, no animation: runs the full construction
     and paints only the final state onto a canvas.
   - Deterministic: the seed string (article title)
     is hashed into a PRNG, so every visit renders
     the same composition for the same title.
   Exposes: window.WiCiByrne.paint(canvas, seedString)
   ========================================= */

(function () {
    'use strict';

    /* Byrne's Elements palette, as in the original generator. */
    const PALETTE = {
        colors: ['#c54514', '#dca215', '#23507f']
    };

    /* Card backgrounds — muted tones the multiply-blended strokes sit
       well on; one is picked per seed so the grid gets variety. */
    const BACKGROUNDS = [
        '#e8e7d4', /* the original cream */
        '#dfe5db', /* sage */
        '#dde3ea', /* mist blue */
        '#eadfd6', /* blush sand */
        '#e3dce8'  /* lavender grey */
    ];

    /* Tuning constants from the original sketch. */
    const FILL_CHANCE = 0.45;
    const MIN_DIM = 30;
    const INITIAL_DIM = 150;
    const ANGLE_SIZE = 50;
    const NUMBER_OF_STEPS = 15;
    const STROKE_WEIGHT = 3;

    /* Logical drawing space (the original is an 800x800 canvas with
       the construction re-centered every step). */
    const LOGICAL = 800;
    /* Height of the logical window mapped onto the card; < LOGICAL so
       the composition fills the card instead of floating. */
    const VIEW_HEIGHT = 520;

    /* ---- Seeded randomness ---- */

    /* cyrb53 string hash — stable across sessions and browsers. */
    function hashString(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
    }

    /* mulberry32 PRNG — every Math.random() of the original goes
       through this so the result is a pure function of the seed. */
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ---- Small trig helpers (trig.js in the original) ---- */

    function dist(p1, p2) {
        return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    }

    function angleOfDirection(p1, p2) {
        return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    }

    function pointAtDistanceAndAngle(p1, d, rad) {
        return [p1[0] + d * Math.cos(rad), p1[1] + d * Math.sin(rad)];
    }

    function differenceBetweenAngles(a1, a2) {
        let difference = a2 - a1;
        while (difference < -Math.PI) difference += 2 * Math.PI;
        while (difference > Math.PI) difference -= 2 * Math.PI;
        return difference;
    }

    /* ---- Generation (index.js in the original) ----
       Shapes are plain objects tagged by `kind`; points are shared,
       mutable {x, y} objects so the per-step re-centering moves every
       shape that references them, exactly like the p5 version. */

    function generate(rng) {
        const pick = (arr) => arr[Math.floor(rng() * arr.length)];
        const pickN = (n, arr) => {
            if (n > arr.length) return [];
            const copy = arr.slice();
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
            }
            return copy.slice(0, n);
        };

        const shapes = [];
        const points = [];

        const addPoint = (x, y) => {
            const pnt = { x, y };
            points.push(pnt);
            return pnt;
        };

        const connectPointsWithLine = (p1, p2, eActive, wActive) => {
            const line = {
                kind: 'line', p1, p2,
                col: pick(PALETTE.colors),
                eActive, wActive
            };
            shapes.push(line);
            return line;
        };

        const areConnected = (p1, p2) => {
            if (p1 === p2) return true;
            return shapes.some((s) => s.kind === 'line' &&
                ((s.p1 === p1 && s.p2 === p2) || (s.p2 === p1 && s.p1 === p2)));
        };

        const connectWithLineRandomly = () => {
            const p1 = pick(points);
            const independent = points.filter((pnt) => !areConnected(p1, pnt));
            if (!independent.length) return;
            connectPointsWithLine(p1, pick(independent), false, false);
        };

        const connectPointsWithCircleRandomly = () => {
            const col = pick(PALETTE.colors);
            const pair = pickN(2, points);
            const cp = pair[0], rp = pair[1];
            const radius = dist([cp.x, cp.y], [rp.x, rp.y]);
            shapes.push({ kind: 'circle', c: cp, r: radius, col });
        };

        const connectLinesWithAngle = () => {
            const busyPoints = points
                .map((pnt) => [
                    pnt,
                    shapes.filter((s) => s.kind === 'line' && (s.p1 === pnt || s.p2 === pnt))
                ])
                .filter((bp) => bp[1].length > 1)
                .filter((bp) => !shapes.some((s) => s.kind === 'angle' && s.c === bp[0]));
            if (!busyPoints.length) return;

            const bp = pick(busyPoints);
            const pnt = bp[0];
            const pair = pickN(2, bp[1]);
            const l1 = pair[0], l2 = pair[1];
            const o1 = l1.p1 === pnt ? l1.p2 : l1.p1;
            const o2 = l2.p1 === pnt ? l2.p2 : l2.p1;
            const angle1 = angleOfDirection([pnt.x, pnt.y], [o1.x, o1.y]);
            const angle2 = angleOfDirection([pnt.x, pnt.y], [o2.x, o2.y]);

            const col = pick(PALETTE.colors);
            if (differenceBetweenAngles(angle1, angle2) < differenceBetweenAngles(angle2, angle1)) {
                shapes.push({ kind: 'angle', c: pnt, size: ANGLE_SIZE, a1: angle2, a2: angle1, col });
            } else {
                shapes.push({ kind: 'angle', c: pnt, size: ANGLE_SIZE, a1: angle1, a2: angle2, col });
            }
        };

        /* Shared tail of the rectangle/triangle extensions. */
        const pickActiveLine = () => {
            const eligible = shapes.filter((s) => s.kind === 'line' && (s.eActive || s.wActive));
            return eligible.length ? pick(eligible) : null;
        };

        const extendWithRectangle = () => {
            const l1 = pickActiveLine();
            if (!l1) return;
            const p1 = [l1.p1.x, l1.p1.y];
            const p2 = [l1.p2.x, l1.p2.y];
            const angle = angleOfDirection(p1, p2);
            const rotateWest = !l1.eActive || (l1.wActive && rng() < 0.5);
            const rotDir = rotateWest ? Math.PI / 2 : (3 * Math.PI) / 2;
            const rotDist = Math.max(MIN_DIM, dist(p1, p2) * (rng() + 0.15));

            const p3 = pointAtDistanceAndAngle(p2, rotDist, angle + rotDir);
            const p4 = pointAtDistanceAndAngle(p1, rotDist, angle + rotDir);
            const p3Obj = addPoint(p3[0], p3[1]);
            const p4Obj = addPoint(p4[0], p4[1]);
            const col = pick(PALETTE.colors);
            if (rng() < FILL_CHANCE) {
                shapes.push({ kind: 'rect', c1: l1.p1, c2: l1.p2, c3: p3Obj, c4: p4Obj, col });
            }
            connectPointsWithLine(l1.p2, p3Obj, rotateWest, !rotateWest);
            connectPointsWithLine(p3Obj, p4Obj, rotateWest, !rotateWest);
            connectPointsWithLine(p4Obj, l1.p1, rotateWest, !rotateWest);
            l1.eActive = l1.eActive && rotateWest;
            l1.wActive = l1.wActive && !rotateWest;
        };

        const extendWithTriangle = () => {
            const l1 = pickActiveLine();
            if (!l1) return;
            const p1 = [l1.p1.x, l1.p1.y];
            const p2 = [l1.p2.x, l1.p2.y];
            const angle = angleOfDirection(p1, p2);
            const rotateWest = !l1.eActive || (l1.wActive && rng() < 0.5);
            const rotDir = rotateWest ? Math.PI / 2 : (3 * Math.PI) / 2;
            const rotDist = Math.max(MIN_DIM, dist(p1, p2) * (rng() + 0.15));

            const p3 = pointAtDistanceAndAngle(rng() < 0.5 ? p1 : p2, rotDist, angle + rotDir);
            const p3Obj = addPoint(p3[0], p3[1]);

            const col = pick(PALETTE.colors);
            if (rng() < FILL_CHANCE) {
                shapes.push({ kind: 'tri', c1: l1.p1, c2: l1.p2, c3: p3Obj, col });
            }
            connectPointsWithLine(l1.p2, p3Obj, rotateWest, !rotateWest);
            connectPointsWithLine(p3Obj, l1.p1, rotateWest, !rotateWest);
            l1.eActive = l1.eActive && rotateWest;
            l1.wActive = l1.wActive && !rotateWest;
        };

        const extendCollection = () => {
            const choice = rng();
            if (choice < 0.25) extendWithRectangle();
            else if (choice < 0.5) extendWithTriangle();
            else if (choice < 0.6) connectPointsWithCircleRandomly();
            else if (choice < 0.85) connectLinesWithAngle();
            else connectWithLineRandomly();
        };

        const centerPoints = () => {
            let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
            points.forEach((pnt) => {
                if (pnt.x < xMin) xMin = pnt.x;
                if (pnt.x > xMax) xMax = pnt.x;
                if (pnt.y < yMin) yMin = pnt.y;
                if (pnt.y > yMax) yMax = pnt.y;
            });
            const dx = (xMin + xMax) / 2 - LOGICAL / 2;
            const dy = (yMin + yMax) / 2 - LOGICAL / 2;
            points.forEach((pnt) => {
                pnt.x -= dx;
                pnt.y -= dy;
            });
        };

        /* init_state: two points INITIAL_DIM apart, joined by a line
           whose both sides are still "active" (extendable). */
        const p1pos = [rng() * LOGICAL, rng() * LOGICAL];
        const p2pos = pointAtDistanceAndAngle(p1pos, INITIAL_DIM, rng() * Math.PI);
        addPoint(p1pos[0], p1pos[1]);
        addPoint(p2pos[0], p2pos[1]);
        connectPointsWithLine(points[0], points[1], true, true);

        /* The original extends + re-centers once per animation frame;
           run the same loop to completion without drawing. */
        for (let step = 0; step < NUMBER_OF_STEPS; step++) {
            extendCollection();
            centerPoints();
        }

        /* Fills under angle wedges under lines/circles. */
        const order = (s) => (s.kind === 'rect' || s.kind === 'tri') ? 0 : (s.kind === 'angle' ? 1 : 2);
        shapes.sort((a, b) => order(a) - order(b));
        return shapes;
    }

    /* ---- Painting ---- */

    function drawShape(ctx, s) {
        switch (s.kind) {
            case 'rect':
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = s.col;
                ctx.beginPath();
                ctx.moveTo(s.c1.x, s.c1.y);
                ctx.lineTo(s.c2.x, s.c2.y);
                ctx.lineTo(s.c3.x, s.c3.y);
                ctx.lineTo(s.c4.x, s.c4.y);
                ctx.closePath();
                ctx.fill();
                break;
            case 'tri':
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = s.col;
                ctx.beginPath();
                ctx.moveTo(s.c1.x, s.c1.y);
                ctx.lineTo(s.c2.x, s.c2.y);
                ctx.lineTo(s.c3.x, s.c3.y);
                ctx.closePath();
                ctx.fill();
                break;
            case 'angle':
                /* Pie wedge marking the angle at a construction vertex. */
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = s.col;
                ctx.beginPath();
                ctx.moveTo(s.c.x, s.c.y);
                ctx.arc(s.c.x, s.c.y, s.size / 2, s.a1, s.a2);
                ctx.closePath();
                ctx.fill();
                break;
            case 'circle':
                ctx.globalCompositeOperation = 'multiply';
                ctx.strokeStyle = s.col;
                ctx.beginPath();
                ctx.arc(s.c.x, s.c.y, s.r, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case 'line':
                ctx.globalCompositeOperation = 'multiply';
                ctx.strokeStyle = s.col;
                ctx.beginPath();
                ctx.moveTo(s.p1.x, s.p1.y);
                ctx.lineTo(s.p2.x, s.p2.y);
                ctx.stroke();
                break;
        }
    }

    /* Card hovers CSS-scale the canvas up to 1.15x (see .rs-card-figure /
       .latest-item-figure); oversample the backing store by the same factor
       so the transform never has to upscale the bitmap. */
    const OVERSAMPLE = 1.15;

    /* Paint the composition for `seedString` onto `canvas`, sized to
       the canvas's current layout box (device-pixel sharp). */
    function paint(canvas, seedString) {
        const dpr = (window.devicePixelRatio || 1) * OVERSAMPLE;
        const cssW = canvas.clientWidth || canvas.offsetWidth || 400;
        const cssH = canvas.clientHeight || canvas.offsetHeight || 250;
        const w = Math.max(1, Math.round(cssW * dpr));
        const h = Math.max(1, Math.round(cssH * dpr));
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        const rng = mulberry32(hashString(String(seedString)));

        /* Background is drawn from the same seeded stream (before the
           construction consumes it) so it's stable per title too. */
        ctx.fillStyle = BACKGROUNDS[Math.floor(rng() * BACKGROUNDS.length)];
        ctx.fillRect(0, 0, w, h);

        const shapes = generate(rng);

        /* Map the logical window onto the card: fill its height and
           keep the construction centered. */
        const scale = h / VIEW_HEIGHT;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-LOGICAL / 2, -LOGICAL / 2);
        ctx.lineWidth = STROKE_WEIGHT;
        ctx.lineCap = 'round';
        shapes.forEach((s) => drawShape(ctx, s));
        ctx.restore();
    }

    window.WiCiByrne = { paint };
})();
