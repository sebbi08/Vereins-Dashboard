import type { RequestHandler } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks cross-site requests that change data (CSRF). The browser sends the reverse proxy's
 * credentials along with a form or no-cors fetch from any other site, so without this check a
 * foreign page could e.g. replace the invoice template or re-send invoices.
 *
 * Browsers label every request with Sec-Fetch-Site; only `same-origin` and `none` (typed into
 * the address bar) may change data. Without that header the Origin must match the host the
 * request was sent to. Clients that send neither (curl, scripts, the e2e suite) are not
 * browsers and cannot be tricked into sending a user's credentials, so they pass.
 */
export const sameOriginGuard: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const site = req.get('Sec-Fetch-Site');
  if (site !== undefined) {
    if (site === 'same-origin' || site === 'none') next();
    else reject();
    return;
  }

  const origin = req.get('Origin');
  if (origin === undefined) {
    next();
    return;
  }
  const host = req.get('X-Forwarded-Host')?.split(',')[0].trim() || req.get('Host');
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // "null" or a malformed origin never matches
  }
  if (originHost !== null && originHost === host) next();
  else reject();

  function reject() {
    res.status(403).json({ error: 'Cross-site request blocked' });
  }
};
