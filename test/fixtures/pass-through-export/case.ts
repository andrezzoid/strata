import { loadConfig, parseConfig } from "./config-parser";

// Callable export wrapper - flagged.
export function parseConfigFile(path: string) {
  return parseConfig(path);
}

// Await-only forwarding is still just forwarding - flagged.
export async function loadConfigFile(path: string) {
  return await loadConfig(path);
}

// API curation barrel - not a callable wrapper, so not flagged.
export { Button } from "./button";
export { Dialog } from "./dialog";

// Internal helper - not exported, so not flagged.
function parseConfigBuffer(path: string) {
  return parseConfig(path);
}

// Argument transformation adds behavior - not flagged.
export function parseConfigPath(path: string) {
  return parseConfig(path.trim());
}
