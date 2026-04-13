/**
 * DataImpulse residential proxy configuration.
 * Reads credentials from env vars and exports helpers for Playwright.
 */

const PROXY_HOST = process.env["PROXY_HOST"];
const PROXY_PORT = process.env["PROXY_PORT"] ?? "823";
const PROXY_USER = process.env["PROXY_USER"];
const PROXY_PASS = process.env["PROXY_PASS"];

/** Full proxy URL: http://user:pass@host:port */
export function getProxyUrl(): string | undefined {
  if (!PROXY_HOST || !PROXY_USER || !PROXY_PASS) return undefined;
  return `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
}

/** Structured proxy object for browser.newContext({ proxy }) */
export function getPlaywrightProxy():
  | { server: string; username: string; password: string }
  | undefined {
  if (!PROXY_HOST || !PROXY_USER || !PROXY_PASS) return undefined;
  return {
    server: `http://${PROXY_HOST}:${PROXY_PORT}`,
    username: PROXY_USER,
    password: PROXY_PASS,
  };
}
