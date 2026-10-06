import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Image } from "expo-image";
import { BACKEND_URL } from "@/src/api";

/**
 * Dynamic branding: logo/favicon come from the founder admin's settings (GET /api/public/info).
 * Falls back to the bundled logo until the backend answers (or if none was uploaded).
 */
type Branding = { logoUrl: any; faviconUrl: string | null; name: string; loaded: boolean };

const FALLBACK = require("../assets/images/logo.jpeg");
let cache: Branding = { logoUrl: FALLBACK, faviconUrl: null, name: "WENDEL CORTES", loaded: false };
const listeners = new Set<(b: Branding) => void>();

function publish(b: Branding) {
  cache = b;
  listeners.forEach((l) => l(b));
  if (Platform.OS === "web" && typeof document !== "undefined") {
    document.title = `${b.name} — Barbearia`;
    if (b.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = b.faviconUrl;
    }
  }
}

export async function refreshBranding() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/public/info`);
    const info = await res.json();
    const logo = info?.branding?.logo?.url ? `${BACKEND_URL}${info.branding.logo.url}` : FALLBACK;
    const fav = info?.branding?.favicon?.url ? `${BACKEND_URL}${info.branding.favicon.url}` : null;
    publish({ logoUrl: logo, faviconUrl: fav, name: info?.name || "WENDEL CORTES", loaded: true });
  } catch {
    publish({ ...cache, loaded: true });
  }
}

export function useBranding(): Branding {
  const [b, setB] = useState<Branding>(cache);
  useEffect(() => {
    listeners.add(setB);
    if (!cache.loaded) refreshBranding();
    return () => { listeners.delete(setB); };
  }, []);
  return b;
}

/** Brand logo — never distorted: fixed square box, contentFit="contain". */
export function Logo({ size = 120, radius }: { size?: number; radius?: number }) {
  const { logoUrl } = useBranding();
  return <Image source={logoUrl} style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.14) }} contentFit="contain" transition={200} />;
}
