/**
 * @devguard-uk/edge-guard
 *
 * DevGuard Edge Guard for Cloudflare Workers, Vercel Edge, Deno, and Web Standards Fetch runtimes.
 * Enforces project licensing, milestone locks, and authorized domain matching at the network edge.
 *
 * 100% Pure Web Standards (Request, Response, URL, Headers, Fetch API).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.DevGuardEdgeGuard = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_BYPASS_PATHS = Object.freeze([
    '/favicon.ico',
    '/robots.txt',
    '/_devguard/health',
  ]);

  const DEFAULT_API_URL = 'https://api.devguard.uk';
  const DEFAULT_TIMEOUT_MS = 2500;
  const DEFAULT_CACHE_TTL_MS = 60000;

  /**
   * Normalizes a hostname or domain string:
   * - Strips leading/trailing whitespace
   * - Converts to lower-case
   * - Strips ports (including IPv6 [::1]:port notation)
   * - Removes trailing FQDN dot (e.g. 'example.com.' -> 'example.com')
   * - Rejects header injection characters (CRLF, slashes, URI components, '@')
   *
   * @param {string|unknown} rawHost
   * @returns {string} Normalized hostname, or '' if invalid/empty
   */
  function normalizeHost(rawHost) {
    if (rawHost == null) return '';
    let str = String(rawHost).trim().toLowerCase();
    if (!str) return '';

    // Reject invalid / spoofed characters
    if (/[\r\n\0/\s\\?#@]/.test(str)) {
      return '';
    }

    // Handle IPv6 bracket notation [::1]:8080
    if (str.startsWith('[')) {
      const endBracket = str.indexOf(']');
      if (endBracket !== -1) {
        return str.slice(1, endBracket);
      }
    }

    // Strip port if present
    const colonIdx = str.indexOf(':');
    if (colonIdx !== -1) {
      str = str.slice(0, colonIdx);
    }

    // Strip trailing dot
    if (str.endsWith('.')) {
      str = str.slice(0, -1);
    }

    return str;
  }

  /**
   * Checks whether a given request host is permitted under the allowedDomains list.
   *
   * Rules:
   * 1. If allowedDomains is empty or undefined, access is permitted (domain lock disabled).
   * 2. Wildcard rule `*.example.com` matches `example.com` and `sub.example.com` or `a.b.example.com`.
   * 3. Wildcard rule NEVER matches suffix collisions like `example.com.evil.io` or `fakeexample.com`.
   * 4. Exact domain rules match normalized host strictly.
   * 5. Ports are ignored during matching (e.g. `example.com:3000` matches `example.com`).
   * 6. Supports 'localhost', '127.0.0.1', '::1'.
   *
   * @param {string} host Incoming host from request
   * @param {string[]|string|null|undefined} allowedDomains Allowed domains list
   * @returns {boolean}
   */
  function matchDomain(host, allowedDomains) {
    if (!allowedDomains) return true;

    let list = [];
    if (Array.isArray(allowedDomains)) {
      list = allowedDomains;
    } else if (typeof allowedDomains === 'string') {
      list = allowedDomains.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    if (list.length === 0) return true;

    const target = normalizeHost(host);
    if (!target) return false;

    for (const rawPattern of list) {
      if (!rawPattern || typeof rawPattern !== 'string') continue;
      const pat = rawPattern.trim().toLowerCase();
      if (!pat) continue;

      if (pat === '*') return true;

      // Wildcard matching e.g. *.example.com
      if (pat.startsWith('*.')) {
        const baseDomain = normalizeHost(pat.slice(2));
        if (!baseDomain) continue;

        // Exact match with root domain (e.g. example.com matches *.example.com)
        if (target === baseDomain) return true;

        // Subdomain match (must strictly have a dot separator)
        if (target.endsWith('.' + baseDomain)) {
          return true;
        }
        continue;
      }

      // Exact match
      const normalizedPattern = normalizeHost(pat);
      if (normalizedPattern && target === normalizedPattern) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generates an SEO-safe HTML lock page with noindex headers and responsive styling.
   *
   * @param {string} projectId DevGuard project identifier
   * @param {object} [options]
   * @returns {string} Safe HTML document
   */
  function getLockHtml(projectId, options) {
    options = options || {};
    const title = options.title || 'Service Temporarily Unavailable';
    const message = options.message ||
      'This application is temporarily unavailable due to administrative service suspension. Please contact support or check back later.';
    const appName = options.appName || ('DevGuard Protected Application (' + String(projectId || 'Edge') + ')');
    const retryAfter = Number(options.retryAfter) || 3600;

    return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="utf-8" />\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
'  <meta name="robots" content="noindex, nofollow, noarchive" />\n' +
'  <meta http-equiv="refresh" content="' + retryAfter + '" />\n' +
'  <title>' + escapeHtml(title) + '</title>\n' +
'  <style>\n' +
'    :root {\n' +
'      --bg: #090d16;\n' +
'      --card-bg: #111726;\n' +
'      --border: #1f293d;\n' +
'      --text-main: #f8fafc;\n' +
'      --text-muted: #94a3b8;\n' +
'      --accent: #ef4444;\n' +
'      --accent-glow: rgba(239, 68, 68, 0.15);\n' +
'    }\n' +
'    * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'    body {\n' +
'      background: radial-gradient(circle at 50% 20%, #151e33 0%, var(--bg) 100%);\n' +
'      color: var(--text-main);\n' +
'      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\n' +
'      min-height: 100vh;\n' +
'      display: flex;\n' +
'      align-items: center;\n' +
'      justify-content: center;\n' +
'      padding: 1.5rem;\n' +
'    }\n' +
'    .dg-container {\n' +
'      max-width: 540px;\n' +
'      width: 100%;\n' +
'      background: var(--card-bg);\n' +
'      border: 1px solid var(--border);\n' +
'      border-radius: 1rem;\n' +
'      padding: 2.5rem 2rem;\n' +
'      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 40px var(--accent-glow);\n' +
'      text-align: center;\n' +
'    }\n' +
'    .dg-badge {\n' +
'      display: inline-flex;\n' +
'      align-items: center;\n' +
'      gap: 0.5rem;\n' +
'      background: rgba(239, 68, 68, 0.12);\n' +
'      color: var(--accent);\n' +
'      border: 1px solid rgba(239, 68, 68, 0.25);\n' +
'      font-size: 0.75rem;\n' +
'      font-weight: 600;\n' +
'      letter-spacing: 0.05em;\n' +
'      text-transform: uppercase;\n' +
'      padding: 0.35rem 0.75rem;\n' +
'      border-radius: 9999px;\n' +
'      margin-bottom: 1.25rem;\n' +
'    }\n' +
'    .dg-badge::before {\n' +
'      content: "";\n' +
'      width: 6px;\n' +
'      height: 6px;\n' +
'      background: var(--accent);\n' +
'      border-radius: 50%;\n' +
'      box-shadow: 0 0 6px var(--accent);\n' +
'    }\n' +
'    h1 {\n' +
'      font-size: 1.5rem;\n' +
'      font-weight: 700;\n' +
'      line-height: 1.25;\n' +
'      margin-bottom: 0.75rem;\n' +
'      color: var(--text-main);\n' +
'    }\n' +
'    p {\n' +
'      color: var(--text-muted);\n' +
'      font-size: 0.95rem;\n' +
'      line-height: 1.6;\n' +
'      margin-bottom: 1.75rem;\n' +
'    }\n' +
'    .dg-footer {\n' +
'      margin-top: 2rem;\n' +
'      font-size: 0.75rem;\n' +
'      color: #64748b;\n' +
'      border-top: 1px solid var(--border);\n' +
'      padding-top: 1rem;\n' +
'    }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <div class="dg-container">\n' +
'    <div class="dg-badge">HTTP 503 · Service Locked</div>\n' +
'    <h1>' + escapeHtml(title) + '</h1>\n' +
'    <p>' + escapeHtml(message) + '</p>\n' +
'    <div class="dg-footer">\n' +
'      Secured by DevGuard Protection Framework · ' + escapeHtml(appName) + '\n' +
'    </div>\n' +
'  </div>\n' +
'</body>\n' +
'</html>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Builds the RFC-compliant 503 Lock Response using standard Web Response.
   */
  function createLockResponse(projectId, options) {
    options = options || {};
    const html = options.customLockHtml || getLockHtml(projectId, options);
    const retryAfter = String(Number(options.retryAfter) || 3600);

    return new Response(html, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Retry-After': retryAfter,
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'X-DevGuard-Status': 'locked',
        'X-DevGuard-Project': projectId,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  }

  /**
   * Builds the 403 Forbidden Response for unauthorized hostnames.
   */
  function createUnauthorizedDomainResponse(projectId, host) {
    return new Response('403 Forbidden: Host domain not authorized by DevGuard', {
      status: 403,
      statusText: 'Forbidden',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-DevGuard-Status': 'domain_unauthorized',
        'X-DevGuard-Project': projectId,
      },
    });
  }

  /**
   * Factory creating an edge guard instance for Cloudflare Workers / Vercel Edge.
   *
   * @param {object} config
   * @param {string} config.projectId DevGuard project UUID/id
   * @param {string} [config.sdkKey] Project SDK key (preferred; dg_sdk_*)
   * @param {string} [config.apiKey] Legacy API / Master Secret (fallback)
   * @param {string} [config.apiUrl="https://api.devguard.uk"] API endpoint
   * @param {"open"|"closed"} [config.failSafe="open"] Fail safe policy
   * @param {number} [config.timeoutMs=2500] API timeout in ms
   * @param {number} [config.cacheTtlMs=60000] In-memory cache duration in ms
   * @param {string[]} [config.allowedDomains=[]] Authorized domains list
   * @param {string[]} [config.bypassPaths=["/favicon.ico", "/robots.txt", "/_devguard/health"]] Paths bypassing guard
   * @param {string} [config.customLockHtml] Optional custom lock screen markup
   * @param {Function} [config.fetchFn] Optional custom fetch implementation
   */
  function createEdgeGuard(config) {
    if (!config || !config.projectId || typeof config.projectId !== 'string') {
      throw new Error('DevGuard Edge: config.projectId is required and must be a string');
    }

    const resolvedKey = (
      (typeof config.sdkKey === 'string' && config.sdkKey.trim()) ||
      (typeof config.apiKey === 'string' && config.apiKey.trim()) ||
      ''
    );

    const cfg = {
      projectId: config.projectId.trim(),
      apiKey: resolvedKey,
      apiUrl: (typeof config.apiUrl === 'string' && config.apiUrl.trim() ? config.apiUrl.trim() : DEFAULT_API_URL).replace(/\/+$/, ''),
      failSafe: config.failSafe === 'closed' ? 'closed' : 'open',
      timeoutMs: typeof config.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS,
      cacheTtlMs: typeof config.cacheTtlMs === 'number' && config.cacheTtlMs >= 0 ? config.cacheTtlMs : DEFAULT_CACHE_TTL_MS,
      allowedDomains: Array.isArray(config.allowedDomains) ? config.allowedDomains.slice() : [],
      bypassPaths: Array.isArray(config.bypassPaths) ? config.bypassPaths.slice() : DEFAULT_BYPASS_PATHS.slice(),
      customLockHtml: typeof config.customLockHtml === 'string' ? config.customLockHtml : null,
      fetchFn: typeof config.fetchFn === 'function' ? config.fetchFn : (typeof fetch === 'function' ? fetch : null),
    };

    // Edge in-memory cache for project status
    // Key: projectId, Value: { status, data, expiresAt }
    const cache = new Map();

    /**
     * Clear in-memory status cache.
     */
    function clearCache() {
      cache.clear();
    }

    /**
     * Helper to set mock/manual status for testing or edge staging.
     */
    function setMockStatus(statusData) {
      const data = typeof statusData === 'string' ? { status: statusData } : (statusData || { status: 'active' });
      const status = data.status || 'active';
      cache.set(cfg.projectId, {
        status: status,
        data: data,
        expiresAt: Date.now() + cfg.cacheTtlMs,
      });
    }

    /**
     * Fetches current project status from the DevGuard API with timeout and fail-safe handling.
     *
     * @returns {Promise<string>} Project status ('active', 'warning', 'locked', 'autolocked', 'payment_past_due')
     */
    async function fetchProjectStatus() {
      // 1. Check in-memory cache
      const cached = cache.get(cfg.projectId);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.status;
      }

      // 2. Cache miss: fetch from API
      const fetchImplementation = cfg.fetchFn || (typeof fetch === 'function' ? fetch : null);
      if (!fetchImplementation) {
        if (cfg.failSafe === 'open') {
          return 'active';
        }
        return 'locked';
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      let timer = null;
      if (controller) {
        timer = setTimeout(function () {
          try { controller.abort(); } catch (_) {}
        }, cfg.timeoutMs);
      }

      const statusEndpoint = cfg.apiUrl + '/api/v1/projects/' + encodeURIComponent(cfg.projectId) + '/status';
      const requestHeaders = {
        'Accept': 'application/json',
      };
      if (cfg.apiKey) {
        requestHeaders['Authorization'] = 'Bearer ' + cfg.apiKey;
        requestHeaders['X-DevGuard-Key'] = cfg.apiKey;
      }

      try {
        const fetchOptions = {
          method: 'GET',
          headers: requestHeaders,
        };
        if (controller) {
          fetchOptions.signal = controller.signal;
        }

        const res = await fetchImplementation(statusEndpoint, fetchOptions);
        if (timer) clearTimeout(timer);

        if (!res.ok) {
          throw new Error('DevGuard API responded with HTTP ' + res.status);
        }

        const json = await res.json();
        const resolvedStatus = (json && (json.status || (json.project && json.project.status))) || 'active';

        // Cache the retrieved status
        cache.set(cfg.projectId, {
          status: resolvedStatus,
          data: json,
          expiresAt: Date.now() + cfg.cacheTtlMs,
        });

        return resolvedStatus;
      } catch (err) {
        if (timer) clearTimeout(timer);

        if (cfg.failSafe === 'open') {
          // Log warning and allow request to continue in failSafe: 'open'
          try {
            console.warn('[DevGuard Edge] Status check failed for ' + cfg.projectId + ' (' + err.message + '). Fail-safe open applied.');
          } catch (_) {}
          return 'active';
        }

        // failSafe: 'closed'
        try {
          console.error('[DevGuard Edge] Status check failed for ' + cfg.projectId + ' (' + err.message + '). Fail-safe closed applied.');
        } catch (_) {}
        return 'locked';
      }
    }

    /**
     * Intercepts and guards an incoming Web Request.
     *
     * @param {Request} request Incoming Web Standards Request
     * @param {(req: Request) => Promise<Response>} next Origin fetcher / next handler
     * @returns {Promise<Response>}
     */
    async function handleRequest(request, next) {
      if (!request || !request.url) {
        throw new Error('DevGuard Edge: request with valid url is required');
      }

      let url;
      try {
        url = new URL(request.url);
      } catch (e) {
        url = new URL(request.url, 'http://localhost');
      }

      const pathname = url.pathname || '/';

      // 1. Bypass paths check
      for (const bp of cfg.bypassPaths) {
        if (!bp || typeof bp !== 'string') continue;
        const normalizedBp = bp.startsWith('/') ? bp : '/' + bp;
        if (pathname === normalizedBp || pathname.startsWith(normalizedBp.endsWith('/') ? normalizedBp : normalizedBp + '/')) {
          return await next(request);
        }
      }

      // 2. Domain check
      let host = url.hostname;
      if (!host && request.headers) {
        const rawHost = (typeof request.headers.get === 'function' ? request.headers.get('host') : request.headers['host']) || '';
        host = rawHost;
      }
      if (cfg.allowedDomains && cfg.allowedDomains.length > 0) {
        if (!matchDomain(host, cfg.allowedDomains)) {
          return createUnauthorizedDomainResponse(cfg.projectId, host);
        }
      }

      // 3. Project status check
      const status = await fetchProjectStatus();
      const isLocked = status === 'locked' || status === 'autolocked' || status === 'payment_past_due';

      if (isLocked) {
        return createLockResponse(cfg.projectId, {
          customLockHtml: cfg.customLockHtml,
        });
      }

      // Status is active or warning -> proceed to origin
      return await next(request);
    }

    return {
      handleRequest: handleRequest,
      clearCache: clearCache,
      setMockStatus: setMockStatus,
      getLockHtml: function (customOptions) {
        return getLockHtml(cfg.projectId, customOptions);
      },
      matchDomain: matchDomain,
      config: cfg,
    };
  }

  // Also bind helpers to factory for direct access
  createEdgeGuard.createEdgeGuard = createEdgeGuard;
  createEdgeGuard.matchDomain = matchDomain;
  createEdgeGuard.normalizeHost = normalizeHost;
  createEdgeGuard.getLockHtml = getLockHtml;
  createEdgeGuard.createLockResponse = createLockResponse;
  createEdgeGuard.DEFAULT_BYPASS_PATHS = DEFAULT_BYPASS_PATHS;

  return {
    createEdgeGuard: createEdgeGuard,
    matchDomain: matchDomain,
    normalizeHost: normalizeHost,
    getLockHtml: getLockHtml,
    createLockResponse: createLockResponse,
    DEFAULT_BYPASS_PATHS: DEFAULT_BYPASS_PATHS,
    default: createEdgeGuard,
  };
});
