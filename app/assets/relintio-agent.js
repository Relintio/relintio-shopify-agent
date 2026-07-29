/**
 * Relintio – Shopify ScriptTag Agent v2.0.0
 *
 * Injected into the storefront via the Shopify ScriptTag API and served from
 * the Relintio platform, which means this file and everything printed into it
 * is readable by every visitor of the store.
 *
 * That is why v2 carries a *publishable* key (pk_live_...) rather than the
 * licence key. The licence key is the HMAC key for the challenge passport and
 * for request signing; a public one would let anyone mint a passport that waves
 * themselves past the WAF for this store, and let anyone forge telemetry into
 * the device reputation store. A publishable key holds one scope — decision:read
 * — so the worst a stranger can do with the key in this file is ask whether
 * their own request would be allowed.
 *
 * For the same reason this talks to /agent/decision rather than /agent/verify.
 * The verify endpoint answers with the policy: the rule set, the thresholds,
 * the blocklists. A browser is the last place any of that should be. The
 * decision endpoint answers with a verdict and keeps the reasoning server-side.
 *
 * Upgrading from v1.x: the ScriptTag URL is unchanged. The platform substitutes
 * a publishable key where it used to substitute the licence key, and the
 * heartbeat call is gone — the server derives liveness from the decisions this
 * asks for, which is a signal a public key cannot forge.
 */
(function () {
  'use strict';

  var RL_VERSION = '2.0.0';
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1] || null;
  })();

  function cleanConfig(value) {
    value = value == null ? '' : String(value).trim();
    if (!value || /\{\{[^}]+\}\}/.test(value)) return '';
    return value;
  }

  var RL_API = cleanConfig(script && (script.getAttribute('data-rl-api') || script.getAttribute('data-ag-api'))) ||
    cleanConfig('{{API_URL}}') ||
    'https://api.relintio.com/v1';

  // `data-rl-key` now expects a publishable key. The older attribute names are
  // still read so an un-updated theme snippet keeps working, but a licence key
  // supplied through any of them is refused below rather than sent.
  var RL_KEY = cleanConfig(script && (script.getAttribute('data-rl-key') || script.getAttribute('data-ag-key') || script.getAttribute('data-license-key'))) ||
    cleanConfig('{{PUBLISHABLE_KEY}}') ||
    cleanConfig(window.Relintio && (window.Relintio.publishableKey || window.Relintio.licenseKey));

  // Abort in admin/checkout/design-mode contexts
  if (window.Shopify && window.Shopify.designMode) return;
  if (/\/(admin|checkout)(\/|$)/i.test(window.location.pathname)) return;
  if (!RL_API || !RL_KEY) return;

  // A licence key in a storefront script is a security incident, not a
  // configuration quirk to route around. Refusing to send it is the point:
  // failing loudly in the console beats quietly publishing the key.
  if (RL_KEY.indexOf('pk_') !== 0) {
    if (window.console && console.error) {
      console.error('[Relintio] Refusing to start: data-rl-key must be a publishable key (pk_live_...). ' +
        'A licence key must never appear in storefront JavaScript. ' +
        'Get a publishable key from Dashboard → Deployment → Shopify.');
    }
    return;
  }

  // --- begin inlined agents/shared/collector.js -------------------------------
  // Verbatim copy of the shared collector. SdkCollectorParityTest asserts this
  // block matches the shared source exactly — edit agents/shared/collector.js
  // and re-run `php artisan relintio:sync-collector`, never edit it here.
  // @@COLLECTOR_START@@
  // @@COLLECTOR_END@@
  // --- end inlined agents/shared/collector.js ---------------------------------

  var collector = window.RelintioCollector;
  var behaviour = collector && collector.watchBehaviour ? collector.watchBehaviour() : null;

  function challengeToken() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.get('up_token') || '';
    } catch (e) {
      return '';
    }
  }

  function markChallengePassed() {
    try {
      sessionStorage.setItem('rl_passed_until', String(Date.now() + 120000));
      var params = new URLSearchParams(window.location.search || '');
      params.delete('up_token');
      var next = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
      window.history.replaceState(null, document.title, next);
    } catch (e) {
      // Best-effort cleanup only
    }
  }

  function hasRecentPass() {
    try {
      var until = parseInt(sessionStorage.getItem('rl_passed_until') || '0', 10);
      return until > Date.now();
    } catch (e) {
      return false;
    }
  }

  function genRayId() {
    var hex = '0123456789abcdef', id = '';
    for (var i = 0; i < 16; i++) id += hex[Math.random() * 16 | 0];
    return id;
  }

  function decide() {
    var collected = collector
      ? collector.collect({ behaviour: behaviour })
      : Promise.resolve({ telemetry: {}, env: {} });

    collected.then(send).catch(function () {
      // A collector that failed must not cost the store its verdict — the
      // server still has the address, the headers and the path, and a shop
      // that only protects visitors whose browser cooperated protects nobody.
      send({ telemetry: {}, env: {} });
    });
  }

  function send(payload) {
    var body = {
      license_key: RL_KEY,
      domain: window.location.hostname,
      path: window.location.pathname,
      referrer: document.referrer || '',
      return_url: window.location.href,
      agent_kind: 'shopify',
      agent_version: RL_VERSION,
      up_token: challengeToken(),
      telemetry: payload.telemetry || {},
      env: payload.env || {}
    };

    var xhr = new XMLHttpRequest();
    xhr.open('POST', RL_API + '/agent/decision', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Agent-Version', RL_VERSION);
    xhr.timeout = 5000;

    xhr.onload = function () {
      try {
        var res = JSON.parse(xhr.responseText);
        var action = String((res && res.action) || '').toLowerCase();
        if (action === 'challenge') {
          showChallenge(res.challenge_url || '');
        } else if (action === 'block') {
          showBrandedBlock(res.reason || 'Security Policy', res.ip || '');
        } else if (action === 'allow' && body.up_token && res.reason_code === 'challenge_pass') {
          markChallengePassed();
        }
        // 'allow', 'slow', 'decoy' — no client-side action
      } catch (e) {
        // Fail open — never break the store
      }
    };

    xhr.onerror = function () { /* fail open */ };
    xhr.ontimeout = function () { /* fail open */ };

    xhr.send(JSON.stringify(body));
  }

  function showChallenge(url) {
    if (!url) return;
    window.location.href = url;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function showBrandedBlock(reason, ip) {
    var rayId = genRayId();
    var time = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    var safeReason = escapeHtml(reason);

    var overlay = document.createElement('div');
    overlay.id = 'ag-block-overlay';

    overlay.innerHTML =
      '<div style="position:fixed;inset:0;z-index:999999;background:#08080c;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">' +
        '<div style="position:fixed;inset:0;z-index:0">' +
          '<div style="position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 30% 20%,rgba(99,102,241,.08) 0%,transparent 60%),radial-gradient(ellipse at 70% 80%,rgba(244,63,94,.06) 0%,transparent 60%);animation:agdrift 20s ease-in-out infinite alternate"></div>' +
        '</div>' +
        '<div style="position:relative;z-index:1;max-width:520px;width:90%;background:rgba(15,15,20,.85);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:48px 40px;text-align:center;backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);box-shadow:0 25px 50px -12px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05)">' +
          '<div style="width:64px;height:64px;margin:0 auto 24px">' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;filter:drop-shadow(0 0 20px rgba(99,102,241,.3))">' +
              '<path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="url(#agg)" opacity=".15"/>' +
              '<path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke="url(#agg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
              '<path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
              '<defs><linearGradient id="agg" x1="3" y1="2" x2="21" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#818cf8"/><stop offset="1" stop-color="#f43f5e"/></linearGradient></defs>' +
            '</svg>' +
          '</div>' +
          '<h1 style="font-size:24px;font-weight:700;color:#fff;margin-bottom:8px;letter-spacing:-.02em">Access Denied</h1>' +
          '<p style="font-size:15px;color:#71717a;line-height:1.5;margin-bottom:32px">This request has been blocked by the site&#39;s security system.</p>' +
          '<div style="background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px 20px;text-align:left;font-family:\'SF Mono\',\'Cascadia Code\',\'Fira Code\',monospace;font-size:12px;color:#52525b">' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#71717a">Ray ID</span><span style="color:#a1a1aa">' + rayId + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid rgba(255,255,255,.04)"><span style="color:#71717a">Reason</span><span style="color:#a1a1aa;text-align:right;max-width:60%;word-break:break-all">' + safeReason + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid rgba(255,255,255,.04)"><span style="color:#71717a">Time</span><span style="color:#a1a1aa">' + time + '</span></div>' +
          '</div>' +
          '<p style="margin-top:32px;font-size:11px;color:#3f3f46">Protected by <a href="https://relintio.com" target="_blank" rel="noopener" style="color:#6366f1;text-decoration:none;font-weight:500">Relintio</a></p>' +
        '</div>' +
      '</div>';

    // Inject animation keyframes
    var style = document.createElement('style');
    style.textContent = '@keyframes agdrift{0%{transform:translate(0,0) rotate(0deg)}100%{transform:translate(30px,-20px) rotate(2deg)}}';
    document.head.appendChild(style);

    document.body.appendChild(overlay);
  }

  // Boot on DOMContentLoaded
  if (hasRecentPass()) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decide);
  } else {
    decide();
  }
})();
