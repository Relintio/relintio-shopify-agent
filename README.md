# Relintio – Shopify Agent v1.1.1

> **Note on Features & Quotas**: Advanced features (like Bot Challenge and Custom Shield Pages) are tied to your subscription plan. If you exceed your monthly API quota, the agent will operate in a degraded mode (basic protection) before ultimately failing-open to prevent locking you out of your own site. All configuration rules are centrally managed via the dashboard.

## Overview

The Relintio Shopify app protects your storefront from automated abuse, credential stuffing, and bot traffic using client-side fingerprinting and cloud-based threat intelligence.

The generated ScriptTag uses the canonical control-plane base `https://api.relintio.com/v1`. Existing installations on `https://relintio.com/api` remain compatible, but new deployments must use the canonical base.

## Risk-Scoring Engine

Every request is evaluated by an **additive 0–100 risk-scoring engine**. Signals are scored independently and summed:

| Signal            | Points | Rationale                          |
|-------------------|--------|------------------------------------|
| Empty/missing UA  | +40    | No legitimate browser omits UA     |
| Headless UA hint  | +25    | Puppeteer, PhantomJS, Playwright   |
| Missing Accept-*  | +15    | Real browsers always send Accept   |
| POST without Referer | +20 | Form spam / API abuse pattern      |
| Rate burst (>24/sec)| +35  | Automated scanning / DDoS          |

## 5-Tier Graduated Response

The cloud decision engine maps the cumulative score to a response tier:

| Tier        | Score Range | Action                                    |
|-------------|-------------|-------------------------------------------|
| **ALLOW**   | 0 – 39      | Request proceeds normally                 |
| **SLOW**    | 40 – 59     | 2-second artificial delay                 |
| **CHALLENGE** | 60 – 74   | Hosted security challenge redirect        |
| **DECOY**   | 75 – 84     | Serve fake/scrambled content              |
| **BLOCK**   | 85 – 100    | Branded storefront block overlay          |

## How It Works

1. **ScriptTag injection** — Relintio registers a lightweight JavaScript agent (`relintio-agent.js`) via the Shopify ScriptTag API.
2. **Fingerprinting** — On each page load, the agent collects browser signals (UA, timezone, screen, touch, etc.) and sends a verify request to the Relintio cloud.
3. **Decision** — The cloud responds with the appropriate tier action.
4. **Fail-open** — If the cloud is unreachable, the store operates normally. The agent never breaks checkout or storefront functionality.

## Installation

### From the Relintio Dashboard

1. Go to **Dashboard → Deployment → Shopify**
2. Enter your Shopify store domain (e.g. `mystore.myshopify.com`)
3. Authenticate via Shopify OAuth
4. Relintio registers the ScriptTag and shows the connected storefront

### Support Recovery Package

This is not part of normal setup. Use it only when Relintio support confirms that Shopify authorization cannot be completed:

1. Request the recovery bundle from Relintio support
2. In your Shopify admin, go to **Online Store → Themes → Edit Code**
3. Create a new snippet called `relintio.liquid`
4. Paste the provided code
5. Include it in `theme.liquid` before `</head>`:
   ```liquid
   {% render 'relintio' %}
   ```

## Configuration

All configuration is managed from the Relintio dashboard:

| Setting | Description |
|---------|-------------|
| **Protection Mode** | `observe` (log only) or `enforce` (active blocking) |
| **Challenge Type** | JavaScript challenge or visual CAPTCHA |
| **Excluded Paths** | Paths to skip (e.g. `/admin`, `/checkout`) |
| **Rate Limits** | Token-bucket: 8 tokens/sec, 24 burst capacity |

## Uninstallation

1. Go to **Shopify Admin → Apps → Relintio → Remove**
2. Or remove the ScriptTag via the Relintio dashboard

The agent never modifies your theme files, products, or checkout flow. Removal is instant and complete.

## Dashboard Deployment Workflow

1. Open **Dashboard → Deployment**, select **Shopify**, and enter the `.myshopify.com` store domain.
2. Select **Connect Shopify store** and approve the Shopify authorization prompt.
3. Relintio registers the ScriptTag; open the public storefront once to produce the first check-in.
4. Enter the public storefront URL in Relintio and select **Verify target**.

There is no installation-mode choice in normal setup. The storefront agent reports runtime kind `shopify`, and policy changes synchronize through the connected Relintio integration.
