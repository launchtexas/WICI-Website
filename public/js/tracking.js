/* =========================================
   WiCi — Centralized tracking
   Loaded in the <head> of every page. All analytics/tag scripts live
   here so pages carry a single one-line footprint.
   - Google Tag Manager (GTM-MWFQ4T6V); the <noscript> iframe fallback
     is intentionally omitted — a visitor without JS never runs any
     tag anyway.
   ========================================= */

(function (w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var f = d.getElementsByTagName(s)[0];
    var j = d.createElement(s);
    var dl = l !== 'dataLayer' ? '&l=' + l : '';
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
    f.parentNode.insertBefore(j, f);
})(window, document, 'script', 'dataLayer', 'GTM-MWFQ4T6V');
