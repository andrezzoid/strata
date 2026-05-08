/** Test files intentionally re-declare shapes and should not feed duplication-style detectors. */
const TEST_FILE_PATTERN = /(^|\/)(__tests__|__mocks__|test|tests)\/|\.(test|spec)\.tsx?$/;

/** Generated code is not design signal; fix the generator, not the output. */
const GENERATED_PATH_PATTERN = /(^|\/)(generated|__generated__)\/|\.(gen|pb)\.tsx?$|_pb\.tsx?$/;

/** True when a path belongs to test-only code that should not be design evidence. */
export function isTestOnlyPath(file: string): boolean {
  return TEST_FILE_PATTERN.test(file);
}

/** True when a path is intentionally poor review evidence for cross-file design detectors. */
export function isNonReviewablePath(file: string): boolean {
  return isTestOnlyPath(file) || GENERATED_PATH_PATTERN.test(file);
}
