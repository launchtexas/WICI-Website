/* =========================================
   WiCi — About page interactivity
   Loaded by about.html only (after js/signup.js).
   - Contact form (verified public API via js/signup.js)
   ========================================= */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        initContactForm();
    });

    function initContactForm() {
        const form = document.getElementById('contactForm');
        if (!form) return;

        const messageField = form.querySelector('[name="message"]');
        const submitButton = form.querySelector('button[type="submit"]');
        const messageLimitWarning = form.querySelector('[data-contact-message-limit]');

        function updateMessageLimitState() {
            const messageIsTooLong = messageField.value.length > 512;
            submitButton.disabled = messageIsTooLong;
            messageLimitWarning.hidden = !messageIsTooLong;

            if (messageIsTooLong) {
                messageField.setAttribute('aria-invalid', 'true');
            } else {
                messageField.removeAttribute('aria-invalid');
            }
        }

        messageField.addEventListener('input', updateMessageLimitState);
        updateMessageLimitState();

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const honey = form.querySelector('[name="_honey"]');
            if (honey && honey.value) return;

            const name = form.querySelector('[name="name"]').value || '';
            const email = form.querySelector('[name="email"]').value || '';
            const message = form.querySelector('[name="message"]').value || '';
            if (message.length > 512) {
                updateMessageLimitState();
                messageField.focus();
                return;
            }

            const messageWithName = name ? `Name: ${name}\n\n${message}` : message;
            const payload = window.WiCiSignup.withContext(form, {
                email,
                message: messageWithName.length <= 512 ? messageWithName : message,
            });

            form.querySelectorAll('input, textarea, button').forEach(el => el.disabled = true);
            window.WiCiSignup.setPending(form, 'Sending…');

            try {
                await window.WiCiSignup.submit(payload);
            } catch (err) {
                const subject = encodeURIComponent('WiCi Contact');
                const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nMessage: ${message}`);
                window.WiCiSignup.setError(
                    form,
                    `mailto:hello@wici.ai?subject=${subject}&body=${body}`,
                    'We could not verify your message. Try again or ',
                );
                return;
            }

            window.WiCiSignup.setSuccess(form, 'Message sent ✓');

            // Report the conversion to GTM, tagged like the newsletter
            // forms (data-form-name attribute) but as its own event.
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'contact_form_submit',
                form_name: form.dataset.formName || 'about-contact',
            });
        });
    }
})();
