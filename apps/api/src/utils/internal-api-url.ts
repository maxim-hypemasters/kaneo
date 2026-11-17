// Base URL for loopback requests that act as the signed-in user (hosted MCP
// tools, the workspace assistant). It defaults to this process, so a bundled
// or split deployment needs no extra configuration.
export const internalApiUrl = (
  process.env.KANEO_INTERNAL_API_URL || "http://127.0.0.1:1337"
)
  .replace(/\/api\/?$/, "")
  .replace(/\/+$/, "");
