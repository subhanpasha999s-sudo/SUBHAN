#!/usr/bin/env node
/**
 * Next prints `Network: http://0.0.0.0:PORT` — unusable on a phone.
 * List concrete LAN IPv4 URLs and quick checks for same-Wi‑Fi dev.
 */
import { execSync } from "node:child_process";
import os from "node:os";

const port = process.env.PORT || "3000";
const ips = new Set();

try {
  const nets = os.networkInterfaces();
  if (nets) {
    for (const list of Object.values(nets)) {
      if (!list) continue;
      for (const net of list) {
        const v4 = net.family === "IPv4" || net.family === 4;
        if (v4 && !net.internal && net.address) {
          ips.add(net.address);
        }
      }
    }
  }
} catch {
  // sandbox / hardened hosts
}

/** macOS: `os.networkInterfaces()` can be empty; `ipconfig getifaddr` often still works */
if (ips.size === 0 && process.platform === "darwin") {
  for (const iface of ["en0", "en1"]) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, {
        encoding: "utf8",
        timeout: 3_000,
      }).trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        ips.add(ip);
      }
    } catch {
      // ignore — interface missing
    }
  }
}

console.log("");
if (ips.size === 0) {
  console.log(
    `\x1b[33m⚠ Phone URL:\x1b[0m could not detect a LAN IPv4 (Wi‑Fi off, VPN-only, or sandbox).`,
    `\n    On Mac: System Settings → Network → Wi‑Fi → Details → TCP/IP → copy IP address.`,
    `\n    Then open on your phone: http://YOUR_IP:${port}`
  );
} else {
  console.log(
    `\x1b[36mPhone / tablet (same Wi‑Fi):\x1b[0m use \x1b[1mhttp\x1b[0m — not https — in the mobile browser.`
  );
  for (const ip of ips) {
    console.log(`  • http://${ip}:${port}`);
  }
}

console.log(
  `\n\x1b[90mIf the page spins or stays blank:\x1b[0m restart dev after pulling latest (\`allowedDevOrigins\` in next.config enables LAN IPs).`,
  `\n\x1b[90mNote:\x1b[0m Next may show \`Network: http://0.0.0.0:${port}\` — this is normal; use one of the LAN IP URLs above on phone/tablet.`,
  `\n\x1b[90mMac firewall:\x1b[0m System Settings → Network → Firewall → Options → allow “Node” (or Incoming for port ${port}) for Wi‑Fi only.`
);

if (process.env.NEXT_DEV_LAN_ORIGINS) {
  console.log(
    `\n\x1b[90mNEXT_DEV_LAN_ORIGINS\x1b[0m=${process.env.NEXT_DEV_LAN_ORIGINS}`
  );
}
console.log("");
