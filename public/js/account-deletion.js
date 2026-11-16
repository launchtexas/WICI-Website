(() => {
  'use strict';
  const service = 'https://ukaqrawlkhuwajbnekyl.supabase.co';
  const publicKey = 'sb_publishable_EvgrWgycs-FZokg3RB_Gaw_VR8nTb-9';
  const redirect = 'https://wici.ai/delete-account.html';
  const pendingKey = 'wici-delete-pkce';
  const status = document.getElementById('status');
  const signIn = document.getElementById('sign-in');
  const confirmation = document.getElementById('confirmation');
  const confirm = document.getElementById('confirm-delete');
  const deleteButton = document.getElementById('delete-account');
  let accessToken;
  let busy = false;
  const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const setStatus = text => { status.textContent = text; };
  const clearSession = () => {
    accessToken = undefined;
    confirmation.hidden = true;
    confirm.checked = false;
    deleteButton.disabled = true;
    document.getElementById('account-email').textContent = '';
  };
  async function post(path, body, token) {
    return fetch(`${service}${path}`, {
      method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', apikey: publicKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
    });
  }
  signIn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    signIn.disabled = true;
    clearSession();
    try {
      const verifier = random();
      const state = random();
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      sessionStorage.setItem(pendingKey, JSON.stringify({ verifier, state, started: Date.now() }));
      const query = new URLSearchParams({ provider: 'google', redirect_to: `${redirect}?wici_state=${state}`, code_challenge: challenge, code_challenge_method: 's256', prompt: 'select_account' });
      location.assign(`${service}/auth/v1/authorize?${query}`);
    } catch {
      setStatus('Could not start sign-in. Enable browser storage and try again, or request deletion by email below.');
      busy = false;
      signIn.disabled = false;
    }
  });
  confirm.addEventListener('change', () => { deleteButton.disabled = !confirm.checked || !accessToken || busy; });
  document.getElementById('cancel').addEventListener('click', () => {
    if (busy) return;
    clearSession();
    signIn.hidden = false;
    setStatus('Canceled. Your account has not been deleted.');
  });
  deleteButton.addEventListener('click', async () => {
    if (!accessToken || !confirm.checked || busy) return;
    busy = true;
    deleteButton.disabled = true;
    setStatus('Deleting your account…');
    try {
      const response = await post('/functions/v1/delete-account', { delete_account: true }, accessToken);
      const result = await response.json();
      if (!response.ok || result.deleted !== true) throw new Error('Not confirmed');
      clearSession();
      setStatus('Your WiCi One account has been deleted. Your Google account and files on your devices are unchanged.');
      signIn.hidden = true;
    } catch {
      // A lost response can follow a successful deletion. Never claim failure or
      // encourage signing in again (which would create a new account) as a retry.
      setStatus('Deletion was not confirmed. You can retry once here, or email adam@wici.ai to check the outcome. Signing in again may create a new account.');
      deleteButton.disabled = !confirm.checked;
    } finally { busy = false; }
  });
  async function completeSignIn() {
    const current = new URL(location.href);
    if (!current.searchParams.has('code') && !current.searchParams.has('error')) return;
    // Remove the code before any other request; this page loads no analytics.
    history.replaceState(null, '', location.pathname);
    busy = true;
    signIn.disabled = true;
    setStatus('Confirming your account…');
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
      sessionStorage.removeItem(pendingKey);
      if (!pending || Date.now() < pending.started || Date.now() - pending.started > 600000 ||
          current.origin + current.pathname !== redirect || current.hash ||
          current.searchParams.getAll('wici_state').length !== 1 || current.searchParams.get('wici_state') !== pending.state ||
          current.searchParams.has('error') || current.searchParams.getAll('code').length !== 1) throw new Error('Invalid callback');
      const response = await post('/auth/v1/token?grant_type=pkce', { auth_code: current.searchParams.get('code'), code_verifier: pending.verifier });
      const session = await response.json();
      if (!response.ok || typeof session.access_token !== 'string' || !session.access_token || !session.user?.email) throw new Error('Missing session');
      accessToken = session.access_token; // Memory only; never localStorage, a URL, or logs.
      document.getElementById('account-email').textContent = session.user.email;
      signIn.hidden = true;
      confirmation.hidden = false;
      setStatus('Signed in. Review the account and confirm below to delete it.');
    } catch {
      clearSession();
      setStatus('Sign-in was canceled, expired, or could not be verified. No deletion was requested. Try again or use email below.');
    } finally { busy = false; signIn.disabled = false; }
  }
  void completeSignIn();
})();
