import { execFileSync } from "node:child_process";

export function identityFromStatus(status) {
  const users = status?.User ?? {};
  const id = status?.Self?.UserID;
  const user = users[id] ?? users[String(id)] ?? {};
  const login = typeof user.LoginName === "string" ? user.LoginName.trim() : "";
  const dns = String(status?.Self?.DNSName ?? "").replace(/\.$/, "");
  return {
    login,
    dns,
    bookmark: dns ? `https://${dns}/` : "",
  };
}

export function readTailscaleIdentity() {
  let raw;
  try {
    raw = execFileSync("tailscale", ["status", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error?.stderr?.toString().trim();
    throw new Error(detail || "Could not read Tailscale status. Install Tailscale and run: sudo tailscale up");
  }
  const identity = identityFromStatus(JSON.parse(raw));
  if (!identity.login) {
    throw new Error("This machine is not logged in to Tailscale. Run: sudo tailscale up");
  }
  return identity;
}
