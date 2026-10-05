import type { SocialPlatform } from "@/services/socialAccountsService";

export function PlatformLogo({ platform, size = 56 }: { platform: SocialPlatform; size?: number }) {
  const base = {
    width: size,
    height: size,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as const;

  if (platform === "tiktok") {
    return (
      <span style={{ ...base, background: "#fff" }}>
        <img src="/tiktok-logo.png" alt="" style={{ height: size * 0.5, objectFit: "contain" }} />
      </span>
    );
  }

  if (platform === "youtube") {
    return (
      <span style={{ ...base, background: "#ff0000" }}>
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="1.5" y="5" width="21" height="14" rx="4" fill="#fff" />
          <path d="M10 9l5 3-5 3z" fill="#ff0000" />
        </svg>
      </span>
    );
  }

  if (platform === "instagram") {
    return (
      <span style={{ ...base, background: "linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)" }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none" />
        </svg>
      </span>
    );
  }

  return <span style={{ ...base, background: "rgba(255,255,255,.1)" }} />;
}
