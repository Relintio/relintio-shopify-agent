/**
 * AuraGuardian – Shopify ScriptTag Agent v1.0.0
 *
 * Injected into the storefront via Shopify ScriptTag API.
 * Performs client-side fingerprinting and sends a verify request
 * to the AuraGuardian cloud. If the visitor is flagged, it triggers
 * the challenge flow or silent block.
 *
 * This file is served from the AuraGuardian platform and registered
 * automatically when the merchant installs the app.
 */
(function () {
  'use strict';

  var AG_VERSION = '1.0.0';
  var AG_API     = '{{API_URL}}';
  var AG_KEY     = '{{LICENSE_KEY}}';

  // Abort in admin/checkout contexts
  if (window.Shopify && window.Shopify.designMode) return;

  function getFingerprint() {
    var nav = window.navigator || {};
    return {
      ua:       nav.userAgent || '',
      lang:     nav.language || '',
      platform: nav.platform || '',
      screen:   (screen.width || 0) + 'x' + (screen.height || 0),
      tz:       Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      touch:    'ontouchstart' in window ? 1 : 0,
      cookies:  navigator.cookieEnabled ? 1 : 0,
    };
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
      agent_type:  'shopify',
      agent_version: AG_VERSION,
    };

    var xhr = new XMLHttpRequest();
    xhr.open('POST', AG_API + '/verify', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Agent-Version', AG_VERSION);
    xhr.timeout = 5000;

    xhr.onload = function () {
      try {
        var res = JSON.parse(xhr.responseText);
        if (res && res.action === 'challenge') {
          showChallenge(res.challenge_url || '');
        } else if (res && res.action === 'block') {
          // Silent block — do not disrupt the storefront
          console.warn('[AuraGuardian] Request blocked.');
        }
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
    var overlay = document.createElement('div');
    overlay.id = 'ag-challenge-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
    var iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = 'width:420px;height:320px;border:none;border-radius:12px;';
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    window.addEventListener('message', function handler(e) {
      if (e.data === 'ag-challenge-passed') {
        overlay.remove();
        window.removeEventListener('message', handler);
      }
    });
  }

  // Boot on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', verify);
  } else {
    verify();
  }
})();
