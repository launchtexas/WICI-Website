/* =========================================
   Shipping, returns, and warranty (shop/policies.html)
   The tab pill shows one policy at a time, chosen by the URL's hash:
   #shipping (the default), #returns, #warranty. A tab is a plain hash
   link, so the address always names the policy on screen, Back and
   Forward step through the tabs, and other pages can link to one.
   No dependencies.
   ========================================= */

(function () {
    'use strict';

    const tabs = Array.from(document.querySelectorAll('[data-policy-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-policy]'));
    if (!tabs.length || !panels.length) return;

    const names = panels.map((panel) => panel.dataset.policy);

    function show() {
        const hash = window.location.hash.slice(1);
        const name = names.includes(hash) ? hash : names[0];
        tabs.forEach((tab) => {
            const current = tab.dataset.policyTab === name;
            tab.classList.toggle('is-active', current);
            if (current) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });
        panels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.policy === name);
        });
    }

    document.documentElement.classList.add('has-policy-tabs');
    show();
    window.addEventListener('hashchange', show);
})();
