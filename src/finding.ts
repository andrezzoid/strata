import type { Finding } from "./types.ts";

type IdentityValue =
  | string
  | number
  | boolean
  | null
  | readonly IdentityValue[]
  | { readonly [key: string]: IdentityValue };

type FindingIdentity = readonly IdentityValue[];

type FindingInput = Omit<Finding, "severity" | "fingerprint"> & {
  /** Detector-owned semantic parts that distinguish this candidate without using line numbers. */
  identity: FindingIdentity;
};

const FINGERPRINT_VERSION = "strata:v1";

/**
 * Builds the public finding shape from detector-owned identity parts.
 *
 * Detectors decide what makes a candidate semantically stable; this boundary
 * owns the fixed severity, canonical serialization, version prefix, and hash so
 * JSON/SARIF consumers see one consistent identity format.
 */
export function createFinding(input: FindingInput): Finding {
  const fingerprint = `${FINGERPRINT_VERSION}:${shortHash(
    canonicalize({ flag: input.flag, file: input.file, identity: input.identity }),
  )}`;

  return {
    flag: input.flag,
    severity: "candidate",
    fingerprint,
    file: input.file,
    line: input.line,
    message: input.message,
    metadata: input.metadata,
  };
}

/**
 * Tracks repeated identical anchors inside one detector pass without falling back to line numbers.
 *
 * Detectors should pass their semantic anchor first; this helper appends a stable
 * occurrence ordinal only when that same anchor appears again in the same file scan.
 */
export function createIdentityTracker(): (identity: FindingIdentity) => FindingIdentity {
  const counts = new Map<string, number>();
  return (identity) => {
    const key = canonicalize(identity);
    const occurrence = (counts.get(key) ?? 0) + 1;
    counts.set(key, occurrence);
    return occurrence === 1 ? identity : [...identity, occurrence];
  };
}

function canonicalize(value: IdentityValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

// djb2 is enough here: fingerprints need deterministic matching, not secrecy.
function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
