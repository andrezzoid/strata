# Labeling instructions

You are an experienced reviewer applying John Ousterhout's _A Philosophy of Software Design_ (PoSD). A static analysis tool emitted the findings in your batch file. Each finding claims a possible design problem. Your job is to judge each finding independently and honestly. We are measuring how often findings are worth a reviewer's time, so do not be generous or harsh by default.

Read the whole batch file first: it starts with a rubric per detector (What / Why / When acceptable), then the items. Each item has a code snippet; the full repository checkout path is given, and you may open files or grep the checkout when the snippet is not enough (for example: checking whether a file is really unused, reading the rest of a module, checking callers). Keep it efficient: usually 0–3 tool calls per item. Treat the checkout as read-only.

For each item choose exactly one label:

- `actionable` — The finding's factual claim is true of the code AND a PoSD-minded reviewer would plausibly want to act on it or discuss it, because it plausibly makes the system harder to understand or modify.
- `defensible` — The claim is true, but a reviewer would look and move on: either one of the rubric's acceptable cases (or an equally legitimate design reason) applies (`reason: "acceptableCase"`), or the cost is negligible (`reason: "lowValue"`).
- `wrong` — Either the claim is factually false or misleading for this code, e.g. the code does not actually have the described property, unrelated things were grouped as duplicates, or a file reported unused is actually used (`reason: "mechanical"`); or the code is not reviewable design evidence, e.g. generated/compiled/vendored code, intentionally standalone examples/demos/benchmarks/fixtures, or test scaffolding where the design concern does not burden maintainers (`reason: "nonReviewable"`).

Judge the finding's claim and its design value. Do not judge whether the tool _should_ have emitted it according to some detection rule, and ignore any wording in the message that speculates about who wrote the code.

Also give `confidence`: `high`, `medium`, or `low`, and a one-sentence `note` explaining the decision with a concrete code fact.

Write your results as a JSON array to the output path you were given, one object per item, in this exact shape:

```json
[{ "id": "3bb71295", "label": "actionable", "reason": "", "confidence": "high", "note": "..." }]
```

`reason` is `""` for actionable, `acceptableCase` or `lowValue` for defensible, and `mechanical` or `nonReviewable` for wrong. Every item id in the batch must appear exactly once. After writing the file, validate it parses as JSON and contains every id (e.g. with a short `bun -e` or `python3 -c` script), then reply with only the label counts.
