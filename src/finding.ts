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
  const fingerprint = `${FINGERPRINT_VERSION}:${stableHash(
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

/** Stable non-cryptographic hash for compact review-facing identifiers. */
export function stableHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
