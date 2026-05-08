/** Test files intentionally re-declare shapes and should not feed duplication-style detectors. */
export const TEST_FILE_PATTERN = /(^|\/)(__tests__|__mocks__|test|tests)\/|\.(test|spec)\.tsx?$/;

/** Generated code is not design signal; fix the generator, not the output. */
export const GENERATED_PATH_PATTERN = /(^|\/)(generated|__generated__)\/|\.(gen|pb)\.tsx?$|_pb\.tsx?$/;
