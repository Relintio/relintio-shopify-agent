/**
 * Relintio – Shopify ScriptTag Agent v1.1.1
 *
 * Injected into the storefront via Shopify ScriptTag API.
 * Performs client-side fingerprinting and sends a verify request
 * to the Relintio cloud. If the visitor is flagged, it triggers
 * the challenge flow or branded block overlay.
 *
 * This file is served from the Relintio platform and registered
 * automatically when the merchant installs the app.
 */
(function () {
  'use strict';

  var AG_VERSION = '1.1.1';
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1] || null;
  })();

  function cleanConfig(value) {
    value = value == null ? '' : String(value).trim();
    if (!value || /\{\{[^}]+\}\}/.test(value)) return '';
    return value;
  }

  function scriptOrigin() {
    try {
      if (script && script.src) return new URL(script.src, window.location.href).origin;
    } catch (e) {}
    return window.location.origin;
  }

  var AG_API = cleanConfig(script && script.getAttribute('data-ag-api')) ||
    cleanConfig('{{API_URL}}') ||
    (scriptOrigin().replace(/\/$/, '') + '/api');

  var AG_KEY = cleanConfig(script && (script.getAttribute('data-ag-key') || script.getAttribute('data-license-key'))) ||
    cleanConfig('{{LICENSE_KEY}}') ||
    cleanConfig(window.Relintio && window.Relintio.licenseKey);

  // Abort in admin/checkout/design-mode contexts
  if (window.Shopify && window.Shopify.designMode) return;
  if (/\/(admin|checkout)(\/|$)/i.test(window.location.pathname)) return;
  if (!AG_API || !AG_KEY) return;

  function consumeChallengeToken() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var token = params.get('up_token');
      if (!token) return false;
      if (!isPlausibleChallengeToken(token)) return false;

      sessionStorage.setItem('ag_passed_until', String(Date.now() + 120000));
      params.delete('up_token');
      var next = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
      window.history.replaceState(null, document.title, next);
      return true;
    } catch (e) {
      return false;
    }
  }

  function isPlausibleChallengeToken(token) {
    try {
      var decoded = atob(String(token).replace(/-/g, '+').replace(/_/g, '/'));
      var parts = decoded.split('::');
      if (parts.length !== 2 || !/^\d{10,}$/.test(parts[0]) || !/^[a-f0-9]{64}$/i.test(parts[1])) return false;
      var ts = parseInt(parts[0], 10) * 1000;
      var now = Date.now();
      return ts > now - 10 * 60 * 1000 && ts < now + 60 * 1000;
    } catch (e) {
      return false;
    }
  }

  function hasRecentPass() {
    try {
      var until = parseInt(sessionStorage.getItem('ag_passed_until') || '0', 10);
      return until > Date.now();
    } catch (e) {
      return false;
    }
  }

  function getFingerprint() {
    var nav = window.navigator || {};
    var fp = {
      ua:       nav.userAgent || '',
      lang:     nav.language || '',
      platform: nav.platform || '',
      screen:   (screen.width || 0) + 'x' + (screen.height || 0),
      tz:       '',
      touch:    'ontouchstart' in window ? 1 : 0,
      cookies:  navigator.cookieEnabled ? 1 : 0,
      dpr:      window.devicePixelRatio || 1,
      webgl:    0,
      webdriver: nav.webdriver ? 1 : 0,
    };
    try { fp.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e) {}
    try {
      var c = document.createElement('canvas');
      fp.webgl = !!(c.getContext('webgl') || c.getContext('experimental-webgl')) ? 1 : 0;
    } catch(e) {}
    return fp;
  }

  function genRayId() {
    var hex = '0123456789abcdef', id = '';
    for (var i = 0; i < 16; i++) id += hex[Math.random() * 16 | 0];
    return id;
  }

  function verify() {
    var fp = getFingerprint();
    var payload = {
      license_key: AG_KEY,
      domain:      window.location.hostname,
      path:        window.location.pathname,
      ip:          '',  // resolved server-side
      user_agent:  fp.ua,
      fingerprint: fp,
      referrer:    document.referrer || '',
      return_url:  window.location.href,
      agent_kind:  'shopify',
      agent_type:  'shopify',
      agent_version: AG_VERSION,
    };

    var xhr = new XMLHttpRequest();
    xhr.open('POST', AG_API + '/agent/verify', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Agent-Version', AG_VERSION);
    xhr.timeout = 5000;

    xhr.onload = function () {
      try {
        var res = JSON.parse(xhr.responseText);
        var action = String((res && res.action) || '').toLowerCase();
        if (action === 'challenge') {
          showChallenge(res.challenge_url || '');
        } else if (action === 'block') {
          showBrandedBlock(res.reason || 'Security Policy', res.ip || '');
        }
        // 'allow', 'slow', 'decoy' — no client-side action
      } catch (e) {
        // Fail open — never break the store
      }
    };

    xhr.onerror = function () { /* fail open */ };
    xhr.ontimeout = function () { /* fail open */ };

    xhr.send(JSON.stringify(payload));
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

  /**
   * Non-blocking heartbeat ping (async fetch, fire-and-forget).
   * Throttled to once every 5 minutes via sessionStorage.
   * Network failures are silently swallowed via .catch().
   */
  function sendHeartbeat() {
    try {
      var HB_KEY = 'ag_hb_ts';
      var now = Date.now();
      var last = parseInt(sessionStorage.getItem(HB_KEY) || '0', 10);
      if ((now - last) < 300000) return; // 5-minute throttle
      sessionStorage.setItem(HB_KEY, String(now));

      // Fire-and-forget — no await, .catch() for silent failure
      fetch(AG_API + '/agent/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: AG_KEY,
          domain: window.location.hostname,
          agent_version: AG_VERSION,
          timestamp: Math.floor(now / 1000)
        }),
        keepalive: true // survives page unload
      }).catch(function () {});
    } catch (e) {
      // Best-effort — never break the store
    }
  }

  // Boot on DOMContentLoaded
  if (consumeChallengeToken() || hasRecentPass()) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { verify(); sendHeartbeat(); });
  } else {
    verify();
    sendHeartbeat();
  }
})();
