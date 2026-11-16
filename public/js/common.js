/* =========================================
   WiCi — Common interactivity
   Shared by every page: home, product, careers.
   - Acquisition context capture (UTM + referrer)
   - Discount code and order attribution cookies (read by js/buy.js)
   - Offer lines that follow the visitor's code (campaign arrivals get one)
   - Sticky nav scrolled state
   - Mobile menu toggle
   - Reveal-on-scroll
   - "Stay tuned" tooltip
   - Compatible-apps wall category highlight (home + product)
   - Inline films: the play pill over a film's poster and the site's own
     controls under it (every page with a film)
   - Footer year
   - Arrivals start at the top (an unasked scroll on load is undone)
   ========================================= */

(function () {
    'use strict';

    /* ---- Acquisition context ----
       Campaign params only exist on the URL the visitor actually landed
       on. Internal links are clean (no query string), so by the time
       someone reaches a form the params are long gone and the signup
       records an empty utm_source. Stash them on arrival instead.

       This lives in common.js rather than signup.js because signup.js
       loads only on the five pages that carry a form — a campaign
       landing on an article or the research index would otherwise be
       lost before the visitor ever reaches one.

       sessionStorage, not localStorage: attribution should describe THIS
       visit. Persisting across visits would credit a campaign from weeks
       ago for a later direct arrival, which quietly poisons the
       dashboard's daily utm_source breakdown.

       Read back by `collect()` in js/signup.js — keep UTM_STORE_KEY and
       the stored shape in step with it. */
    const UTM_STORE_KEY = 'wici:acq';
    const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

    function captureAcquisition() {
        let params;
        try {
            params = new URLSearchParams(window.location.search);
        } catch (error) {
            return;
        }

        const acq = {};
        let hasCampaign = false;
        UTM_FIELDS.forEach((field) => {
            const value = params.get(field) || '';
            acq[field] = value;
            if (value) hasCampaign = true;
        });

        // Only a URL that actually carries campaign params may write — a
        // later internal page must not clear what the landing page saved.
        // A fresh campaign URL mid-visit does overwrite, so the most
        // recent touch wins.
        if (!hasCampaign) return;

        try {
            const referrer = document.referrer ? new URL(document.referrer) : null;
            acq.referrer_host = referrer && referrer.hostname !== window.location.hostname
                ? referrer.hostname
                : '';
        } catch (error) {
            acq.referrer_host = '';
        }

        try {
            window.sessionStorage.setItem(UTM_STORE_KEY, JSON.stringify(acq));
        } catch (error) {
            /* Private mode or storage disabled — fall back to URL-only. */
        }
    }

    /* ---- Discount code ----
       An email's links can carry ?discount=<code> (the early-signup code).
       Keep it in a first-party cookie, so the buy page can hand it to
       checkout whichever page the visitor landed on, in another tab, or
       on a later visit: a reader who opens the email today and comes back
       to buy next week still has it. (A cookie rather than sessionStorage,
       unlike the campaign params above, which should describe one visit.)
       Three days from the visit that brought it, this host only, a newer code replaces
       an older one. A code kept under the old thirty days is cut to three
       days from the first visit after the change: DISCOUNT_MARK, set with
       every write, tells the two apart. Only a well-formed code is kept,
       and it is never written into the page as HTML. Read back by
       `currentOffer` below. */
    const DISCOUNT_COOKIE = 'wici_discount';
    const DISCOUNT_MARK = 'wici_discount_3d';
    const DISCOUNT_MAX_AGE = 3 * 24 * 60 * 60;
    const DISCOUNT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;
    // The code a campaign arrival is given (its line is in OFFERS below).
    const CAMPAIGN_CODE = 'WICIWELCOME';

    function writeDiscountCookies(code, maxAge) {
        const tail = '; Max-Age=' + maxAge + '; Path=/; SameSite=Lax'
            + (window.location.protocol === 'https:' ? '; Secure' : '');
        document.cookie = DISCOUNT_COOKIE + '=' + code + tail;
        document.cookie = DISCOUNT_MARK + '=' + (maxAge ? '1' : '') + tail;
    }

    function captureDiscount() {
        let params;
        try {
            params = new URLSearchParams(window.location.search);
        } catch (error) {
            return;
        }

        // `?cleardiscount` forgets a kept code: a
        // way to see the pages as a visitor without one. The parameter is
        // taken off the address afterwards, so the cleared page is not
        // shared or bookmarked with it.
        if (params.has('cleardiscount')) {
            try {
                writeDiscountCookies('', 0);
                params.delete('cleardiscount');
                const query = params.toString();
                window.history.replaceState(window.history.state, '',
                    window.location.pathname + (query ? '?' + query : '') + window.location.hash);
            } catch (error) { /* nothing kept, or nothing to clear */ }
            return;
        }

        const code = params.get('discount') || '';
        try {
            if (DISCOUNT_PATTERN.test(code)) {
                writeDiscountCookies(code, DISCOUNT_MAX_AGE);
                return;
            }
            const pairs = document.cookie.split('; ');
            const kept = pairs.find((pair) => pair.indexOf(DISCOUNT_COOKIE + '=') === 0);
            const marked = pairs.some((pair) => pair.indexOf(DISCOUNT_MARK + '=') === 0);
            const keptCode = kept ? kept.slice(DISCOUNT_COOKIE.length + 1) : '';
            // A campaign arrival (any utm_* on the URL) without a code of
            // its own is given the campaign code, kept like any other so it follows the visitor to
            // checkout. A code already kept stays: it is never traded
            // for the generic one.
            if (!keptCode && UTM_FIELDS.some((field) => params.get(field))) {
                writeDiscountCookies(CAMPAIGN_CODE, DISCOUNT_MAX_AGE);
                return;
            }
            // No code on this URL: a code kept under the old thirty days
            // (no mark beside it) gets three days from now, once.
            if (keptCode && !marked && DISCOUNT_PATTERN.test(keptCode)) {
                writeDiscountCookies(keptCode, DISCOUNT_MAX_AGE);
            }
        } catch (error) {
            /* Cookies blocked — the buy page still reads the code off its
               own URL. */
        }
    }

    /* ---- Order attribution ----
       Where a buyer came from, for the order record: the buy page hands it
       to checkout as cart attributes, which Shopify keeps on the order.
       Checkout is on the store's domain, so the link is the only thing of
       ours that reaches it.

       A cookie, unlike the per-visit campaign params above: a purchase of
       this size rarely happens on the visit that started it, and the order
       should still name the campaign. Thirty days from the last change,
       this host only. It holds a short list of records, `;` between them,
       each in query-string form:

         - first, the arrival that started it:
           referrer=<host>&landing=<path>&date=<YYYY-MM-DD>
         - then one record per campaign, oldest first:
           utm_source=…&utm_medium=…&utm_campaign=…&utm_term=…&utm_content=…&date=…

       Campaigns stack: someone who comes in from an ad, signs up,
       and returns from our email keeps the ad as the first campaign and
       gains the email as the second. A campaign equal to the last one kept
       is not added again; past ATTRIBUTION_TOUCH_MAX the first stays and
       the oldest after it goes. An arrival with only an outside referrer
       starts the list when there is none; a direct visit changes nothing.
       Values are cut to a plain character set, so the list needs no
       escaping and stays readable in the store's admin. Read back by
       js/buy.js: keep ATTRIBUTION_COOKIE, the character set, the record
       layout, and ATTRIBUTION_TOUCH_MAX in step with it. */
    const ATTRIBUTION_COOKIE = 'wici_attribution';
    const ATTRIBUTION_MAX_AGE = 30 * 24 * 60 * 60;
    const ATTRIBUTION_VALUE_MAX = 80;
    const ATTRIBUTION_TOUCH_MAX = 4;
    const ATTRIBUTION_PATTERN = /^[A-Za-z0-9 ._~+\-\/:@,|()=&;]{1,2600}$/;
    // Our own hosts and the checkout's are not a source.
    const ATTRIBUTION_OWN_HOSTS = /(^|\.)(wici\.ai|shop\.app|myshopify\.com)$/;

    function captureAttribution() {
        const clean = (value) => String(value || '')
            .replace(/[^A-Za-z0-9 ._~+\-\/:@,|()]/g, '_')
            .trim()
            .slice(0, ATTRIBUTION_VALUE_MAX);
        const isUtm = (pair) => pair.indexOf('utm_') === 0;

        let params;
        try {
            params = new URLSearchParams(window.location.search);
        } catch (error) {
            return;
        }

        const campaign = [];
        UTM_FIELDS.forEach((field) => {
            const value = clean(params.get(field));
            if (value) campaign.push(field + '=' + value);
        });

        let referrer = '';
        try {
            const host = document.referrer ? new URL(document.referrer).hostname : '';
            if (host && host !== window.location.hostname && !ATTRIBUTION_OWN_HOSTS.test(host)) {
                referrer = clean(host);
            }
        } catch (error) {
            referrer = '';
        }

        try {
            let records = [];
            const kept = document.cookie.split('; ').find((pair) => pair.indexOf(ATTRIBUTION_COOKIE + '=') === 0);
            if (kept) {
                const list = decodeURIComponent(kept.slice(ATTRIBUTION_COOKIE.length + 1));
                if (ATTRIBUTION_PATTERN.test(list)) records = list.split(';').filter(Boolean);
            }

            if (!campaign.length && (records.length || !referrer)) return;

            // Sort what is kept into the first arrival and the campaigns.
            // (The cookie's first layout was a single record holding both;
            // it reads the same way.)
            let visit = '';
            const touches = [];
            records.forEach((record) => {
                const pairs = record.split('&');
                const rest = pairs.filter((pair) => !isUtm(pair));
                if (pairs.some(isUtm)) {
                    touches.push(pairs.filter(isUtm)
                        .concat(rest.filter((pair) => pair.indexOf('date=') === 0))
                        .join('&'));
                }
                if (!visit && rest.some((pair) => pair.indexOf('landing=') === 0)) visit = rest.join('&');
            });

            const today = new Date().toISOString().slice(0, 10);
            if (!visit) {
                visit = (referrer ? 'referrer=' + referrer + '&' : '')
                    + 'landing=' + clean(window.location.pathname) + '&date=' + today;
            }
            if (campaign.length) {
                const last = touches.length
                    ? touches[touches.length - 1].split('&').filter(isUtm).join('&')
                    : '';
                if (campaign.join('&') !== last) touches.push(campaign.concat('date=' + today).join('&'));
                while (touches.length > ATTRIBUTION_TOUCH_MAX) touches.splice(1, 1);
            }

            document.cookie = ATTRIBUTION_COOKIE + '=' + encodeURIComponent([visit].concat(touches).join(';'))
                + '; Max-Age=' + ATTRIBUTION_MAX_AGE + '; Path=/; SameSite=Lax'
                + (window.location.protocol === 'https:' ? '; Secure' : '');
        } catch (error) {
            /* Cookies blocked — the order simply carries no attribution. */
        }
    }

    /* ---- Offers: the line follows the code ----
       Every code the store honours that the site knows of, with what it
       takes off and the words that lead its line. A visitor's own code (on
       this URL, else kept in the cookie above) decides which one they
       see; a visitor without one sees no line. A campaign arrival (utm_*
       on the URL) is given CAMPAIGN_CODE by `captureDiscount` above. Every element marked `data-offer-line`
       (hidden in the markup) is filled in and shown: its
       `[data-offer-lead]`, `[data-offer-amount]` and `[data-offer-code]`.
       A price marked `data-offer-price` with the full price as
       `data-full` (a plain number) is rewritten less the amount, and
       every `[data-offer-was]` (the full price struck through, hidden in
       the markup) is shown beside it: the product page's bar and the buy
       page's hero. `window.WiCiDiscount.off()` gives the amount as a number
       for js/buy.js, which does the same to the prices it renders.
       A code not in this table is still applied at checkout by
       js/buy.js; the pages just make no promise for it. The codes must
       exist in the store with the same amounts; the page only says what
       the store will take. Keep this in step with Shopify's Discounts and
       the codes in the emails (wici-email). */
    const OFFERS = {
        'WICIWELCOME': { amount: '$800', lead: 'Exclusive offer' },
        'PIONEER600-GUH7': { amount: '$1,000', lead: 'Pioneers only' },
        'UNTETHERED': { amount: '$800', lead: 'Special offer' },
        'INFERSIGNUP': { amount: '$1,000', lead: 'WiCi Infer signup discount' },
    };

    function ownDiscount() {
        try {
            const fromUrl = new URLSearchParams(window.location.search).get('discount') || '';
            if (DISCOUNT_PATTERN.test(fromUrl)) return fromUrl;
            const kept = document.cookie.split('; ').find((pair) => pair.indexOf(DISCOUNT_COOKIE + '=') === 0);
            const code = kept ? kept.slice(DISCOUNT_COOKIE.length + 1) : '';
            return DISCOUNT_PATTERN.test(code) ? code : '';
        } catch (error) {
            return '';
        }
    }

    // { code, own, amount?, lead? }, or null when there is no code at all.
    function currentOffer() {
        const own = ownDiscount();
        if (own) {
            const known = OFFERS[own.toUpperCase()];
            return Object.assign({ code: known ? own.toUpperCase() : own, own: true }, known || {});
        }
        return null;
    }

    // The visitor's offer as a number of dollars off, 0 without one.
    function currentOff() {
        const offer = currentOffer();
        return offer && offer.amount ? Number(String(offer.amount).replace(/[^0-9.]/g, '')) || 0 : 0;
    }

    window.WiCiDiscount = { offer: currentOffer, off: currentOff };

    function initOfferLines() {
        const offer = currentOffer();
        if (!offer || !offer.amount) return;
        const fill = (selector, text) => document.querySelectorAll(selector).forEach((el) => { el.textContent = text; });
        fill('[data-offer-lead]', offer.lead);
        fill('[data-offer-amount]', offer.amount);
        fill('[data-offer-code]', offer.code);
        document.querySelectorAll('[data-offer-line]').forEach((el) => { el.hidden = false; });
        const off = currentOff();
        if (!off) return;
        document.querySelectorAll('[data-offer-price]').forEach((el) => {
            const full = Number(el.dataset.full);
            if (full > off) el.textContent = '$' + (full - off).toLocaleString('en-US');
        });
        document.querySelectorAll('[data-offer-was]').forEach((el) => { el.hidden = false; });
    }

    /* ---- Download source ----
       The app's download links go through app-versioning
       (appapi.wici.ai/versioning/<app>/redirect/<key>), which counts each
       click by its `?src=`, else by its referrer. Every click from this
       site would otherwise read "wici.ai", so the links are given where
       the visitor came from:

         1. this visit's arrival, kept in sessionStorage: the campaign as
            `<utm_source>-<utm_medium>` (google-cpc), a Google or Meta ad
            click id without UTM (google-cpc, meta-paid), else the outside
            site that linked here (bare host, e.g. discord.com);
         2. failing that, an earlier visit from the attribution cookie above
            (its latest campaign, else the site of the first arrival);
         3. else `direct`: wici.ai typed in or bookmarked.

       Cut to app-versioning's SOURCE_RE (lower case, [a-z0-9._-], at most
       32 characters, starting with a letter or digit). */
    const SOURCE_STORE_KEY = 'wici:src';
    const DOWNLOAD_LINK = /^https:\/\/appapi\.wici\.ai\/versioning\/[^/]+\/redirect\//;

    function sourceName(value) {
        return String(value || '').toLowerCase()
            .replace(/^www\./, '')
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^[^a-z0-9]+/, '')
            .slice(0, 32)
            .replace(/[-.]+$/, '');
    }

    function campaignSource(source, medium) {
        source = sourceName(source);
        medium = sourceName(medium);
        return sourceName(source && medium ? source + '-' + medium : source);
    }

    function captureDownloadSource() {
        let found = '';
        try {
            const params = new URLSearchParams(window.location.search);
            found = campaignSource(params.get('utm_source'), params.get('utm_medium'))
                || (params.get('gclid') || params.get('gbraid') || params.get('wbraid') ? 'google-cpc' : '')
                || (params.get('fbclid') ? 'meta-paid' : '');
            if (!found && document.referrer) {
                const host = new URL(document.referrer).hostname;
                if (host !== window.location.hostname && !ATTRIBUTION_OWN_HOSTS.test(host)) found = sourceName(host);
            }
            // Like the campaign params: only an arrival that names a source
            // writes, so a later internal page keeps what the landing saved.
            if (found) window.sessionStorage.setItem(SOURCE_STORE_KEY, found);
        } catch (error) {
            /* Storage blocked — this page's own arrival still counts below. */
        }
        return found;
    }

    function keptDownloadSource() {
        try {
            const kept = document.cookie.split('; ').find((pair) => pair.indexOf(ATTRIBUTION_COOKIE + '=') === 0);
            if (!kept) return '';
            const records = decodeURIComponent(kept.slice(ATTRIBUTION_COOKIE.length + 1)).split(';').filter(Boolean);
            const field = (record, name) => {
                const pair = record.split('&').find((item) => item.indexOf(name + '=') === 0);
                return pair ? pair.slice(name.length + 1) : '';
            };
            for (let i = records.length - 1; i >= 0; i -= 1) {
                const campaign = campaignSource(field(records[i], 'utm_source'), field(records[i], 'utm_medium'));
                if (campaign) return campaign;
            }
            return records.length ? sourceName(field(records[0], 'referrer')) : '';
        } catch (error) {
            return '';
        }
    }

    function tagDownloadLinks(arrival) {
        let source = arrival;
        try {
            source = source || window.sessionStorage.getItem(SOURCE_STORE_KEY) || '';
        } catch (error) { /* storage blocked */ }
        source = sourceName(source) || keptDownloadSource() || 'direct';
        document.querySelectorAll('a[href]').forEach((link) => {
            if (!DOWNLOAD_LINK.test(link.href)) return;
            try {
                const url = new URL(link.href);
                url.searchParams.set('src', source);
                link.href = url.toString();
            } catch (error) { /* leave the link as it is */ }
        });
    }

    // Runs immediately rather than on DOMContentLoaded: the sooner this
    // is banked, the less can go wrong before it.
    captureAcquisition();
    captureDiscount();
    captureAttribution();
    const downloadArrival = captureDownloadSource();

    document.addEventListener('DOMContentLoaded', () => {
        initSmoothScroll();
        initNavScroll();
        initNavDrop();
        initMobileMenu();
        initHashLinks();
        initReveal();
        initStayTuned();
        initAppsWall();
        initFilms();
        initOfferLines();
        initYear();
        tagDownloadLinks(downloadArrival);
    });

    /* ---- Inline films ----
       `<figure data-film>`: a film waiting behind its poster (styles:
       common.css, "Inline film"). The markup is a plain
       `<video controls preload="none">`, so nothing loads until it is
       asked for and the film plays, under the browser's controls, without
       this script. Here the native controls step back for a play pill
       over the poster; the first click, on the pill or the picture,
       starts the film with sound under the site's own controls, built by buildFilmControls in the manner of the product
       page's demo stage (.rooms-ctl): a bar over the foot of the picture
       with a play/pause and a mute square at the left, the progress line
       between (a click or a drag seeks, the arrow keys step 5 s), the
       time, and a full-screen square at the right. The bar hides 2.4 s
       into playback and comes back on a pointer move, a pause, the end or
       keyboard focus; a click on the picture pauses and resumes (on a
       phone a tap first brings the bar back); space / k, m and f do the
       same from the keyboard. Full screen is the figure's, so the bar
       stays; the iPhone, which has no element full screen, opens the
       video's own player. The solutions pages' teaser (js/solutions.js)
       takes the same controls through window.WiCiFilm when its full film
       comes in. */
    function initFilms() {
        document.querySelectorAll('[data-film]').forEach((figure) => {
            const video = figure.querySelector('video');
            const pill = figure.querySelector('.film-play');
            if (!video || !pill) return;

            video.controls = false;
            pill.hidden = false;
            buildFilmControls(figure, video);

            const start = () => {
                if (pill.hidden) return;
                pill.hidden = true;
                video.play().catch(() => {});
                // The pill that had focus is gone: hand it to the player.
                figure.querySelector('.film-btn--play').focus({ preventScroll: true });
            };
            pill.addEventListener('click', start);
            video.addEventListener('click', start);
            // Started some other way (a media key, the system's own UI).
            video.addEventListener('play', () => { pill.hidden = true; });
        });
    }

    function buildFilmControls(figure, video) {
        if (figure.querySelector('.film-ui')) return;
        video.controls = false;
        const svg = (inner, cls) => '<svg class="' + cls + '" viewBox="0 0 16 16" fill="none" aria-hidden="true">' + inner + '</svg>';
        const ui = document.createElement('div');
        ui.className = 'film-ui';
        ui.innerHTML =
            '<div class="film-bar">' +
                '<button type="button" class="film-btn film-btn--play" aria-label="Pause">' +
                    svg('<path d="M4 2.5v11l9-5.5z" fill="currentColor"/>', 'film-i-play') +
                    svg('<path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/>', 'film-i-pause') +
                '</button>' +
                '<button type="button" class="film-btn film-btn--mute" aria-label="Mute">' +
                    svg('<path d="M2.5 6h2.3L8 3.3v9.4L4.8 10H2.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10.3 5.8a3 3 0 0 1 0 4.4M12.1 4a5.5 5.5 0 0 1 0 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>', 'film-i-sound') +
                    svg('<path d="M2.5 6h2.3L8 3.3v9.4L4.8 10H2.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10.5 6l3.5 3.5M14 6l-3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>', 'film-i-muted') +
                '</button>' +
                '<div class="film-track" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><span class="film-track-fill"></span><span class="film-track-knob"></span></div>' +
                '<span class="film-time" aria-hidden="true">0:00 / 0:00</span>' +
                '<button type="button" class="film-btn film-btn--full" aria-label="Full screen">' +
                    svg('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', 'film-i-full') +
                    svg('<path d="M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', 'film-i-unfull') +
                '</button>' +
            '</div>';
        figure.appendChild(ui);
        figure.classList.add('film--own', 'is-paused');

        const playBtn = ui.querySelector('.film-btn--play');
        const muteBtn = ui.querySelector('.film-btn--mute');
        const fullBtn = ui.querySelector('.film-btn--full');
        const track = ui.querySelector('.film-track');
        const time = ui.querySelector('.film-time');
        const fmt = (s) => {
            s = Math.max(0, Math.floor(isFinite(s) ? s : 0));
            const r = s % 60;
            return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r;
        };
        const clamp = (t) => Math.min(video.duration || 0, Math.max(0, t));
        const render = () => {
            const d = isFinite(video.duration) ? video.duration : 0;
            const t = video.currentTime || 0;
            ui.style.setProperty('--p', (d ? t / d : 0).toFixed(4));
            time.textContent = fmt(t) + ' / ' + fmt(d);
            track.setAttribute('aria-valuemax', String(Math.round(d)));
            track.setAttribute('aria-valuenow', String(Math.round(t)));
            track.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(d));
        };
        const syncState = () => {
            figure.classList.toggle('is-paused', video.paused);
            figure.classList.toggle('is-muted', video.muted);
            playBtn.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
            muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
        };

        // The progress: one frame loop while the film plays.
        let ticking = false;
        const tick = () => {
            render();
            if (!video.paused && !video.ended) requestAnimationFrame(tick); else ticking = false;
        };
        const wake = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };

        // The bar's rest: gone 2.4 s into playback unless the pointer
        // moves, something in it has keyboard focus, or a drag is on.
        let idleTimer = 0;
        let seeking = false;
        const rest = () => {
            if (video.paused || video.ended || seeking || figure.querySelector(':focus-visible')) return;
            figure.classList.add('is-idle');
        };
        const show = () => {
            figure.classList.remove('is-idle');
            clearTimeout(idleTimer);
            idleTimer = setTimeout(rest, 2400);
        };
        const started = () => figure.classList.contains('is-started');
        const toggle = () => {
            if (video.paused) video.play().catch(() => {}); else video.pause();
        };

        // The picture: a click pauses and resumes once the film has
        // started (before that initFilms' own listener starts it). A tap
        // while the bar rests only brings the bar back.
        let swallow = false;
        video.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch' && started() && figure.classList.contains('is-idle')) swallow = true;
        });
        video.addEventListener('click', () => {
            if (!started()) return;
            if (swallow) { swallow = false; show(); return; }
            toggle();
            show();
        });
        figure.addEventListener('pointermove', show);
        figure.addEventListener('pointerleave', () => { clearTimeout(idleTimer); idleTimer = setTimeout(rest, 600); });
        figure.addEventListener('focusin', show);

        playBtn.addEventListener('click', toggle);
        muteBtn.addEventListener('click', () => { video.muted = !video.muted; });

        // The progress line: a press seeks to the point, a drag follows.
        const seekTo = (x) => {
            const r = track.getBoundingClientRect();
            const d = video.duration;
            if (!d || !r.width) return;
            video.currentTime = Math.min(1, Math.max(0, (x - r.left) / r.width)) * d;
            render();
        };
        track.addEventListener('pointerdown', (e) => {
            if (e.button) return;
            seeking = true;
            figure.classList.add('is-seeking');
            track.setPointerCapture(e.pointerId);
            seekTo(e.clientX);
            e.preventDefault();
        });
        track.addEventListener('pointermove', (e) => { if (seeking) seekTo(e.clientX); });
        const endSeek = () => {
            if (!seeking) return;
            seeking = false;
            figure.classList.remove('is-seeking');
            show();
        };
        track.addEventListener('pointerup', endSeek);
        track.addEventListener('pointercancel', endSeek);

        // Full screen on the figure, so the bar stays; the iPhone has only
        // the video's own player.
        const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
        const fullscreen = () => {
            if (fsEl() === figure) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) exit.call(document);
                return;
            }
            const req = figure.requestFullscreen || figure.webkitRequestFullscreen;
            if (req) {
                const p = req.call(figure);
                if (p && p.catch) p.catch(() => {});
            } else if (video.webkitEnterFullscreen) {
                try { video.webkitEnterFullscreen(); } catch (e) { /* not ready yet */ }
            }
        };
        const syncFs = () => {
            const on = fsEl() === figure;
            figure.classList.toggle('is-fullscreen', on);
            fullBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
        };
        fullBtn.addEventListener('click', fullscreen);
        document.addEventListener('fullscreenchange', syncFs);
        document.addEventListener('webkitfullscreenchange', syncFs);

        // The keyboard, from anywhere in the figure: space / k play and
        // pause (a focused button keeps its own space), m mutes, f is full
        // screen, the arrows step 5 s (Home and End on the line itself).
        figure.addEventListener('keydown', (e) => {
            if (!started() || e.altKey || e.ctrlKey || e.metaKey) return;
            const k = e.key.toLowerCase();
            const onBtn = !!e.target.closest('button');
            const onTrack = e.target === track;
            let t = null;
            if ((k === ' ' && !onBtn) || k === 'k') toggle();
            else if (k === 'm') video.muted = !video.muted;
            else if (k === 'f') fullscreen();
            else if (k === 'arrowright' || (onTrack && k === 'arrowup')) t = clamp(video.currentTime + 5);
            else if (k === 'arrowleft' || (onTrack && k === 'arrowdown')) t = clamp(video.currentTime - 5);
            else if (onTrack && k === 'home') t = 0;
            else if (onTrack && k === 'end') t = clamp(video.duration);
            else return;
            e.preventDefault();
            if (t !== null) { video.currentTime = t; render(); }
            show();
        });

        video.addEventListener('play', () => {
            figure.classList.add('is-started');
            syncState();
            wake();
            show();
        });
        video.addEventListener('pause', () => { syncState(); show(); });
        video.addEventListener('ended', () => { syncState(); render(); show(); });
        video.addEventListener('volumechange', syncState);
        ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'emptied'].forEach((name) => video.addEventListener(name, render));
        syncState();
        render();
    }
    window.WiCiFilm = { controls: buildFilmControls };

    /* ---- Smooth scrolling (Oct 28, 2026) ----
       Lenis (js/vendor/lenis-1.3.27.min.js, loaded before this file on
       every page) at its defaults: the wheel's steps are eased into the
       scroll (lerp 0.1, its own rAF), so pinned and scroll-driven pieces
       move instead of jumping; touch scrolling stays native. On every page. Not under reduced
       motion. It is held (stopped) while the page locks itself: the
       mobile menu open (nav-menu-open), the buy page's sheet (has-sheet),
       any open <dialog>; the inner scrollers carry data-lenis-prevent so
       the wheel scrolls them natively. The page's own scrolling (the hash
       links, the brand's scroll to top, the menu's lock) stays native:
       Lenis follows a native scroll while it is not animating one. */
    function initSmoothScroll() {
        if (typeof window.Lenis !== 'function') return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const lenis = new window.Lenis({ autoRaf: true });
        window.lenis = lenis;
        const root = document.documentElement;
        const locked = () => root.classList.contains('nav-menu-open') || root.classList.contains('has-sheet') || !!document.querySelector('dialog[open]');
        let held = false;
        const sync = () => {
            const lock = locked();
            if (lock === held) return;
            held = lock;
            if (lock) lenis.stop(); else lenis.start();
        };
        new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
        new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    }

    /* ---- Sticky nav scrolled state ---- */
    function initNavScroll() {
        const nav = document.getElementById('nav');
        if (!nav) return;
        const onScroll = () => {
            /* While the mobile menu is open the body is position-fixed and
               scrollY reads 0 — keep the scrolled state frozen until close. */
            if (document.documentElement.classList.contains('nav-menu-open')) return;
            nav.classList.toggle('is-scrolled', window.scrollY > 4);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    /* ---- Mobile menu ----
       Open: freeze the page behind by pinning the body where it is
       (position: fixed with the scroll offset folded into `top`); the
       header goes position: fixed at the same moment (common.css) and
       leaves the flow, so the pin is shifted down by its height and the
       page doesn't move. Close: undo both and put the scroll offset
       back, all in one synchronous step so no intermediate frame is
       ever painted. */
    /* Solutions dropdown: hover/focus open it in CSS; a tap on the
       label (touch, where there is no hover) opens the panel first and
       only navigates on the second tap; Escape and outside clicks close. */

    function initNavDrop() {
        const drops = Array.from(document.querySelectorAll('[data-nav-drop]'));
        if (!drops.length) return;
        const coarse = window.matchMedia('(hover: none)').matches;
        drops.forEach((drop) => {
            const btn = drop.querySelector('.nav-drop-btn');
            // Every trigger links to its own page: on touch a first
            // tap opens the menu and the next navigates.
            const open = () => {
                drops.forEach((d) => { if (d !== drop) closeOne(d); });
                drop.classList.add('is-open');
                btn.setAttribute('aria-expanded', 'true');
            };
            btn.addEventListener('click', (e) => {
                if (coarse && !drop.classList.contains('is-open')) {
                    e.preventDefault();
                    open();
                }
            });
        });
        const closeOne = (drop) => {
            drop.classList.remove('is-open');
            drop.querySelector('.nav-drop-btn').setAttribute('aria-expanded', 'false');
        };
        const closeAll = () => drops.forEach(closeOne);
        document.addEventListener('click', (e) => { if (!drops.some((d) => d.contains(e.target))) closeAll(); });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            closeAll();
            // Escape from inside a panel: give the focus up too, or
            // :focus-within keeps the panel showing.
            if (drops.some((d) => d.contains(document.activeElement))) document.activeElement.blur();
        });
    }

    function initMobileMenu() {
        const toggle = document.getElementById('navToggle');
        const menu = document.getElementById('navMobile');
        const nav = document.getElementById('nav');
        if (!toggle || !menu || !nav) return;

        let lockY = 0;
        const isOpen = () => menu.classList.contains('is-open');

        const open = () => {
            if (isOpen()) return;
            lockY = window.scrollY;
            nav.dataset.lockY = String(lockY);
            const navHeight = nav.offsetHeight;
            document.documentElement.classList.add('nav-menu-open');
            document.body.style.position = 'fixed';
            document.body.style.top = (navHeight - lockY) + 'px';
            document.body.style.left = '0';
            document.body.style.right = '0';
            nav.classList.add('is-menu-open');
            menu.classList.add('is-open');
            toggle.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', 'Close menu');
        };

        const close = () => {
            if (!isOpen()) return;
            menu.classList.remove('is-open');
            toggle.classList.remove('is-open');
            nav.classList.remove('is-menu-open');
            delete nav.dataset.lockY;
            document.documentElement.classList.remove('nav-menu-open');
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.right = '';
            window.scrollTo({ top: lockY, left: 0, behavior: 'instant' });
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Open menu');
        };

        toggle.addEventListener('click', () => (isOpen() ? close() : open()));
        // A "Stay tuned" link goes nowhere: the drawer stays open under
        // its tooltip.
        menu.querySelectorAll('a:not([data-stay-tuned])').forEach((a) => a.addEventListener('click', close));

        /* The groups (WiCi One, WiCi Infer, Solutions): collapsed by
           default, each expands in place. Once open, a tap on the title
           goes to the group's first link (its overview); the ring at the
           right, and the keyboard, fold it again. */
        menu.querySelectorAll('.nav-mobile-group-btn').forEach((groupBtn) => {
            const groupSub = document.getElementById(groupBtn.getAttribute('aria-controls'));
            if (!groupSub) return;
            groupBtn.addEventListener('click', (e) => {
                const expanded = groupBtn.getAttribute('aria-expanded') === 'true';
                const onRing = e.detail === 0 || e.clientX >= groupBtn.getBoundingClientRect().right - 56;
                const overview = groupSub.querySelector('a[href]');
                if (expanded && !onRing && overview) {
                    overview.click();
                    return;
                }
                groupBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                groupSub.hidden = expanded;
            });
        });
        window.addEventListener('resize', () => { if (window.innerWidth > 720) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen()) { close(); toggle.focus(); }
        });
    }

    /* ---- Same-page hash links ---- */
    function initHashLinks() {
        const getHashTarget = (hash) => {
            if (!hash || hash === '#') return null;
            if (hash === '#preorder') {
                const preorderForm = document.getElementById('preorderForm');
                if (preorderForm) return preorderForm;
            }
            return document.getElementById(hash.slice(1));
        };

        const scrollToHash = (hash, { updateHistory = true, smooth = false } = {}) => {
            const target = getHashTarget(hash);
            if (!target) return false;

            // A page may pin a second bar under the nav (the buy page's price
            // bar, the product page's ?now product bar), marked data-sticky-bar; the
            // target lands below both. A bar marked data-nav-yields (WiCi
            // Infer's product bar) hides the nav for a jump, so only the bar counts.
            const nav = document.getElementById('nav');
            const bar = document.querySelector('[data-sticky-bar]');
            const navHeight = nav && !(bar && bar.hasAttribute('data-nav-yields')) ? nav.offsetHeight : 0;
            const offset = nav ? navHeight + (bar ? bar.offsetHeight : 0) + 24 : 0;
            const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const root = document.documentElement;
            const previousScrollBehavior = root.style.scrollBehavior;
            root.style.scrollBehavior = 'auto';
            window.scrollTo({ top, left: 0, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
            root.style.scrollBehavior = previousScrollBehavior;
            if (updateHistory && window.location.hash !== hash) {
                history.pushState(null, '', hash);
            }
            return true;
        };

        document.querySelectorAll('a[href^="#"]').forEach((link) => {
            link.addEventListener('click', (e) => {
                const hash = link.getAttribute('href');
                if (!hash || hash === '#') return;

                if (!getHashTarget(hash)) return;

                e.preventDefault();
                scrollToHash(hash, { smooth: true });
            });
        });

        window.addEventListener('hashchange', () => {
            scrollToHash(window.location.hash, { updateHistory: false });
        });

        if (window.location.hash) {
            /* The late retries re-anchor the target as lazy images and
               fonts shift the layout — but the user's own scrolling must
               win: cancel on the first interaction, and also when the
               position has moved away from where we last put it (covers
               scrollbar drags, which fire none of these events). */
            let cancelled = false;
            let lastSetTop = null;
            const cancelInitialScroll = () => { cancelled = true; };
            ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((evt) => {
                window.addEventListener(evt, cancelInitialScroll, { once: true, passive: true });
            });
            const scrollToInitialHash = () => {
                if (cancelled) return;
                if (lastSetTop !== null && Math.abs(window.scrollY - lastSetTop) > 150) {
                    cancelled = true;
                    return;
                }
                scrollToHash(window.location.hash, { updateHistory: false });
                lastSetTop = window.scrollY;
            };
            requestAnimationFrame(scrollToInitialHash);
            window.addEventListener('load', () => {
                requestAnimationFrame(scrollToInitialHash);
                window.setTimeout(scrollToInitialHash, 250);
                window.setTimeout(scrollToInitialHash, 1000);
                window.setTimeout(scrollToInitialHash, 2000);
            }, { once: true });
        }
    }

    /* ---- Reveal on scroll ----
       The selector list intentionally spans every page's animatable
       elements; querySelectorAll just returns an empty NodeList for
       selectors that don't match on the current page, so this stays a
       single shared implementation. */
    function initReveal() {
        const targets = Array.from(document.querySelectorAll(
            '.hero-title, .hero-lede, .hero .nv-note, .hero-figure, .section-header, .tech-kicker, .tech-card, .waitlist-form, ' +
            '.phero-text, .phero-figure, .phero-scroll, ' +
            '.big-section-title, .big-section-lede, .big-figure:not(.big-figure--bleed), ' +
            '.hl-card, .trio-item, .why-card, .case-tile, .dx-hero, .dx-prose, .dx-item, .dx-finale, ' +
            '.spec, .faq-box, .preorder-form, .models-table-wrap, .models-points li, ' +
            '.about-quote, .about-legend-story, .about-then-now figure, .about-prose, .about-fact, .about-partner-row, ' +
            '.hero--about .section-kicker, #story .section-kicker, #story .section-title, #contact .section-title, ' +
            '.section--contact .untethered-lede, .section--contact .untethered-form, .contact-press-note, ' +
            '.pi-figures, .pi-place, .pi-section-head, .pi-prose, .pi-ledger-col, .pi-budget, .pi-share, ' +
            '.pi-compare-wrap, .pi-team, .pi-needs-body, .pi-land-card, .pi-cta-inner, .pi-sources'
        )).filter((el) => {
            // The homepage hero's stepped panel is clipped to the measured
            // position of its title lines (initHeroPanel in home.js); the
            // reveal's 14px lift would have them measured mid-flight.
            if (el.closest('.hero-stage')) return false;
            // Cards in a horizontal rail scroll in sideways; a reveal
            // fade would leave the off-screen ones blank until the
            // observer catches up.
            if (el.closest('[data-rail]')) return false;
            return true;
        });
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

    /* ---- "Stay tuned" tooltip for placeholder links ---- */
    function initStayTuned() {
        const targets = document.querySelectorAll('[data-stay-tuned]');
        if (!targets.length) return;

        let tooltip = null;
        let hideTimer = null;

        const ensureTooltip = () => {
            if (tooltip) return tooltip;
            tooltip = document.createElement('div');
            tooltip.className = 'stay-tuned-tooltip';
            tooltip.setAttribute('role', 'status');
            tooltip.setAttribute('aria-live', 'polite');
            tooltip.textContent = 'Stay tuned';
            document.body.appendChild(tooltip);
            return tooltip;
        };

        const positionAt = (el) => {
            const t = ensureTooltip();
            const rect = el.getBoundingClientRect();
            // The tooltip is absolute in <body>, which is position:
            // relative, so its coordinates are body's, not the
            // document's: on the homepage body starts 48px down (the
            // nav's top margin) and document coordinates put the
            // tooltip 48px low, on the entry's second line.
            const body = document.body;
            const positioned = getComputedStyle(body).position !== 'static';
            const origin = positioned ? body.getBoundingClientRect() : { left: -window.scrollX, top: -window.scrollY };
            t.style.left = `${rect.left + rect.width / 2 - origin.left}px`;
            t.style.top = `${rect.top - origin.top}px`;
        };

        const show = (el) => {
            const t = ensureTooltip();
            positionAt(el);
            requestAnimationFrame(() => t.classList.add('is-visible'));
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                t.classList.remove('is-visible');
            }, 1600);
        };

        targets.forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                show(el);
            });
        });
    }

    /* ---- Compatible-apps wall: category highlight ----
       The four category buttons above the wall and the tile groups
       below it share one highlight. Hovering (mouse only — touch
       "hovers" never end) or focusing either side lights the whole
       category: its label plus every group carrying that category,
       since 3D & creation spans two rows. A click on a label pins the
       category until it is clicked again or another is pinned; the
       hovered category always shows over the pinned one. Pure CSS
       :hover can only tint the group under the pointer, hence the
       class toggling here. Used by index.html and wici-one.html. ---- */
    function initAppsWall() {
        document.querySelectorAll('.apps-wall').forEach((wall) => {
            const cats = Array.from(wall.querySelectorAll('.apps-cat'));
            const groups = Array.from(wall.querySelectorAll('.apps-group'));
            if (!cats.length || !groups.length) return;

            let pinned = '';
            let hovered = '';

            const catsBar = wall.querySelector('.apps-cats');
            const render = () => {
                const active = hovered || pinned;
                cats.forEach((button) => {
                    button.classList.toggle('is-active', button.dataset.cat === active);
                    button.setAttribute('aria-pressed', button.dataset.cat === pinned ? 'true' : 'false');
                });
                groups.forEach((group) => {
                    group.classList.toggle('is-active', group.dataset.cat === active);
                });
                // Phone switcher: keep the active tab in view inside the pill
                if (catsBar && catsBar.scrollWidth > catsBar.clientWidth + 1) {
                    const btn = cats.find((b) => b.dataset.cat === active);
                    if (btn) {
                        const left = btn.offsetLeft - (catsBar.clientWidth - btn.offsetWidth) / 2;
                        catsBar.scrollTo({ left, behavior: 'smooth' });
                    }
                }
            };

            const hover = (cat) => { hovered = cat; render(); };
            const unhover = () => { hovered = ''; render(); };

            cats.concat(groups).forEach((el) => {
                el.addEventListener('pointerenter', (event) => {
                    if (event.pointerType === 'mouse') hover(el.dataset.cat);
                });
                el.addEventListener('pointerleave', (event) => {
                    if (event.pointerType === 'mouse') unhover();
                });
            });

            /* Phones: the grid is a horizontal snap rail and the
               category buttons are a switcher. A tap scrolls its card
               to the centre; scrolling the rail moves the switcher. */
            const grid = wall.querySelector('.apps-grid');
            const railMq = window.matchMedia('(max-width: 720px)');
            const groupFor = (cat) => groups.find((g) => g.dataset.cat === cat && getComputedStyle(g).display !== 'none');
            const scrollTo = (cat) => {
                const g = groupFor(cat);
                if (!g || !grid) return;
                const left = g.getBoundingClientRect().left - grid.getBoundingClientRect().left + grid.scrollLeft
                    - (grid.clientWidth - g.offsetWidth) / 2;
                grid.scrollTo({ left, behavior: 'smooth' });
            };
            const syncFromScroll = () => {
                if (!railMq.matches || !grid) return;
                const visible = groups.filter((g) => getComputedStyle(g).display !== 'none')
                    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
                if (!visible.length) return;
                const mid = grid.getBoundingClientRect().left + grid.clientWidth / 2;
                let best = null;
                let bestDist = Infinity;
                visible.forEach((g) => {
                    const r = g.getBoundingClientRect();
                    const d = Math.abs(r.left + r.width / 2 - mid);
                    if (d < bestDist) { bestDist = d; best = g; }
                });
                // At either end the edge card may never reach the centre
                // (narrow cards, short padding), so the ends select it.
                const max = grid.scrollWidth - grid.clientWidth;
                if (grid.scrollLeft >= max - 2) best = visible[visible.length - 1];
                else if (grid.scrollLeft <= 2) best = visible[0];
                if (best && pinned !== best.dataset.cat) { pinned = best.dataset.cat; render(); }
            };
            if (grid) {
                let ticking = false;
                grid.addEventListener('scroll', () => {
                    if (ticking) return;
                    ticking = true;
                    requestAnimationFrame(() => { ticking = false; syncFromScroll(); });
                }, { passive: true });
            }
            const applyMode = () => {
                pinned = railMq.matches ? 'ai' : '';
                render();
            };
            railMq.addEventListener('change', applyMode);
            applyMode();

            cats.forEach((button) => {
                button.addEventListener('focus', () => { if (!railMq.matches) hover(button.dataset.cat); });
                button.addEventListener('blur', unhover);
                button.addEventListener('click', () => {
                    if (railMq.matches) {
                        pinned = button.dataset.cat;
                        render();
                        scrollTo(button.dataset.cat);
                        return;
                    }
                    pinned = pinned === button.dataset.cat ? '' : button.dataset.cat;
                    render();
                });
            });
        });
    }

    /* ---- Footer year ---- */
    function initYear() {
        const el = document.getElementById('year');
        if (el) el.textContent = String(new Date().getFullYear());
    }
})();

/* ---- Arrivals start at the top ----
   A fresh visit without an anchor stays at the top until the visitor
   touches, clicks, scrolls or types. Some in-app browsers (Instagram's on
   iPhone) focus the first email field they find to offer autofill, and the
   browser scrolls the page down to it. For the first 10 s, a scroll the
   visitor did not make is undone and a focused field is let go. Anchors,
   reloads and back/forward keep their own position. */
(function () {
    'use strict';
    try {
        const entry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        if (window.location.hash || (entry && entry.type !== 'navigate')) return;
        const until = Date.now() + 10000;
        let done = false;
        const stop = () => {
            done = true;
            window.removeEventListener('scroll', guard);
        };
        function guard() {
            if (done || Date.now() > until) return stop();
            if (window.scrollY <= 0) return;
            const field = document.activeElement;
            if (field && /^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)) field.blur();
            if (window.lenis && typeof window.lenis.scrollTo === 'function') window.lenis.scrollTo(0, { immediate: true, force: true });
            window.scrollTo(0, 0);
        }
        ['touchstart', 'pointerdown', 'wheel', 'keydown'].forEach((type) => window.addEventListener(type, stop, { capture: true, passive: true }));
        window.addEventListener('scroll', guard, { passive: true });
        guard();
    } catch (error) { /* no guard */ }
})();
