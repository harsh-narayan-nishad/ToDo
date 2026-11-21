import { ImageResponse } from "next/og";

/**
 * The home-screen icon ("Add to Home Screen" on phones and tablets): the same design as app/icon.svg, drawn full-bleed
 * (the phone rounds the corners itself).
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function HomeScreenIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #FFB547 0%, #FF7A45 55%, #EF4F5E 100%)" }}>
        <div style={{ width: 100, height: 100, borderRadius: 30, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <defs>
              <linearGradient id="t" x1="8" y1="10" x2="56" y2="54" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#FF8A3D" />
                <stop offset="1" stopColor="#EB4A5A" />
              </linearGradient>
            </defs>
            <path d="M14 33 L27 46 L51 20" fill="none" stroke="url(#t)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}
