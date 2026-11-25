/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // HTTPS only, for a year (ignored on plain-http localhost).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // To-do never uses the camera, microphone, location or payments; full screen is its own (More → Full screen).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(self)" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
