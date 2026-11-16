/* =========================================
   WiCi - Shared form submission
   Sends public forms through the verified API.
   ========================================= */

(function (w, d, n) {
    'use strict';

    const SIGNUP_API_URL = 'https://webapi.wici.ai/waitlist';

    function createSubmissionId() {
        if (w.crypto && typeof w.crypto.randomUUID === 'function') {
            return w.crypto.randomUUID();
        }

        if (w.crypto && typeof w.crypto.getRandomValues === 'function') {
            const bytes = new Uint8Array(16);
            w.crypto.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
            return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
        }

        throw new Error('Secure submission ID generation is unavailable');
    }

    function getTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        } catch (error) {
            return '';
        }
    }

    function getReferrerHost() {
        if (!d.referrer) return '';

        try {
            const referrer = new URL(d.referrer);
            return referrer.hostname === w.location.hostname ? '' : referrer.hostname;
        } catch (error) {
            return '';
        }
    }

    function getDeviceClass() {
        const userAgent = n.userAgent || '';

        if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return 'tablet';
        if ((n.userAgentData && n.userAgentData.mobile) || /Mobi|Android|iPhone|iPod/i.test(userAgent)) return 'mobile';
        return 'desktop';
    }

    function getPlatform() {
        const hint = (n.userAgentData && n.userAgentData.platform) || n.platform || '';
        const userAgent = n.userAgent || '';
        const combined = `${hint} ${userAgent}`;

        if (/Android/i.test(combined)) return 'Android';
        if (/iPhone|iPad|iPod/i.test(combined)) return 'iOS';
        if (/Win/i.test(combined)) return 'Windows';
        if (/Mac/i.test(combined)) return 'macOS';
        if (/CrOS/i.test(combined)) return 'ChromeOS';
        if (/Linux/i.test(combined)) return 'Linux';
        return 'Other';
    }

    function getBrowserFamily() {
        const userAgent = n.userAgent || '';

        if (/Edg\//i.test(userAgent)) return 'Edge';
        if (/OPR\//i.test(userAgent)) return 'Opera';
        if (/Firefox\/|FxiOS\//i.test(userAgent)) return 'Firefox';
        if (/Chrome\/|CriOS\//i.test(userAgent)) return 'Chrome';
        if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) return 'Safari';
        return 'Other';
    }

    /* Campaign params live only on the landing URL; js/common.js banks
       them in sessionStorage on arrival. Prefer what is on the URL right
       now, and fall back to that stash otherwise — without it, any signup
       submitted after a single internal click records no campaign at all.

       The set is resolved as a unit: if the current URL carries any
       campaign param it wins outright, rather than having its blanks
       filled from an older touch. Mixing this URL's utm_source with a
       previous campaign's utm_medium would invent a combination that
       never existed. */
    const UTM_STORE_KEY = 'wici:acq';
    const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

    function readStoredAcquisition() {
        try {
            const raw = w.sessionStorage.getItem(UTM_STORE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function resolveAcquisition() {
        let params;
        try {
            params = new URLSearchParams(w.location.search);
        } catch (error) {
            params = null;
        }

        const fromUrl = {};
        let hasCampaign = false;
        UTM_FIELDS.forEach((field) => {
            const value = (params && params.get(field)) || '';
            fromUrl[field] = value;
            if (value) hasCampaign = true;
        });

        const referrerHost = getReferrerHost();
        if (hasCampaign) {
            return Object.assign({}, fromUrl, { referrer_host: referrerHost });
        }

        const stored = readStoredAcquisition();
        if (!stored) {
            return Object.assign({}, fromUrl, { referrer_host: referrerHost });
        }

        const resolved = {};
        UTM_FIELDS.forEach((field) => {
            resolved[field] = typeof stored[field] === 'string' ? stored[field] : '';
        });
        // A same-host referrer resolves to '' mid-visit, so the landing
        // page's external referrer is the more useful of the two.
        resolved.referrer_host = referrerHost || (typeof stored.referrer_host === 'string' ? stored.referrer_host : '');
        return resolved;
    }

    function collect(form) {
        // data-list files the signup under a named list on the service (an
        // event RSVP form, say) instead of the default waitlist. Forms
        // without it send no `list` key, and the service treats that as the
        // default, so existing forms are unaffected.
        const listed = form.dataset.list ? { list: form.dataset.list } : {};
        return Object.assign({
            source_page: w.location.pathname,
            form_name: form.dataset.formName || form.id || 'signup',
        }, listed, resolveAcquisition(), {
            timezone: getTimezone(),
            device_class: getDeviceClass(),
            platform: getPlatform(),
            browser_family: getBrowserFamily(),
            browser_language: n.language || '',
        });
    }

    function withContext(form, payload) {
        if (!form.dataset.submissionId) {
            form.dataset.submissionId = createSubmissionId();
        }

        return Object.assign({}, payload, collect(form), {
            submission_id: form.dataset.submissionId,
        });
    }

    async function submit(payload) {
        const response = await fetch(SIGNUP_API_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify(payload),
            keepalive: true,
        });

        if (!response.ok) {
            throw new Error(`Signup request failed with HTTP ${response.status}`);
        }

        let result;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error('Signup response was not valid JSON');
        }

        if (!result || result.status !== 'success' || result.submission_id !== payload.submission_id) {
            throw new Error('Signup response could not be verified');
        }

        return result;
    }

    function submitButtonOf(form) {
        return form.querySelector('button[type="submit"]');
    }

    function setPending(form, label) {
        const button = submitButtonOf(form);
        if (!button) return;

        const error = form.querySelector('[data-signup-error]');
        if (error) error.remove();

        // Lock the width so the label swaps can't reflow the button —
        // the state reads as a quiet text change, nothing animated.
        button.style.minWidth = `${Math.ceil(button.getBoundingClientRect().width)}px`;
        button.classList.remove('is-sent');
        button.setAttribute('aria-busy', 'true');
        button.textContent = label || 'Securing your spot…';
    }

    function setError(form, mailtoHref, message) {
        form.querySelectorAll('input, textarea, button').forEach((element) => {
            element.disabled = false;
        });

        const button = submitButtonOf(form);
        if (button) {
            button.removeAttribute('aria-busy');
            button.classList.remove('is-sent');
            button.textContent = 'Try again';
        }

        const error = d.createElement('p');
        error.className = 'signup-submit-error';
        error.dataset.signupError = '';
        error.setAttribute('role', 'alert');
        error.append(d.createTextNode(message || 'We could not verify your signup. Try again or '));

        const link = d.createElement('a');
        link.href = mailtoHref;
        link.textContent = 'email us';
        error.append(link, d.createTextNode('.'));

        const notice = form.querySelector('.signup-notice');
        if (notice && notice.classList.contains('signup-notice--on-dark')) {
            error.classList.add('signup-submit-error--on-dark');
        }
        form.insertBefore(error, notice || null);
    }

    function setSuccess(form, label) {
        const button = submitButtonOf(form);
        if (!button) return;

        const error = form.querySelector('[data-signup-error]');
        if (error) error.remove();

        button.removeAttribute('aria-busy');
        button.classList.add('is-sent');
        button.textContent = label;
        delete form.dataset.submissionId;
    }

    w.WiCiSignup = Object.freeze({
        collect,
        withContext,
        submit,
        setPending,
        setError,
        setSuccess,
    });
})(window, document, navigator);
