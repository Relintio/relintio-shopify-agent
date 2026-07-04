<?php
/**
 * Relintio – Shopify ScriptTag Agent
 *
 * This file is the server-side companion for the Shopify integration.
 * It generates the JavaScript ScriptTag payload that Shopify injects
 * into the storefront. The script sends a verify request to the
 * Relintio cloud on each page load.
 *
 * Deployment: installed via the Relintio dashboard (Console → Deployment → Shopify).
 * The platform registers the ScriptTag via the Shopify Admin API on your behalf.
 */

if (!defined('RELINTIO_SHOPIFY_VERSION')) {
    define('RELINTIO_SHOPIFY_VERSION', '1.1.1');
}

/**
 * Configuration — injected at download time by the platform.
 */
return [
    'version'     => RELINTIO_SHOPIFY_VERSION,
    'api_url'     => '{{API_URL}}',
    'license_key' => '{{LICENSE_KEY}}',
    'shop_domain' => '{{SHOP_DOMAIN}}',
];
