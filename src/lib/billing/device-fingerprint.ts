"use client";

const DEVICE_ID_KEY = "tulmin.billing.device.v1";

function randomDeviceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateBillingDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 16) return existing;
    const id = randomDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return randomDeviceId();
  }
}

export function getBillingBrowserSignals() {
  if (typeof window === "undefined") {
    return {
      deviceId: "server",
      timezone: "server",
      language: "server",
      platform: "server",
      screen: "server",
    };
  }

  return {
    deviceId: getOrCreateBillingDeviceId(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    language: navigator.language || "unknown",
    platform: navigator.platform || "unknown",
    screen: `${window.screen.width}x${window.screen.height}x${window.devicePixelRatio || 1}`,
  };
}
