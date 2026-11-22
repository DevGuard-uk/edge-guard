/**
 * DevGuard Edge Guard TypeScript Definitions
 * Compatible with Cloudflare Workers, Vercel Edge, Deno, Bun, and Node.js 18+
 */

export interface EdgeGuardConfig {
  /**
   * DevGuard project identifier (UUID or synthetic test ID).
   */
  projectId: string;

  /**
   * Project SDK key (preferred; dg_sdk_*). Wins over apiKey when both set.
   */
  sdkKey?: string;

  /**
   * Legacy API / Master Secret (fallback when sdkKey unset).
   */
  apiKey?: string;

  /**
   * DevGuard API endpoint. Default: "https://api.devguard.uk".
   */
  apiUrl?: string;

  /**
   * Fail-safe behavior on API failure or timeout:
   * - "open": allows traffic through (recommended for production uptime).
   * - "closed": returns HTTP 503 lock response.
   * Default: "open".
   */
  failSafe?: 'open' | 'closed';

  /**
   * API timeout in milliseconds. Default: 2500.
   */
  timeoutMs?: number;

  /**
   * In-memory cache duration in milliseconds. Default: 60000 (60 seconds).
   */
  cacheTtlMs?: number;

  /**
   * Allowlist of authorized hostnames/domains. Empty array permits all domains.
   * Supports exact domains ('example.com') and wildcard subdomains ('*.example.com').
   */
  allowedDomains?: string[];

  /**
   * Array of URL paths exempt from lock checks (e.g. ['/favicon.ico', '/robots.txt', '/_devguard/health']).
   */
  bypassPaths?: string[];

  /**
   * Optional custom HTML markup for the HTTP 503 lock page.
   */
  customLockHtml?: string;

  /**
   * Optional custom fetch implementation (useful for testing or specific edge polyfills).
   */
  fetchFn?: typeof fetch;
}

export interface EdgeGuardInstance {
  /**
   * Intercepts an incoming web Request and forwards to next() if licensed, or returns 503/403.
   */
  handleRequest(
    request: Request,
    next: (req: Request) => Promise<Response>
  ): Promise<Response>;

  /**
   * Clears the in-memory cache of project status.
   */
  clearCache(): void;

  /**
   * Sets mock or override status for testing or edge staging.
   */
  setMockStatus(statusData: string | { status: string; [key: string]: any }): void;

  /**
   * Generates SEO-safe HTML markup for the lock page.
   */
  getLockHtml(customOptions?: Record<string, any>): string;

  /**
   * Checks whether a host matches an allowedDomains list.
   */
  matchDomain(host: string, allowedDomains?: string[]): boolean;

  /**
   * Resolved runtime configuration.
   */
  readonly config: Readonly<Required<Omit<EdgeGuardConfig, 'customLockHtml' | 'fetchFn'>> & {
    customLockHtml: string | null;
    fetchFn: typeof fetch | null;
  }>;
}

export declare const DEFAULT_BYPASS_PATHS: readonly string[];

export declare function normalizeHost(rawHost: unknown): string;

export declare function matchDomain(
  host: string,
  allowedDomains?: string[] | string | null
): boolean;

export declare function getLockHtml(
  projectId: string,
  options?: {
    title?: string;
    message?: string;
    appName?: string;
    retryAfter?: number;
    [key: string]: any;
  }
): string;

export declare function createLockResponse(
  projectId: string,
  options?: {
    customLockHtml?: string;
    retryAfter?: number;
    [key: string]: any;
  }
): Response;

export declare function createEdgeGuard(config: EdgeGuardConfig): EdgeGuardInstance;

export default createEdgeGuard;
