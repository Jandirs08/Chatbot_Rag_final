# CSP Nonce Migration Plan

## Status

**Pending** — current CSP uses `script-src 'self' 'unsafe-inline'` because Next.js 14 emits inline hydration scripts (e.g., `__NEXT_DATA__`, server-injected hydration markers).

`'unsafe-inline'` defeats the primary defense CSP offers against XSS. This document outlines the migration to per-request nonces.

## Goal

Replace `'unsafe-inline'` in `script-src` with `'nonce-{random}'` so that only Next.js-emitted scripts (which we tag) execute, and any injected inline `<script>` is blocked.

## Approach

### 1. Move CSP from `next.config.js` to middleware

`next.config.js` `headers()` runs at build time and cannot generate a per-request value. Middleware runs per request and can inject a fresh nonce.

In `middleware.ts`:

```ts
const nonce = crypto.randomUUID().replace(/-/g, "");
const csp = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ...`;

const requestHeaders = new Headers(req.headers);
requestHeaders.set("x-nonce", nonce);

const response = NextResponse.next({ request: { headers: requestHeaders } });
response.headers.set("Content-Security-Policy", csp);
return response;
```

### 2. Forward nonce to Next.js script tags

In the root layout:

```tsx
import { headers } from "next/headers";

export default function RootLayout({ children }) {
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

Next.js 14 **automatically picks up the `x-nonce` header** and adds `nonce={nonce}` to its inline scripts. Reference: [next.js#documentation/csp](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy).

### 3. Use `'strict-dynamic'`

Pair the nonce with `'strict-dynamic'` so trusted scripts can dynamically load other scripts without each one needing its own nonce. This is the modern CSP3 pattern and is broadly supported.

### 4. Audit third-party scripts

The current widget embed flow may inject scripts. Before flipping the switch:

- Inventory every `<script>` tag in `app/` (including `<Script>` from `next/script`)
- Confirm all use `nonce={nonce}` or are loaded from `'self'` via `strict-dynamic`
- Test the widget loader (`/widget-loader.js`) — it runs in third-party origins and the nonce flow does **not** apply there. Keep `/chat` route's existing CSP for embed pages.

### 5. Style-src

Tailwind injects styles inline at build time; runtime inline styles come from React (`style={{...}}`) and Radix. Replacing `style-src 'unsafe-inline'` with nonces is harder. Two options:

- Keep `'unsafe-inline'` for `style-src` only (lower risk than scripts) — pragmatic, common
- Migrate to `style-src 'self' 'nonce-{n}'` and add `nonce={nonce}` to every server-rendered inline `<style>` — purist, more work

Recommend keeping inline styles for now and only nonce-ing scripts.

## Affected files

- `frontend/middleware.ts` — generate nonce, set CSP header per request
- `frontend/next.config.js` — remove CSP from `headers()` for routes covered by middleware (keep `/chat` CSP if widget embed needs it)
- `frontend/app/layout.tsx` — read nonce header, pass to children if needed
- Any `next/script` usages — pass `nonce` prop

## Risks

- Caching: pages with nonces cannot be cached at the CDN level by HTML body. Use `Cache-Control: private, no-store` on HTML responses or rotate nonce in middleware.
- SSR static export: incompatible with per-request nonces. This project uses Next.js dynamic rendering so it's fine.
- Forgotten inline scripts will break silently — test thoroughly in staging.

## Acceptance criteria

- [ ] CSP header has `script-src 'self' 'nonce-{random}' 'strict-dynamic'` (no `'unsafe-inline'`)
- [ ] Production app loads cleanly with no CSP violations in browser console
- [ ] Login, chat, dashboard, admin all functional
- [ ] Widget embed still works on whitelisted hosts
- [ ] CSP report-only header tested for one week before switch to enforce

## Recommended rollout

1. Implement nonce generation in middleware behind feature flag
2. Send `Content-Security-Policy-Report-Only` first — collect violations
3. Fix violations
4. Switch to enforcing `Content-Security-Policy`
5. Remove `'unsafe-inline'` comment in `next.config.js`
