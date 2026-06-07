# AuraGuardian – Shopify Agent v1.1.1

## Overview

The AuraGuardian Shopify app protects your storefront from automated abuse, credential stuffing, and bot traffic using client-side fingerprinting and cloud-based threat intelligence.

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

1. **ScriptTag injection** — AuraGuardian registers a lightweight JavaScript agent (`auraguardian-agent.js`) via the Shopify ScriptTag API.
2. **Fingerprinting** — On each page load, the agent collects browser signals (UA, timezone, screen, touch, etc.) and sends a verify request to the AuraGuardian cloud.
3. **Decision** — The cloud responds with the appropriate tier action.
4. **Fail-open** — If the cloud is unreachable, the store operates normally. The agent never breaks checkout or storefront functionality.

## Installation

### From the AuraGuardian Dashboard

1. Go to **Console → Deployment → Shopify**
2. Enter your Shopify store domain (e.g. `mystore.myshopify.com`)
3. Authenticate via Shopify OAuth
4. The platform automatically registers the ScriptTag

### Manual Installation (Theme Snippet)

If you prefer manual control:

1. Download the agent bundle from Console → Deployment → Shopify
2. In your Shopify admin, go to **Online Store → Themes → Edit Code**
3. Create a new snippet called `auraguardian.liquid`
4. Paste the provided code
5. Include it in `theme.liquid` before `</head>`:
   ```liquid
   {% render 'auraguardian' %}
   ```

## Configuration

All configuration is managed from the AuraGuardian dashboard:

| Setting | Description |
|---------|-------------|
| **Protection Mode** | `observe` (log only) or `enforce` (active blocking) |
| **Challenge Type** | JavaScript challenge or visual CAPTCHA |
| **Excluded Paths** | Paths to skip (e.g. `/admin`, `/checkout`) |
| **Rate Limits** | Token-bucket: 8 tokens/sec, 24 burst capacity |

## Uninstallation

1. Go to **Shopify Admin → Apps → AuraGuardian → Remove**
2. Or remove the ScriptTag via the AuraGuardian dashboard

The agent never modifies your theme files, products, or checkout flow. Removal is instant and complete.
