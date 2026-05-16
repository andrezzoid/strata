import type { Finding, ScanResult } from "./types.ts";

type SarifLog = {
  $schema: string;
  version: "2.1.0";
  runs: SarifRun[];
};

type SarifRun = {
  tool: { driver: SarifDriver };
  results: SarifResult[];
};

type SarifDriver = {
  name: string;
  informationUri: string;
  rules: SarifRule[];
};

type SarifRule = {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  defaultConfiguration: { level: "warning" };
  help: { text: string };
  properties: {
    tags: string[];
    precision: "medium";
    "problem.severity": "recommendation";
  };
};

type SarifResult = {
  ruleId: string;
  ruleIndex: number;
  level: "warning";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number };
    };
  }>;
  partialFingerprints: { primaryLocationLineHash: string };
};

const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

const RULES: SarifRule[] = [
  rule(
    "wideSignature",
    "Wide signature",
    "Function, method, or constructor has too many required parameters.",
  ),
  rule(
    "passThroughMethod",
    "Pass-through method",
    "Public class method only forwards same-order arguments to a collaborator.",
  ),
  rule(
    "genericNaming",
    "Generic naming",
    "Type or class name uses vague suffixes such as Manager or Helper.",
  ),
  rule(
    "duplicateSymbol",
    "Duplicate symbol",
    "Named declarations with identical structure are repeated across the project.",
  ),
  rule(
    "uniqueImplementation",
    "Unique implementation",
    "Interface or abstract class appears to have no polymorphism payoff.",
  ),
  rule("orphanFile", "Orphan file", "File is not imported by any other scanned file."),
];

/**
 * Converts strata's compact scan result into a SARIF 2.1.0 log.
 *
 * The scan core owns finding detection; this module owns only the interchange
 * contract needed by GitHub code scanning and other SARIF consumers.
 */
export function formatSarif(result: ScanResult): string {
  const rules = rulesFor(result.findings);
  const ruleIndexById = new Map(rules.map((descriptor, index) => [descriptor.id, index]));
  const sarif: SarifLog = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "strata",
            informationUri: "https://github.com/andrezzoid/strata",
            rules,
          },
        },
        results: result.findings.map((finding) => sarifResult(finding, ruleIndexById)),
      },
    ],
  };

  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function rule(id: string, name: string, description: string): SarifRule {
  return {
    id,
    name,
    shortDescription: { text: description },
    fullDescription: { text: description },
    defaultConfiguration: { level: "warning" },
    help: {
      text: `${description} Strata reports this as a candidate for human or AI review, not as an automatic verdict.`,
    },
    properties: {
      tags: ["maintainability", "posd"],
      precision: "medium",
      "problem.severity": "recommendation",
    },
  };
}

function rulesFor(findings: Finding[]): SarifRule[] {
  const knownRules = new Map(RULES.map((descriptor) => [descriptor.id, descriptor]));
  const rules = [...RULES];
  for (const finding of findings) {
    if (knownRules.has(finding.flag)) continue;
    const descriptor = rule(finding.flag, finding.flag, finding.message);
    knownRules.set(finding.flag, descriptor);
    rules.push(descriptor);
  }
  return rules;
}

function sarifResult(finding: Finding, ruleIndexById: Map<string, number>): SarifResult {
  return {
    ruleId: finding.flag,
    ruleIndex: ruleIndexById.get(finding.flag) ?? 0,
    level: "warning",
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: artifactUri(finding.file) },
          region: { startLine: finding.line },
        },
      },
    ],
    partialFingerprints: {
      primaryLocationLineHash: finding.fingerprint,
    },
  };
}

function artifactUri(file: string): string {
  return file.split("/").map(encodeURIComponent).join("/");
}
