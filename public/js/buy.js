/* =========================================
   WiCi One — Buy page (shop/wici-one.html, at wici.ai/shop/wici-one)
   The Continue button is a plain <a> to a Shopify cart permalink
   (store.wici.ai/cart/<variantId>:1?ref=...), so checkout works with no
   script at all — the page then sells the checked edition. This file
   adds the configurator behaviour on top:
   - Edition radios (preselectable with `?edition=5060|5060ti|5090`): outline the selected card, swap every [data-buy-price]
     / [data-buy-edition] text, highlight that edition's column in the
     comparison table, and point Continue at that variant's permalink
     (all read from the radio's data-* attributes — the store's variant
     IDs live in the page markup, not here).
   - Gallery: scroll-snap track with prev / next arrows and dots.
   - Discount code: a code that came in on the URL (`?discount=<code>`,
     the links in our emails) or was kept in a cookie by js/common.js
     is added to the Continue link (`&discount=<code>`), so checkout opens
     with it applied, and the summary says so.
   - Order attribution: the list js/common.js keeps in a cookie goes to
     checkout as cart attributes, `attributes[utm_1]`, `[utm_2]`, … (each
     campaign that brought the visitor, oldest first) and
     `attributes[visit]` (first referrer, landing page, date), which the
     store keeps on the order; the latest campaign also rides the link as
     plain `utm_*` parameters, for the store's own reports.
   - Continue click: a `wici_one_config_confirmed` dataLayer event for GTM before the
     browser follows the link.
   - Sheets: the Benchmarks and Tech specs <dialog>s opened by the two
     help cards under Edition (`buy_sheet_open` dataLayer event).
   ========================================= */

(function () {
    'use strict';

    /* ---- Discount code ----
       js/common.js decides (window.WiCiDiscount.offer()): the code on
       this URL, else the one kept in its cookie, else the launch code
       while it runs, with the amount and the words for the codes it knows.
       Shopify applies `?discount=<code>` on a cart permalink at checkout
       and simply ignores a code that is not valid, so an unknown code
       still goes on the link; the summary just gives no figure for it. */
    function currentOffer() {
        return window.WiCiDiscount ? window.WiCiDiscount.offer() : null;
    }

    /* ---- Order attribution ----
       The short list js/common.js keeps of where this visitor came from:
       the arrival that started it (outside referrer, landing page, date),
       then each campaign since, oldest first (same cookie name, character
       set, and record layout as there). It rides the Continue link as
       cart attributes beside the markup's own `source`: `visit`, the
       first arrival, and `utm_1`, `utm_2`, … one per campaign, so the
       original campaign and a later one (say the ad that brought someone
       in, then our email) both reach the order and no single value grows
       long enough to be cut. Shopify stores them on the order
       ("Additional details" in the admin, `note_attributes` in the API).
       The latest campaign is also repeated as plain `utm_*` parameters on
       the link (`query`): the cart link is the visitor's first request to
       the store, so that is where the store's own attribution would read
       a campaign from. Anything that is not in the expected shape is
       dropped. */
    const ATTRIBUTION_COOKIE = 'wici_attribution';
    const ATTRIBUTION_TOUCH_MAX = 4;
    const ATTRIBUTION_PATTERN = /^[A-Za-z0-9 ._~+\-\/:@,|()=&;]{1,2600}$/;

    function attribution() {
        let list = '';
        try {
            const kept = document.cookie.split('; ').find((pair) => pair.indexOf(ATTRIBUTION_COOKIE + '=') === 0);
            list = kept ? decodeURIComponent(kept.slice(ATTRIBUTION_COOKIE.length + 1)) : '';
        } catch (error) {
            list = '';
        }
        const records = ATTRIBUTION_PATTERN.test(list) ? list.split(';').filter(Boolean) : [];
        const isUtm = (pair) => pair.indexOf('utm_') === 0;
        const encoded = (pair) => {
            const cut = pair.indexOf('=');
            return pair.slice(0, cut + 1) + encodeURIComponent(pair.slice(cut + 1));
        };

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
        while (touches.length > ATTRIBUTION_TOUCH_MAX) touches.splice(1, 1);

        const latest = touches.length ? touches[touches.length - 1].split('&').filter(isUtm) : [];
        return { visit, touches, query: latest.map(encoded).join('&') };
    }

    document.addEventListener('DOMContentLoaded', () => {
        initChoices();
        initGallery();
        initContinue();
        initSheets();
    });

    /* ---- Edition + payment ----
       Two radio groups drive every figure on the page. Edition (the only
       choice that maps to a store variant) sets the edition slots, the
       compare column, the Buy card's full price, the installments card's
       monthly figure (price / months, to the cent), and the Continue
       link. Payment (full or installments) sets what the price bar and the
       summary show: "Buy $3,499" or "Installments $194.39/mo.", and adds
       payment=shop_pay to Continue so checkout opens in Shop Pay, where
       the installment plan is offered. */
    function initChoices() {
        const editions = Array.from(document.querySelectorAll('input[name="edition"]'));
        if (!editions.length) return;
        const payments = Array.from(document.querySelectorAll('input[name="payment"]'));

        const priceEls = document.querySelectorAll('[data-buy-price]');
        const labelEls = document.querySelectorAll('[data-buy-pay-label]');
        const fullEls = document.querySelectorAll('[data-buy-price-full]');
        const monthlyEls = document.querySelectorAll('[data-buy-monthly]');
        const editionEls = document.querySelectorAll('[data-buy-edition]');
        const columns = document.querySelectorAll('.buy-compare [data-edition]');
        const cont = document.getElementById('buyContinue');
        const plan = payments.find((r) => r.value === 'installments');
        const months = (plan && Number(plan.dataset.months)) || 18;
        const offer = currentOffer();
        const discount = offer ? offer.code : '';
        const amount = offer && offer.amount;
        // Dollars off for a known code (js/common.js): the prices below are
        // shown less this, the full price struck through beside them; checkout takes the code off the full price.
        const off = window.WiCiDiscount && window.WiCiDiscount.off ? window.WiCiDiscount.off() : 0;
        const dollars = (n) => '$' + Number(n).toLocaleString('en-US');
        // Writes "<del>$3,499</del> $2,699" into el, or just the price without an offer.
        const priced = (el, price, text) => {
            el.textContent = '';
            if (off && Number(price) > off) {
                const was = document.createElement('del');
                was.className = 'buy-price-was';
                was.textContent = text || dollars(price);
                el.append(was, ' ', dollars(Number(price) - off));
            } else {
                el.textContent = text || dollars(price);
            }
        };
        const net = (price) => (off && Number(price) > off ? Number(price) - off : Number(price));
        const source = attribution();
        const discountNote = document.getElementById('buyDiscount');
        if (discount && discountNote) {
            discountNote.querySelector('[data-buy-discount]').textContent = discount;
            if (amount) {
                // "<lead>: code X takes $800 off at checkout."
                const figure = document.createElement('strong');
                figure.textContent = amount;
                const code = document.createElement('strong');
                code.textContent = discount;
                discountNote.textContent = '';
                discountNote.append(offer.lead + ': code ', code, ' takes ', figure, ' off at checkout.');
            }
            discountNote.hidden = false;
            // The price bar says it too, in the ship line's place.
            const barDiscount = document.querySelector('[data-buy-bar-discount]');
            const barShip = document.querySelector('.buy-bar-ship');
            if (amount && barDiscount) {
                barDiscount.textContent = amount + ' off at checkout';
                barDiscount.hidden = false;
                if (barShip) barShip.hidden = true;
            }
        }
        const monthly = (price) => '$' + (Number(price) / months)
            .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        function render() {
            const edition = editions.find((r) => r.checked) || editions[0];
            const payment = payments.find((r) => r.checked) || payments[0];
            const installments = !!payment && payment.value === 'installments';

            editions.forEach((r) => {
                r.closest('.buy-option').classList.toggle('is-selected', r === edition);
            });
            payments.forEach((r) => {
                r.closest('.buy-option').classList.toggle('is-selected', r === payment);
            });
            editionEls.forEach((el) => { el.textContent = edition.dataset.label; });
            columns.forEach((cell) => {
                cell.classList.toggle('is-selected', cell.dataset.edition === edition.value);
            });
            fullEls.forEach((el) => { priced(el, edition.dataset.price, edition.dataset.priceText); });
            monthlyEls.forEach((el) => { el.textContent = monthly(net(edition.dataset.price)); });
            labelEls.forEach((el) => { el.textContent = installments ? 'Installments' : 'Buy'; });
            priceEls.forEach((el) => {
                if (installments) el.textContent = monthly(net(edition.dataset.price)) + '/mo.';
                else priced(el, edition.dataset.price, edition.dataset.priceText);
            });
            if (cont) {
                cont.href = edition.dataset.href
                    + source.touches.map((touch, i) => '&attributes%5Butm_' + (i + 1) + '%5D=' + encodeURIComponent(touch)).join('')
                    + (source.visit ? '&attributes%5Bvisit%5D=' + encodeURIComponent(source.visit) : '')
                    + (source.query ? '&' + source.query : '')
                    + (installments ? '&payment=shop_pay' : '')
                    + (discount ? '&discount=' + encodeURIComponent(discount) : '');
                cont.dataset.coupon = discount;
                cont.dataset.variantId = edition.dataset.variantId;
                cont.dataset.variantTitle = edition.dataset.variantTitle;
                cont.dataset.price = edition.dataset.price;
                cont.dataset.payment = installments ? 'installments' : 'full';
            }
        }

        editions.forEach((r) => r.addEventListener('change', render));
        payments.forEach((r) => r.addEventListener('change', render));
        // `?edition=5060` (or `5060ti`) / `?edition=5090` — the edition-specific
        // links in wici-one?now — preselects that edition, matched on the
        // radio value or its digits. Otherwise browsers restore a radio
        // choice on back-navigation, so render from whatever is checked.
        const wanted = (new URLSearchParams(location.search).get('edition') || '').toLowerCase();
        const preset = wanted
            ? editions.find((r) => r.value === wanted || r.value.replace(/[^0-9]/g, '') === wanted)
            : null;
        if (preset) preset.checked = true;
        render();
    }

    /* ---- Gallery ---- */
    function initGallery() {
        const stage = document.querySelector('.buy-stage');
        if (!stage) return;
        const track = stage.querySelector('.buy-track');
        const slides = Array.from(track.querySelectorAll('.buy-slide'));
        const dots = Array.from(stage.querySelectorAll('.buy-dot'));
        const prev = stage.querySelector('.buy-arrow--prev');
        const next = stage.querySelector('.buy-arrow--next');
        if (slides.length < 2) {
            if (next) next.hidden = true;
            return;
        }

        let index = 0;

        function goTo(i) {
            index = Math.max(0, Math.min(slides.length - 1, i));
            track.scrollTo({ left: slides[index].offsetLeft, behavior: 'smooth' });
        }

        /* The first slide is a looping film (the 360° turn, then the
           exploded turn) that plays by itself; the gallery never advances
           on its own. Reduced motion keeps the film on its poster, and a
           tap starts it where the browser held autoplay back. */
        const film = track.querySelector('video');
        if (film) {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                film.removeAttribute('autoplay');
                film.pause();
            }
            film.addEventListener('click', () => { if (film.paused) film.play(); });
        }

        function sync() {
            const w = track.clientWidth || 1;
            index = Math.round(track.scrollLeft / w);
            dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
            if (prev) prev.hidden = index === 0;
            if (next) next.hidden = index === slides.length - 1;
        }

        dots.forEach((d) => d.addEventListener('click', () => goTo(Number(d.dataset.slide))));
        if (prev) prev.addEventListener('click', () => goTo(index - 1));
        if (next) next.addEventListener('click', () => goTo(index + 1));
        track.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
        });

        let raf = 0;
        track.addEventListener('scroll', () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(sync);
        }, { passive: true });
        sync();
    }

    /* ---- Continue → GTM ---- */
    function initContinue() {
        const btn = document.getElementById('buyContinue');
        if (!btn) return;
        btn.addEventListener('click', () => {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'wici_one_config_confirmed',
                form_name: btn.dataset.buy || 'shop-wici-one',
                variant_id: btn.dataset.variantId || '',
                variant_title: btn.dataset.variantTitle || '',
                price: Number(btn.dataset.price) || 0,
                payment: btn.dataset.payment || 'full',
                coupon: btn.dataset.coupon || '',
                currency: 'USD',
            });
        });
    }

    /* ---- Sheets ----
       The two help cards under Edition and the Compare step's fine
       print (data-sheet="bench|specs") open the matching
       <dialog class="buy-sheet"> at the end of <body> as a modal. Close
       button, a click on the backdrop, and Escape all close it; focus
       returns to whatever opened it. */
    function initSheets() {
        const sheets = Array.from(document.querySelectorAll('dialog.buy-sheet'));
        if (!sheets.length || typeof HTMLDialogElement === 'undefined') return;
        const root = document.documentElement;
        let opener = null;

        const open = (sheet, from) => {
            if (sheet.open) return;
            opener = from;
            const inner = sheet.querySelector('.buy-sheet-inner');
            if (inner) inner.scrollTop = 0;
            sheet.showModal();
            root.classList.add('has-sheet');
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: 'buy_sheet_open', sheet: sheet.id.replace(/^sheet-/, '') });
        };

        document.querySelectorAll('[data-sheet]').forEach((btn) => {
            const sheet = document.getElementById('sheet-' + btn.dataset.sheet);
            if (!sheet) return;
            btn.addEventListener('click', () => open(sheet, btn));
        });

        sheets.forEach((sheet) => {
            sheet.querySelectorAll('[data-sheet-close]').forEach((btn) => {
                btn.addEventListener('click', () => sheet.close());
            });
            // A click that lands on the dialog itself (not its content)
            // is on the backdrop.
            sheet.addEventListener('click', (event) => {
                if (event.target === sheet) sheet.close();
            });
            sheet.addEventListener('close', () => {
                root.classList.remove('has-sheet');
                if (opener) {
                    opener.focus();
                    opener = null;
                }
            });
        });
    }
})();
