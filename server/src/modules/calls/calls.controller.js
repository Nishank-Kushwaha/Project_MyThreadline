import env from "../../config/env.js";

const DEFAULT_STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

const METERED_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 5 * 60 * 1000; // reuse Metered's response for 5 minutes

// In-memory cache so every request doesn't hit Metered's API
let cachedTurnServers = null;
let cacheExpiresAt = 0;

async function fetchMeteredServers(cleanDomain, apiKey) {
  const url = `https://${cleanDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METERED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      // Status only. Never log the URL, because it contains the API key.
      throw new Error(`Metered responded with status ${response.status}`);
    }

    const servers = await response.json();
    if (!Array.isArray(servers) || servers.length === 0) {
      throw new Error("Metered returned an empty or invalid server list");
    }
    return servers;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns dynamic ICE server configurations for WebRTC peer connections.
 * - If Metered.ca TURN credentials (METERED_DOMAIN, METERED_API_KEY) are configured in .env,
 *   fetches the dynamic STUN/TURN configurations with short-lived credentials.
 * - Otherwise falls back seamlessly to Google's public STUN servers.
 */
export async function getIceServers(req, res, next) {
  try {
    // TURN credentials can expire, so the browser must never cache this response
    res.set("Cache-Control", "no-store");
    res.removeHeader("ETag");

    const { domain, apiKey } = env.metered;

    if (domain && apiKey) {
      try {
        // Serve from the server cache if it's still fresh
        if (cachedTurnServers && Date.now() < cacheExpiresAt) {
          return res.status(200).json({
            success: true,
            iceServers: [...DEFAULT_STUN_SERVERS, ...cachedTurnServers],
          });
        }

        // Metered.ca provides: https://<domain>.metered.live/api/v1/turn/credentials?apiKey=<apiKey>
        // Note: domain can be either "myapp.metered.live" or just "myapp"
        const cleanDomain = domain.includes(".")
          ? domain
          : `${domain}.metered.live`;

        const turnServers = await fetchMeteredServers(cleanDomain, apiKey);

        cachedTurnServers = turnServers;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;

        return res.status(200).json({
          success: true,
          iceServers: [...DEFAULT_STUN_SERVERS, ...turnServers],
        });
      } catch (err) {
        console.warn(
          "[calls] Metered.ca TURN unavailable, falling back to STUN:",
          err.name === "AbortError" ? "request timed out" : err.message,
        );

        // If we have older cached servers, prefer them over STUN-only
        if (cachedTurnServers) {
          return res.status(200).json({
            success: true,
            iceServers: [...DEFAULT_STUN_SERVERS, ...cachedTurnServers],
          });
        }
      }
    }

    // Default STUN-only fallback
    return res.status(200).json({
      success: true,
      iceServers: DEFAULT_STUN_SERVERS,
    });
  } catch (err) {
    next(err);
  }
}
