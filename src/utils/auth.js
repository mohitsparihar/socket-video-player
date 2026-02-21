/**
 * GeoIQ auth cookie name. Set in env files as VITE_GEOIQ_AUTH_COOKIE_NAME
 * (e.g. GEOIQ_RETAILIQ_AUTH_DEVELOPMENT, GEOIQ_RETAILIQ_AUTH_STAGING, GEOIQ_RETAILIQ_AUTH_PRODUCTION).
 * Fallback only when env is missing (e.g. tests).
 */
const FALLBACK_AUTH_COOKIE_NAME = 'GEOIQ_RETAILIQ_AUTH_DEVELOPMENT';

/**
 * Get the GeoIQ auth cookie name from env (VITE_GEOIQ_AUTH_COOKIE_NAME).
 * @returns {string}
 */
export function getAuthCookieName() {
    const fromEnv = typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEOIQ_AUTH_COOKIE_NAME;
    return (fromEnv && String(fromEnv).trim()) ? String(fromEnv).trim() : FALLBACK_AUTH_COOKIE_NAME;
}

/**
 * Parse document.cookie and return the value for the given name, or null.
 * @param {string} name - Cookie name
 * @returns {string|null}
 */
function getCookieValue(name) {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[\-.]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
}

/**
 * Parse the GeoIQ auth cookie value (URL-encoded JSON) and return the token.
 * Cookie shape: {"in":{"ai_id":...,"email":...,"token":"eyJ...","u_id":...}}
 * @param {string} rawValue - Raw cookie string (may be URL-encoded)
 * @returns {string|null} - JWT token or null
 */
export function parseAuthCookieToken(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') return null;
    try {
        const decoded = decodeURIComponent(rawValue);
        const data = JSON.parse(decoded);
        const inner = data?.in ?? data?.data;
        return (inner && typeof inner.token === 'string') ? inner.token : null;
    } catch {
        return null;
    }
}

/**
 * Get the Bearer token from the GeoIQ auth cookie in the browser.
 * Uses cookie name from VITE_GEOIQ_AUTH_COOKIE_NAME or GEOIQ_RETAILIQ_AUTH_DEVELOPMENT.
 * @returns {string|null} - JWT token or null if cookie missing/invalid
 */
export function getTokenFromAuthCookie() {
    const name = getAuthCookieName();
    const value = getCookieValue(name);
    return parseAuthCookieToken(value);
}
