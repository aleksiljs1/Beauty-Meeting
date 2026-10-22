
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Origin the browser talks to for presigned uploads/downloads (private storage).
 * Path-style endpoints (SeaweedFS locally) use the endpoint origin; virtual-hosted style
 * (R2/S3) prefixes the bucket name.
 */
function storageOrigin(): string {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return "";
  const url = new URL(endpoint);
  if (process.env.S3_FORCE_PATH_STYLE === "true") return url.origin;
  return `${url.protocol}//${process.env.S3_BUCKET}.${url.host}`;
}

const storage = storageOrigin();

/** Socket.IO service origin (http + ws) when it runs on a separate origin. */
function realtimeOrigins(): string {
  const value = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (!value) return "";
  const url = new URL(value);
  const ws = url.protocol === "https:" ? "wss:" : "ws:";
  return `${url.origin} ${ws}//${url.host}`;
}

const realtime = realtimeOrigins();

// Next.js hydration needs inline scripts; there are no third-party scripts on the site.
// The Zoom classroom frame gets its own, separately scoped policy below.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storage}`,
  `media-src 'self' blob: ${storage}`,
  `connect-src 'self' ${storage} ${realtime}`,
  `frame-src 'self' ${storage}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/**
 * Zoom Meeting SDK runs only inside public/zoom-frame.html.
 * Its CDN, media connections, WebAssembly and inline styles must be allowed
 * there without relaxing the policy for the rest of Beauty Meeting.
 *
 * Zoom's Web SDK documentation identifies these additional CSP requirements:
 * https://developers.zoom.us/docs/meeting-sdk/web/browser-support/
 */
const zoomFrameCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "worker-src 'self' blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://source.zoom.us https://zoom.us https://*.zoom.us https://dmogdx0jrul3u.cloudfront.net blob:",
  "style-src 'self' 'unsafe-inline' https://source.zoom.us https://*.zoom.us",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https://source.zoom.us https://zoom.us https://*.zoom.us wss://*.zoom.us https://zoom.com https://*.zoom.com wss://*.zoom.com https://zoom.com.cn https://*.zoom.com.cn wss://*.zoom.com.cn https://dmogdx0jrul3u.cloudfront.net",
  "frame-src 'self' https://zoom.us https://*.zoom.us https://zoom.com https://*.zoom.com blob:",
  "form-action 'self' https://zoom.us https://*.zoom.us",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera/mic are allowed for our own origin, including the same-origin Zoom frame.
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },

      // Invitation tokens live in the URL path: never leak them through the Referer header.
      {
        source: "/ftese/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },

      // Override only the CSP and permissions policy for the isolated Zoom SDK frame.
      {
        source: "/zoom-frame.html",
        headers: [
          { key: "Content-Security-Policy", value: zoomFrameCsp },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
