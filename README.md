<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/relintio-logo-dark.svg">
    <img src="./assets/relintio-logo-light.svg" alt="Relintio" width="260">
  </picture>

  <h1>Relintio for Shopify</h1>

  <p>
    <a href="https://relintio.com/docs/shopify"><img alt="agent" src="https://img.shields.io/badge/storefront%20agent-2.0.0-efd420"></a>
    <a href="https://relintio.com/docs/api-reference"><img alt="telemetry" src="https://img.shields.io/badge/telemetry-v2-efd420"></a>
    <a href="https://relintio.com/licenses"><img alt="license" src="https://img.shields.io/badge/license-proprietary-efd420"></a>
  </p>

  <p><strong>The Relintio storefront agent for Shopify.</strong></p>
</div>

---

One ScriptTag, registered on your storefront through the Shopify Admin API. On each page load it collects the twelve visitor signal families, asks Relintio for a verdict on that one request, and acts on the answer: redirect to the hosted challenge, paint a block overlay, or do nothing at all. It carries a publishable key, so the file every visitor can read contains nothing worth stealing.

```html
<script src="https://relintio.com/agent/shopify/v1.js"
        data-rl-key="pk_live_..."
        data-rl-api="https://api.relintio.com/v1"
        defer></script>
```

That is the whole integration. Connecting the store from the dashboard registers the equivalent for you — you only write this by hand for the recovery install below.

## Installation

### From the Relintio dashboard

1. Go to **Dashboard → Deployment → Shopify**.
2. Enter your store domain, e.g. `mystore.myshopify.com`.
3. Approve the Shopify authorization prompt. Relintio needs `write_script_tags` and nothing else.
4. Relintio registers the ScriptTag and shows the connected storefront.
5. Open the public storefront once. That first page load is the first check-in — enter the storefront URL in Relintio and select **Verify target**.

The script Shopify loads for a connected store is served from a signed, per-store URL with the publishable key already substituted into it, so there is no key for you to paste and none to leak in a theme file.

### Recovery snippet

Not part of normal setup. Use it only when Relintio support confirms Shopify authorization cannot be completed for your store.

1. Request the recovery bundle from support; it contains a publishable key issued for your store.
2. In Shopify admin, go to **Online Store → Themes → Edit code**.
3. Create a snippet named `relintio.liquid` and paste the `<script>` tag above with your key in `data-rl-key`.
4. Include it in `theme.liquid` before `</head>`:
   ```liquid
   {% render 'relintio' %}
   ```

The keyless file at `/agent/shopify/v1.js` is one cacheable asset shared by every store, which is why the key travels as an attribute rather than in the URL.

## Configuration

The agent reads its two settings from the `<script>` element, then from the values the platform substituted at serve time; the key alone falls back to `window.Relintio` after that. First non-empty wins, and a value still carrying an unsubstituted `{{PLACEHOLDER}}` counts as empty.

| Attribute | Also accepted | Default | Meaning |
| --- | --- | --- | --- |
| `data-rl-key` | `data-ag-key`, `data-license-key`, `window.Relintio.publishableKey`, `window.Relintio.licenseKey` | — | Required. A `pk_live_…` key. |
| `data-rl-api` | `data-ag-api` | `https://api.relintio.com/v1` | Control-plane base. |

The older attribute names are still read so a theme snippet nobody has updated keeps working. They are not a way to supply a licence key: a key that does not begin `pk_` is refused on every one of these paths.

```js
window.Relintio = { publishableKey: 'pk_live_...' };
```

Everything else — protection mode, challenge availability, geo rules, IP allowlists, sensitivity — is set in the dashboard and applied server-side. There is nothing to tune in the storefront.

## Which key the ScriptTag carries

`data-rl-key` takes a **publishable key**. This file is public and cached for an hour at every layer between Relintio and your visitors, so whatever is in it is published. A publishable key holds exactly one scope, `decision:read`: it may ask Relintio for a verdict on a request. It cannot read your rules, write telemetry into the device reputation store, or cause a challenge pass to be issued. Revoking one and issuing another is instant and affects nothing else in your account.

Versions before 2.0.0 carried the **licence key** here. That key is the HMAC key for the challenge passport and for request signing, so anyone who viewed source on a storefront could mint themselves a pass through the WAF for that store. If a v1 snippet is still pasted into a theme file, replace it. The v2 agent will not send a licence key it is handed — it logs an error to the console and stops, because a security incident is not a configuration quirk to route around.

## What happens on a page load

1. **Nothing, in the wrong context.** The agent returns immediately in theme design mode, on any path under `/admin` or `/checkout`, and when a key or API base is missing. It never touches checkout.
2. **Nothing, just after a pass.** A visitor who passed a challenge in the last 120 seconds is skipped, tracked in `sessionStorage` as `rl_passed_until`.
3. **Collection.** The shared collector runs — spliced into this file from its single source at serve time, so the storefront and the challenge page can never compute different device identities for the same machine.
4. **Decision.** A single `POST /agent/decision` carrying the publishable key, the hostname, path, referrer, return URL, any `up_token` from the query string, and the telemetry. Five-second timeout.
5. **Action.** `challenge` redirects to the returned challenge URL. `block` paints a branded overlay with a reference ID. `allow` alongside a `up_token` and `reason_code: challenge_pass` records the pass and strips the token from the address bar. Everything else does nothing.

The response is a verdict — action, reason, risk score, IP — and not policy. `/agent/verify` answers with the rule set, the thresholds and the blocklists; that is fine for an agent on a customer's server and catastrophic for one in a visitor's tab, so the storefront agent is not permitted to call it. There is also no heartbeat call: a browser declaring itself online proves nothing when its key is public, so the platform reads liveness from the decisions this agent asks for.

## What it collects

The twelve visitor signal families described in `contracts/telemetry-v2.md`: user agent, screen and display, timezone and language, probed fonts, plugins, canvas, WebGL renderer, audio, network conditions, device and window environment, behavioural counters, and — read server-side from the request itself, never posted — the HTTP headers.

The families are chosen for independence rather than for entropy. A user agent is one string to edit; a user agent that has to agree with the platform, which has to agree with the GPU string, the installed fonts, the timezone and the `Accept-Language` header the request arrived with, is a much larger thing to fake, and it has to be faked identically every time.

Behavioural data is **counters only**: dwell time, and how many times the pointer moved, a key was pressed, the page scrolled, or the screen was touched. Not what was typed. Not where the pointer went. Nothing that could reconstruct a customer's session, and nothing that touches order or payment data — the agent reads none of it.

Collection never blocks the page. Every probe is wrapped so a throw yields a missing family rather than a broken storefront, and a collector that fails entirely still lets the request through to a verdict, since the server still has the address, the headers and the path.

## Verdicts

The score is computed on the server from what the browser sent and what the request itself revealed, then compared against thresholds set by the store's sensitivity:

| Sensitivity | Challenge at | Block at |
| --- | --- | --- |
| High | 50 | 75 |
| Medium (default) | 60 | 85 |
| Low | 75 | 95 |

Whitelisted addresses and a valid challenge pass short-circuit to `allow` before any of it runs. A verdict of `challenge` is never sent to a store whose plan does not include the bot challenge or whose merchant has turned it off — a storefront with challenges disabled should not be redirecting shoppers into one. What it becomes instead is the **Challenge fallback** setting in the dashboard, which defaults to `block`. Set it to `allow` if you would rather log that traffic and let it through.

## Fail-open, everywhere

If the decision call errors, times out, or returns something unparseable, the page proceeds. If the collector throws, the page proceeds. If Relintio is unreachable entirely, the store behaves exactly as it did before installation. A checkout broken by a security agent costs more than any bot it could have stopped, so every failure path here ends in the visitor getting the page.

Start at low sensitivity, watch a day of real traffic in the dashboard, and tighten from there. If real shoppers are being bounced, turn the challenge off and set **Challenge fallback** to `allow`: a verdict that would have challenged becomes an allow and is still logged, so you keep the signal while you work out which rule is wrong. Turning the challenge off on its own is not the softer setting — on the default fallback those visitors are blocked instead.

## Uninstallation

Disconnect the store in the Relintio dashboard. That deletes the ScriptTag through the Admin API and drops the connection. If Shopify cannot be reached, the connection is kept rather than silently half-removed, so retry rather than assuming it is gone. Removing the app from **Shopify Admin → Apps → Relintio** takes the ScriptTag with it, but nothing tells Relintio it happened: the store still counts as connected, and connecting it again is refused until you disconnect it in the dashboard.

The agent never modifies your theme, products or checkout flow, so removal leaves nothing behind. If you installed the recovery snippet by hand, delete `relintio.liquid` and its `{% render %}` line.

## Upgrading from 1.x

The ScriptTag URL is unchanged and connected stores need no action — the platform substitutes a publishable key where it used to substitute the licence key. Two things changed underneath: calls go to `/agent/decision` instead of `/agent/verify`, and the heartbeat call is gone with nothing replacing it.

If you have a hand-pasted v1 snippet, swap the licence key for a publishable one. Until you do, that storefront is unprotected: the agent refuses to start rather than transmit the key.

## Links

- [Documentation](https://relintio.com/docs)
- [Shopify integration guide](https://relintio.com/docs/shopify)
- [API reference](https://relintio.com/docs/api-reference)
- [Licenses](https://relintio.com/licenses)
