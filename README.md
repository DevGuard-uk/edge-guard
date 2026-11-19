# @devguard-uk/edge-guard

> **DevGuard Edge Guard** for Cloudflare Workers, Cloudflare Pages, Vercel Edge Middleware, Deno, Bun, and Web Standards Fetch runtimes.

Enforce milestone payment locks, project licensing, and authorized hostnames directly at the **network edge** before traffic ever reaches your origin server (Shopify, WordPress, Webflow, Node, Laravel, Django, Ruby on Rails, or Go).

---

## Why Edge Enforcement?

Traditional server-side middleware runs directly on your client or client's host server. If a client revokes SSH or cPanel access prior to paying a final milestone, origin-based guards can be neutralized. 

Because agencies typically control or retain DNS delegation through Cloudflare or Vercel during development, **Edge Guard** sits between the client browser and the origin web server:
- **Unbypassable by Origin**: Runs at Cloudflare / Vercel Edge; cannot be removed by altering origin files.
- **Sub-10ms In-Memory Caching**: Status queries are cached locally in edge memory with a configurable TTL (default: 60s).
- **SEO-Preserving Lockout**: Emits standard HTTP `503 Service Unavailable`, `Retry-After: 3600`, and `X-Robots-Tag: noindex, nofollow, noarchive` so search engine rankings are preserved.
- **Fail-Safe Open Resiliency**: If the DevGuard API is unreachable or times out, it defaults to failing open so customer traffic is never disrupted.
- **Domain Locking**: Enforces hostname allowlists including exact domains and wildcards (`*.example.com`).

---

## Installation

```bash
npm install @devguard-uk/edge-guard
```

---

## Integration Examples

### 1. Cloudflare Workers

Create your worker (`worker.js`):

```javascript
import { createEdgeGuard } from '@devguard-uk/edge-guard';

let guard;

export default {
  async fetch(request, env, ctx) {
    if (!guard) {
      guard = createEdgeGuard({
        projectId: env.DEVGUARD_PROJECT_ID,
        apiKey: env.DEVGUARD_API_KEY,
        apiUrl: env.DEVGUARD_API_URL || 'https://api.devguard.uk',
        allowedDomains: ['example.com', '*.example.com', 'localhost'],
        failSafe: 'open',
        cacheTtlMs: 60000,
      });
    }

    return guard.handleRequest(request, async (req) => {
      // Forward the request to your origin web server
      return fetch(req);
    });
  },
};
```

### 2. Next.js / Vercel Edge Middleware

In `middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createEdgeGuard } from '@devguard-uk/edge-guard';

const guard = createEdgeGuard({
  projectId: process.env.DEVGUARD_PROJECT_ID!,
  apiKey: process.env.DEVGUARD_API_KEY,
  allowedDomains: ['myagency-staging.com', '*.myagency-staging.com'],
  failSafe: 'open',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(request: NextRequest) {
  return guard.handleRequest(request, async () => {
    return NextResponse.next();
  });
}
```

---

## Configuration Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `projectId` | `string` | **Required** | Your DevGuard project UUID / identifier. |
| `apiKey` | `string` | `""` | Optional DevGuard secret API key or public token. |
| `apiUrl` | `string` | `"https://api.devguard.uk"` | DevGuard API gateway endpoint. |
| `failSafe` | `"open" \| "closed"` | `"open"` | Behavior if DevGuard API is unreachable or times out. |
| `timeoutMs` | `number` | `2500` | Fetch timeout for status checks in milliseconds. |
| `cacheTtlMs` | `number` | `60000` | In-memory cache TTL in milliseconds (60 seconds). |
| `allowedDomains` | `string[]` | `[]` | Allowed domain list. Supports exact domains and wildcards (`*.example.com`). Empty permits all. |
| `bypassPaths` | `string[]` | `["/favicon.ico", "/robots.txt", "/_devguard/health"]` | Exact or prefix paths exempt from lock checks. |
| `customLockHtml` | `string` | `undefined` | Custom HTML markup for the lock page. |

---

## Status Handled

- **`active`** / **`warning`**: Passes through to `next(request)`.
- **`locked`** / **`autolocked`** / **`payment_past_due`**: Returns HTTP `503 Service Unavailable` with lock screen.
- **Unauthorized Domain**: Returns HTTP `403 Forbidden` with header `X-DevGuard-Status: domain_unauthorized`.

---

## License

MIT © DevGuard
