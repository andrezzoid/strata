export function parseConfig(path: string) {
  return { kind: "parsed", path };
}

export function loadConfig(path: string) {
  return { loaded: true, path };
}
