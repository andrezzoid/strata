# Label sheet — duplicateSymbol

60 of 461 findings, drawn with seed `strata-precision-round-1:duplicateSymbol`.

For each item: **would changing this design make the code easier to understand or
modify?** Answer `accept`, `reject`, or `depends`, and give a cause for every
rejection. The permitted causes are fixed in `../PREREGISTRATION.md`.

strata's message, evidence and fingerprint are withheld on purpose. Judge the source.

---

## 1. `cloudflare-agents/packages/agents/src#strata:v1:19vapbs`

3 location(s) in `cloudflare-agents/packages/agents/src`.

retries.ts:267  (isDurableObjectCodeUpdateReset)
```ts
  261 | /**
  262 |  * Whether an error (or anything in its `cause` chain) is a transient
  263 |  * "superseded isolate" failure — see `SUPERSEDED_ISOLATE_PATTERN`. In-process
  264 |  * retries are futile for this class; the work must be deferred to a fresh
  265 |  * invocation, which runs the new code and succeeds.
  266 |  */
> 267 | export function isDurableObjectCodeUpdateReset(error: unknown): boolean {
  268 |   for (const e of selfAndCauses(error)) {
  269 |     if (SUPERSEDED_ISOLATE_PATTERN.test(errorMessageOf(e))) return true;
  270 |   }
  271 |   return false;
  272 | }
  273 | 
```

retries.ts:279  (isDurableObjectStorageReset)
```ts
  273 | 
  274 | /**
  275 |  * Whether an error (or anything in its `cause` chain) carries the exact
  276 |  * Durable Object storage-reset platform fragment. Generic SQL/internal errors
  277 |  * deliberately do not qualify.
  278 |  */
> 279 | export function isDurableObjectStorageReset(error: unknown): boolean {
  280 |   for (const e of selfAndCauses(error)) {
  281 |     if (STORAGE_RESET_PATTERN.test(errorMessageOf(e))) return true;
  282 |   }
  283 |   return false;
  284 | }
  285 | 
```

retries.ts:293  (isDurableObjectMemoryLimitReset)
```ts
  287 |  * Whether an error (or anything in its `cause` chain, or a raw error-message
  288 |  * string) is a Durable Object memory-limit reset — see
  289 |  * {@link MEMORY_LIMIT_RESET_PATTERN}. Unlike {@link isPlatformTransientError},
  290 |  * re-running the same work re-OOMs deterministically, so callers must NOT defer
  291 |  * it like a transient; they should bound retries tightly and then seal (#1825).
  292 |  */
> 293 | export function isDurableObjectMemoryLimitReset(error: unknown): boolean {
  294 |   for (const e of selfAndCauses(error)) {
  295 |     if (MEMORY_LIMIT_RESET_PATTERN.test(errorMessageOf(e))) return true;
  296 |   }
  297 |   return false;
  298 | }
  299 | 
```

---

## 2. `cloudflare-agents/packages/agents/src#strata:v1:1eqd2ms`

2 location(s) in `cloudflare-agents/packages/agents/src`.

agent-routing.ts:228  (mutableRequest)
```ts
  222 |   for (let i = 0; i < bytes.length; i++) {
  223 |     binary += String.fromCharCode(bytes[i]);
  224 |   }
  225 |   return btoa(binary);
  226 | }
  227 | 
> 228 | function mutableRequest(request: Request): Request {
  229 |   return new Request(request);
  230 | }
  231 | 
  232 | function cloneRequestForFetch(request: Request): Request {
  233 |   // SAFETY: Workers Types v5 preserves an unconstrained `cf` generic from
  234 |   // clone(). Cloning does not change the runtime Request representation.
```

lifecycle/durable-object-lifecycle.ts:92  (mutableRequest)
```ts
  86 |     //     handler over
  87 |     // None of these are recoverable here; the handshake is either already
  88 |     // done or the runtime is out of our control.
  89 |   }
  90 | }
  91 | 
> 92 | function mutableRequest(request: Request): Request {
  93 |   return new Request(request);
  94 | }
  95 | 
  96 | /**
  97 |  * Decode props from the internal lifecycle props header.
  98 |  *
```

---

## 3. `cloudflare-agents/packages/agents/src#strata:v1:9o1uh4`

3 location(s) in `cloudflare-agents/packages/agents/src`.

observability/ai/wrapper/streams.ts:538  (isErrorChunk)
```ts
  532 |     part !== null &&
  533 |     "type" in (part as Record<string, unknown>)
  534 |     ? part
  535 |     : chunk;
  536 | }
  537 | 
> 538 | function isErrorChunk(chunk: unknown): chunk is { readonly error: unknown } {
  539 |   return (
  540 |     typeof chunk === "object" &&
  541 |     chunk !== null &&
  542 |     (chunk as Record<string, unknown>).type === "error"
  543 |   );
  544 | }
```

observability/ai/wrapper/streams.ts:546  (isAbortChunk)
```ts
  540 |     typeof chunk === "object" &&
  541 |     chunk !== null &&
  542 |     (chunk as Record<string, unknown>).type === "error"
  543 |   );
  544 | }
  545 | 
> 546 | function isAbortChunk(chunk: unknown): boolean {
  547 |   return (
  548 |     typeof chunk === "object" &&
  549 |     chunk !== null &&
  550 |     (chunk as Record<string, unknown>).type === "abort"
  551 |   );
  552 | }
```

observability/ai/wrapper/streams.ts:593  (isToolCallChunk)
```ts
  587 |     typeof value.pipeThrough === "function" &&
  588 |     "getReader" in value &&
  589 |     typeof value.getReader === "function"
  590 |   );
  591 | }
  592 | 
> 593 | function isToolCallChunk(chunk: unknown): boolean {
  594 |   return (
  595 |     typeof chunk === "object" &&
  596 |     chunk !== null &&
  597 |     (chunk as Record<string, unknown>).type === "tool-call"
  598 |   );
  599 | }
```

---

## 4. `continue/core#strata:v1:1k9cgbf`

5 location(s) in `continue/core`.

vendor/modules/@xenova/transformers/types/pipelines.d.ts:1605  (TextClassificationSingle)
```ts
  1599 |   ModelTokenizerProcessorConstructorArgs;
  1600 | /**
  1601 |  * An object used to instantiate a text- and image-based pipeline.
  1602 |  */
  1603 | export type TextImagePipelineConstructorArgs =
  1604 |   ModelTokenizerProcessorConstructorArgs;
> 1605 | export type TextClassificationSingle = {
  1606 |   /**
  1607 |    * The label predicted.
  1608 |    */
  1609 |   label: string;
  1610 |   /**
  1611 |    * The corresponding probability.
```

vendor/modules/@xenova/transformers/types/pipelines.d.ts:1902  (AudioClassificationSingle)
```ts
  1896 |   texts: string | string[],
  1897 |   options?: FeatureExtractionPipelineOptions,
  1898 | ) => Promise<Tensor>;
  1899 | export type FeatureExtractionPipelineType = TextPipelineConstructorArgs &
  1900 |   FeatureExtractionPipelineCallback &
  1901 |   Disposable;
> 1902 | export type AudioClassificationSingle = {
  1903 |   /**
  1904 |    * The label predicted.
  1905 |    */
  1906 |   label: string;
  1907 |   /**
  1908 |    * The corresponding probability.
```

vendor/modules/@xenova/transformers/types/pipelines.d.ts:1934  (ZeroShotAudioClassificationOutput)
```ts
  1928 |   audio: AudioPipelineInputs,
  1929 |   options?: AudioClassificationPipelineOptions,
  1930 | ) => Promise<AudioClassificationOutput | AudioClassificationOutput[]>;
  1931 | export type AudioClassificationPipelineType = AudioPipelineConstructorArgs &
  1932 |   AudioClassificationPipelineCallback &
  1933 |   Disposable;
> 1934 | export type ZeroShotAudioClassificationOutput = {
  1935 |   /**
  1936 |    * The label identified by the model. It is one of the suggested `candidate_label`.
  1937 |    */
  1938 |   label: string;
  1939 |   /**
  1940 |    * The score attributed by the model for that label (between 0 and 1).
```

vendor/modules/@xenova/transformers/types/pipelines.d.ts:2073  (ImageClassificationSingle)
```ts
  2067 |   texts: ImagePipelineInputs,
  2068 |   options?: import("./utils/generation.js").GenerationConfigType,
  2069 | ) => Promise<ImageToTextOutput | ImageToTextOutput[]>;
  2070 | export type ImageToTextPipelineType = TextImagePipelineConstructorArgs &
  2071 |   ImageToTextPipelineCallback &
  2072 |   Disposable;
> 2073 | export type ImageClassificationSingle = {
  2074 |   /**
  2075 |    * The label identified by the model.
  2076 |    */
  2077 |   label: string;
  2078 |   /**
  2079 |    * The score attributed by the model for that label.
```

Further locations: vendor/modules/@xenova/transformers/types/pipelines.d.ts:2157

---

## 5. `continue/core#strata:v1:9rvw01`

3 location(s) in `continue/core`.

vendor/modules/@xenova/transformers/types/tokenizers.d.ts:371  (MBartTokenizer)
```ts
  365 |   constructor(tokenizerJSON: any, tokenizerConfig: any);
  366 | }
  367 | export class ElectraTokenizer extends PreTrainedTokenizer {}
  368 | export class T5Tokenizer extends PreTrainedTokenizer {}
  369 | export class GPT2Tokenizer extends PreTrainedTokenizer {}
  370 | export class BartTokenizer extends PreTrainedTokenizer {}
> 371 | export class MBartTokenizer extends PreTrainedTokenizer {
  372 |   constructor(tokenizerJSON: any, tokenizerConfig: any);
  373 |   languageRegex: RegExp;
  374 |   language_codes: any[];
  375 |   lang_to_token: (x: any) => any;
  376 |   /**
  377 |    * Helper function to build translation inputs for an `MBartTokenizer`.
```

vendor/modules/@xenova/transformers/types/tokenizers.d.ts:420  (NllbTokenizer)
```ts
  414 |  * regardless of their language preferences. For more information, check out their
  415 |  * [paper](https://arxiv.org/abs/2207.04672).
  416 |  *
  417 |  * For a list of supported languages (along with their language codes),
  418 |  * @see {@link https://github.com/facebookresearch/flores/blob/main/flores200/README.md#languages-in-flores-200}
  419 |  */
> 420 | export class NllbTokenizer extends PreTrainedTokenizer {
  421 |   constructor(tokenizerJSON: any, tokenizerConfig: any);
  422 |   languageRegex: RegExp;
  423 |   language_codes: any[];
  424 |   lang_to_token: (x: any) => any;
  425 |   /**
  426 |    * Helper function to build translation inputs for an `NllbTokenizer`.
```

vendor/modules/@xenova/transformers/types/tokenizers.d.ts:448  (M2M100Tokenizer)
```ts
  442 |  * multilingual translation. It was introduced in this [paper](https://arxiv.org/abs/2010.11125)
  443 |  * and first released in [this](https://github.com/pytorch/fairseq/tree/master/examples/m2m_100) repository.
  444 |  *
  445 |  * For a list of supported languages (along with their language codes),
  446 |  * @see {@link https://huggingface.co/facebook/m2m100_418M#languages-covered}
  447 |  */
> 448 | export class M2M100Tokenizer extends PreTrainedTokenizer {
  449 |   constructor(tokenizerJSON: any, tokenizerConfig: any);
  450 |   languageRegex: RegExp;
  451 |   language_codes: any[];
  452 |   lang_to_token: (x: any) => string;
  453 |   /**
  454 |    * Helper function to build translation inputs for an `M2M100Tokenizer`.
```

---

## 6. `continue/core#strata:v1:uobqrc`

7 location(s) in `continue/core`.

util/paths.ts:50  (getContinueUtilsPath)
```ts
  44 | }`;
  45 | 
  46 | export function getChromiumPath(): string {
  47 |   return path.join(getContinueUtilsPath(), ".chromium-browser-snapshots");
  48 | }
  49 | 
> 50 | export function getContinueUtilsPath(): string {
  51 |   const utilsPath = path.join(getContinueGlobalPath(), ".utils");
  52 |   if (!fs.existsSync(utilsPath)) {
  53 |     fs.mkdirSync(utilsPath);
  54 |   }
  55 |   return utilsPath;
  56 | }
```

util/paths.ts:78  (getSessionsFolderPath)
```ts
  72 |   if (!fs.existsSync(continuePath)) {
  73 |     fs.mkdirSync(continuePath);
  74 |   }
  75 |   return continuePath;
  76 | }
  77 | 
> 78 | export function getSessionsFolderPath(): string {
  79 |   const sessionsPath = path.join(getContinueGlobalPath(), "sessions");
  80 |   if (!fs.existsSync(sessionsPath)) {
  81 |     fs.mkdirSync(sessionsPath);
  82 |   }
  83 |   return sessionsPath;
  84 | }
```

util/paths.ts:86  (getIndexFolderPath)
```ts
  80 |   if (!fs.existsSync(sessionsPath)) {
  81 |     fs.mkdirSync(sessionsPath);
  82 |   }
  83 |   return sessionsPath;
  84 | }
  85 | 
> 86 | export function getIndexFolderPath(): string {
  87 |   const indexPath = path.join(getContinueGlobalPath(), "index");
  88 |   if (!fs.existsSync(indexPath)) {
  89 |     fs.mkdirSync(indexPath);
  90 |   }
  91 |   return indexPath;
  92 | }
```

util/paths.ts:228  (getDevDataPath)
```ts
  222 |       ),
  223 |     );
  224 |   }
  225 |   return continuercPath;
  226 | }
  227 | 
> 228 | function getDevDataPath(): string {
  229 |   const sPath = path.join(getContinueGlobalPath(), "dev_data");
  230 |   if (!fs.existsSync(sPath)) {
  231 |     fs.mkdirSync(sPath);
  232 |   }
  233 |   return sPath;
  234 | }
```

Further locations: util/paths.ts:292, util/paths.ts:342, util/paths.ts:385

---

## 7. `continue/gui/src#strata:v1:1fmdcrg`

2 location(s) in `continue/gui/src`.

components/svg/GitlabIcon.tsx:5  (GitlabIcon)
```ts
   1 | interface CustomGitlabIconProps extends React.SVGProps<SVGSVGElement> {
   2 |   size?: number;
   3 | }
   4 | 
>  5 | export function GitlabIcon({
   6 |   size = 24,
   7 |   className,
   8 |   ...props
   9 | }: CustomGitlabIconProps) {
  10 |   return (
  11 |     <svg
```

components/svg/GoogleIcon.tsx:5  (GoogleIcon)
```ts
   1 | interface CustomGoogleIconProps extends React.SVGProps<SVGSVGElement> {
   2 |   size?: number;
   3 | }
   4 | 
>  5 | export function GoogleIcon({
   6 |   size = 24,
   7 |   className,
   8 |   ...props
   9 | }: CustomGoogleIconProps) {
  10 |   return (
  11 |     <svg
```

---

## 8. `continue/gui/src#strata:v1:fz5seq`

2 location(s) in `continue/gui/src`.

pages/config/components/ConfigSection.tsx:11  (ConfigSection)
```ts
   5 |   children: React.ReactNode;
   6 |   className?: string;
   7 | }
   8 | 
   9 | // ConfigSection for internal section organization within pages
  10 | // Not used as page wrapper - that's handled by ConfigPageLayout
> 11 | export function ConfigSection({
  12 |   title,
  13 |   children,
  14 |   className = "",
  15 | }: ConfigSectionProps) {
  16 |   return (
  17 |     <div className={className}>
```

pages/config/components/ConfigSubsection.tsx:9  (ConfigSubsection)
```ts
   3 | interface ConfigSubsectionProps {
   4 |   title?: string;
   5 |   children: React.ReactNode;
   6 |   className?: string;
   7 | }
   8 | 
>  9 | export function ConfigSubsection({
  10 |   title,
  11 |   children,
  12 |   className = "",
  13 | }: ConfigSubsectionProps) {
  14 |   return (
  15 |     <div className={className}>
```

---

## 9. `continue/gui/src#strata:v1:s49t9z`

2 location(s) in `continue/gui/src`.

components/mainInput/InputToolbar.tsx:253  (shallowToolbarOptionsEqual)
```ts
  247 |         </div>
  248 |       </div>
  249 |     </>
  250 |   );
  251 | }
  252 | 
> 253 | function shallowToolbarOptionsEqual(a?: ToolbarOptions, b?: ToolbarOptions) {
  254 |   if (a === b) return true;
  255 |   if (!a || !b) return false;
  256 |   return (
  257 |     a.hideAddContext === b.hideAddContext &&
  258 |     a.hideImageUpload === b.hideImageUpload &&
  259 |     a.hideUseCodebase === b.hideUseCodebase &&
```

components/mainInput/TipTapEditor/TipTapEditor.tsx:317  (toolbarOptionsEqual)
```ts
  311 |         )}
  312 |       <div id={TIPPY_DIV_ID} className="fixed z-50" />
  313 |     </InputBoxDiv>
  314 |   );
  315 | }
  316 | 
> 317 | function toolbarOptionsEqual(a?: ToolbarOptions, b?: ToolbarOptions) {
  318 |   if (a === b) return true;
  319 |   if (!a || !b) return false;
  320 |   return (
  321 |     a.hideAddContext === b.hideAddContext &&
  322 |     a.hideImageUpload === b.hideImageUpload &&
  323 |     a.hideUseCodebase === b.hideUseCodebase &&
```

---

## 10. `continue/gui/src#strata:v1:vhwn8b`

5 location(s) in `continue/gui/src`.

components/svg/BotIcon.tsx:1  (BotIconProps)
```ts
> 1 | interface BotIconProps extends React.SVGProps<SVGSVGElement> {
  2 |   size?: number;
  3 | }
  4 | 
  5 | export function BotIcon({ size = 24, className, ...props }: BotIconProps) {
  6 |   return (
  7 |     <svg
```

components/svg/DiscordIcon.tsx:1  (DiscordIconProps)
```ts
> 1 | interface DiscordIconProps extends React.SVGProps<SVGSVGElement> {
  2 |   size?: number;
  3 | }
  4 | 
  5 | export function DiscordIcon({
  6 |   size = 24,
  7 |   className,
```

components/svg/GithubIcon.tsx:1  (GithubIconProps)
```ts
> 1 | interface GithubIconProps extends React.SVGProps<SVGSVGElement> {
  2 |   size?: number;
  3 | }
  4 | 
  5 | export function GithubIcon({
  6 |   size = 24,
  7 |   className,
```

components/svg/GitlabIcon.tsx:1  (CustomGitlabIconProps)
```ts
> 1 | interface CustomGitlabIconProps extends React.SVGProps<SVGSVGElement> {
  2 |   size?: number;
  3 | }
  4 | 
  5 | export function GitlabIcon({
  6 |   size = 24,
  7 |   className,
```

Further locations: components/svg/GoogleIcon.tsx:1

---

## 11. `hono/src#strata:v1:152ecla`

2 location(s) in `hono/src`.

helper/ssg/ssg.ts:118  (combineBeforeRequestHooks)
```ts
  112 | export type AfterGenerateHook = (
  113 |   result: ToSSGResult,
  114 |   fsModule: FileSystemModule,
  115 |   options?: ToSSGOptions
  116 | ) => void | Promise<void>
  117 | 
> 118 | export const combineBeforeRequestHooks = (
  119 |   hooks: BeforeRequestHook | BeforeRequestHook[]
  120 | ): BeforeRequestHook => {
  121 |   if (!Array.isArray(hooks)) {
  122 |     return hooks
  123 |   }
  124 |   return async (req: Request): Promise<Request | false> => {
```

helper/ssg/ssg.ts:139  (combineAfterResponseHooks)
```ts
  133 |       }
  134 |     }
  135 |     return currentReq
  136 |   }
  137 | }
  138 | 
> 139 | export const combineAfterResponseHooks = (
  140 |   hooks: AfterResponseHook | AfterResponseHook[]
  141 | ): AfterResponseHook => {
  142 |   if (!Array.isArray(hooks)) {
  143 |     return hooks
  144 |   }
  145 |   return async (res: Response): Promise<Response | false> => {
```

---

## 12. `hono/src#strata:v1:afmwag`

2 location(s) in `hono/src`.

helper/css/common.ts:56  (isValidClassName)
```ts
  50 | }
  51 | 
  52 | const normalizeLabel = (label: string): string => {
  53 |   return label.trim().replace(/\s+/g, '-')
  54 | }
  55 | 
> 56 | const isValidClassName = (name: string): boolean => /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(name)
  57 | 
  58 | // `<`, `{`, `}` never appear in valid class names but can break out of a <style> element
  59 | // or inject a CSS rule when an external cx() class name is used as a selector.
  60 | const hasUnsafeSelectorChar = (name: string): boolean => /[<{}]/.test(name)
  61 | 
  62 | // CSS-wide keywords that are invalid as @keyframes names per the spec
```

helper/css/common.ts:60  (hasUnsafeSelectorChar)
```ts
  54 | }
  55 | 
  56 | const isValidClassName = (name: string): boolean => /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(name)
  57 | 
  58 | // `<`, `{`, `}` never appear in valid class names but can break out of a <style> element
  59 | // or inject a CSS rule when an external cx() class name is used as a selector.
> 60 | const hasUnsafeSelectorChar = (name: string): boolean => /[<{}]/.test(name)
  61 | 
  62 | // CSS-wide keywords that are invalid as @keyframes names per the spec
  63 | const RESERVED_KEYFRAME_NAMES = new Set([
  64 |   'default',
  65 |   'inherit',
  66 |   'initial',
```

---

## 13. `hono/src#strata:v1:cwkllc`

2 location(s) in `hono/src`.

adapter/bun/ssg.ts:25  (toSSG)
```ts
  19 | 
  20 | /**
  21 |  * @experimental
  22 |  * `toSSG` is an experimental feature.
  23 |  * The API might be changed.
  24 |  */
> 25 | export const toSSG: ToSSGAdaptorInterface = async (app, options) => {
  26 |   return baseToSSG(app, bunFileSystemModule, options)
  27 | }
  28 | 
```

adapter/deno/ssg.ts:25  (toSSG)
```ts
  19 | 
  20 | /**
  21 |  * @experimental
  22 |  * `toSSG` is an experimental feature.
  23 |  * The API might be changed.
  24 |  */
> 25 | export const toSSG: ToSSGAdaptorInterface = async (app, options) => {
  26 |   return baseToSSG(app, denoFileSystemModule, options)
  27 | }
  28 | 
```

---

## 14. `mcp-typescript-sdk/packages/server/src#strata:v1:vrmfx7`

2 location(s) in `mcp-typescript-sdk/packages/server/src`.

server/middleware/hostHeaderValidation.ts:40  (localhostAllowedHostnames)
```ts
  34 |     return { ok: true, hostname };
  35 | }
  36 | 
  37 | /**
  38 |  * Convenience allowlist for `localhost` DNS rebinding protection.
  39 |  */
> 40 | export function localhostAllowedHostnames(): string[] {
  41 |     return ['localhost', '127.0.0.1', '[::1]'];
  42 | }
  43 | 
  44 | /**
  45 |  * Web-standard `Request` helper for DNS rebinding protection.
  46 |  * @example
```

server/middleware/originValidation.ts:66  (localhostAllowedOrigins)
```ts
  60 | }
  61 | 
  62 | /**
  63 |  * Convenience allowlist of localhost-class origin hostnames, mirroring
  64 |  * `localhostAllowedHostnames`.
  65 |  */
> 66 | export function localhostAllowedOrigins(): string[] {
  67 |     return ['localhost', '127.0.0.1', '[::1]'];
  68 | }
  69 | 
  70 | /**
  71 |  * Web-standard `Request` helper for Origin validation: returns a `403` JSON-RPC
  72 |  * error response when the request's `Origin` header is not allowed, and
```

---

## 15. `next/packages/next/src#strata:v1:13vgy4k`

5 location(s) in `next/packages/next/src`.

client/components/concurrent-router-queue.ts:45  (push)
```ts
  39 |   _transitionTypes: string[] | undefined,
  40 |   _prefetchIntent: RouterTransitionPrefetchIntent | null
  41 | ): void {
  42 |   notImplemented()
  43 | }
  44 | 
> 45 | export function push(_href: string, _options?: NavigateOptions): void {
  46 |   notImplemented()
  47 | }
  48 | 
  49 | export function replace(_href: string, _options?: NavigateOptions): void {
  50 |   notImplemented()
  51 | }
```

client/components/concurrent-router-queue.ts:49  (replace)
```ts
  43 | }
  44 | 
  45 | export function push(_href: string, _options?: NavigateOptions): void {
  46 |   notImplemented()
  47 | }
  48 | 
> 49 | export function replace(_href: string, _options?: NavigateOptions): void {
  50 |   notImplemented()
  51 | }
  52 | 
  53 | export function traverse(
  54 |   _href: string,
  55 |   _historyState: AppHistoryState | undefined
```

client/components/concurrent-router-queue.ts:53  (traverse)
```ts
  47 | }
  48 | 
  49 | export function replace(_href: string, _options?: NavigateOptions): void {
  50 |   notImplemented()
  51 | }
  52 | 
> 53 | export function traverse(
  54 |   _href: string,
  55 |   _historyState: AppHistoryState | undefined
  56 | ): void {
  57 |   notImplemented()
  58 | }
  59 | 
```

client/components/concurrent-router-queue.ts:60  (restore)
```ts
  54 |   _href: string,
  55 |   _historyState: AppHistoryState | undefined
  56 | ): void {
  57 |   notImplemented()
  58 | }
  59 | 
> 60 | export function restore(
  61 |   _url: URL,
  62 |   _historyState: AppHistoryState | undefined
  63 | ): void {
  64 |   notImplemented()
  65 | }
  66 | 
```

Further locations: client/components/concurrent-router-queue.ts:76

---

## 16. `next/packages/next/src#strata:v1:16bz7j1`

2 location(s) in `next/packages/next/src`.

shared/lib/router/routes/app.ts:258  (parseNormalizedAppRoute)
```ts
  252 | }
  253 | 
  254 | /**
  255 |  * Parse an app route that has been fully normalized (no @slot or ()
  256 |  * group segments). Throws if either is present.
  257 |  */
> 258 | export function parseNormalizedAppRoute(pathname: string): NormalizedAppRoute {
  259 |   return parseAppRouteImpl(pathname, OnlyRoutableSegments) as NormalizedAppRoute
  260 | }
  261 | 
  262 | /**
  263 |  * Parse an app route that may contain @slot segments but not ()
  264 |  * group segments. Slot segments are preserved as parallel-route
```

shared/lib/router/routes/app.ts:268  (parseAppRouteWithSlots)
```ts
  262 | /**
  263 |  * Parse an app route that may contain @slot segments but not ()
  264 |  * group segments. Slot segments are preserved as parallel-route
  265 |  * type segments so callers can distinguish routes in different
  266 |  * parallel slots.
  267 |  */
> 268 | export function parseAppRouteWithSlots(pathname: string): AppRoute {
  269 |   return parseAppRouteImpl(pathname, AllowParallelSegments) as AppRoute
  270 | }
  271 | 
```

---

## 17. `next/packages/next/src#strata:v1:170w18b`

4 location(s) in `next/packages/next/src`.

build/turborepo-access-trace/types.ts:17  (FS)
```ts
  11 |  */
  12 | export type EnvVars = Set<string | Symbol>
  13 | 
  14 | /**
  15 |  * Tracks the file system paths that were accessed during the duration of the trace
  16 |  */
> 17 | export type FS = Set<string>
  18 | 
  19 | /**
  20 |  * Tracked Addr / Port pairs that were accessed during the duration of the trace
  21 |  */
  22 | export type Addresses = Array<Address>
  23 | 
```

build/webpack/loaders/next-root-params-loader.ts:13  (CollectedRootParams)
```ts
   7 | 
   8 | export type RootParamsLoaderOpts = {
   9 |   appDir: string
  10 |   pageExtensions: string[]
  11 | }
  12 | 
> 13 | type CollectedRootParams = Set<string>
  14 | 
  15 | const rootParamsLoader: webpack.LoaderDefinitionFunction<RootParamsLoaderOpts> =
  16 |   async function () {
  17 |     const { appDir, pageExtensions } = this.getOptions()
  18 | 
  19 |     const allRootParams = await collectRootParamsFromFileSystem({
```

server/dev/turbopack-utils.ts:126  (ReadyIds)
```ts
  120 | export type StartBuilding = (
  121 |   id: string,
  122 |   requestUrl: string | undefined,
  123 |   forceRebuild: boolean
  124 | ) => () => void
  125 | 
> 126 | export type ReadyIds = Set<string>
  127 | 
  128 | export type ClientState = {
  129 |   clientIssues: EntryIssuesMap
  130 |   messages: Map<string, HmrMessageSentToBrowser>
  131 |   turbopackUpdates: TurbopackUpdate[]
  132 |   subscriptions: Map<string, AsyncIterator<any>>
```

shared/lib/segment-cache/vary-params-decoding.ts:9  (VaryParams)
```ts
   3 |  *
   4 |  * This module is shared between server and client.
   5 |  */
   6 | 
   7 | import { readFulfilledValue } from '../rsc-transport'
   8 | 
>  9 | export type VaryParams = Set<string>
  10 | 
  11 | /**
  12 |  * Vary params are serialized into the Flight stream as an
  13 |  * `AsyncIterable<string>` that yields each accessed param name exactly once
  14 |  * (the server dedupes before emitting). Because each access is flushed into the
  15 |  * stream as it happens, there's no step at the end of the render that has to
```

---

## 18. `next/packages/next/src#strata:v1:1c5w08e`

2 location(s) in `next/packages/next/src`.

build/output/format.ts:44  (formatRevalidate)
```ts
  38 |     return `${value}${candidate.label}`
  39 |   }
  40 | 
  41 |   return `≈${Math.round(value)}${candidate.label}`
  42 | }
  43 | 
> 44 | export function formatRevalidate(cacheControl: CacheControl): string {
  45 |   const { revalidate } = cacheControl
  46 | 
  47 |   return revalidate ? humanReadableTimeRounded(revalidate) : ''
  48 | }
  49 | 
  50 | export function formatExpire(cacheControl: CacheControl): string {
```

build/output/format.ts:50  (formatExpire)
```ts
  44 | export function formatRevalidate(cacheControl: CacheControl): string {
  45 |   const { revalidate } = cacheControl
  46 | 
  47 |   return revalidate ? humanReadableTimeRounded(revalidate) : ''
  48 | }
  49 | 
> 50 | export function formatExpire(cacheControl: CacheControl): string {
  51 |   const { expire } = cacheControl
  52 | 
  53 |   return expire ? humanReadableTimeRounded(expire) : ''
  54 | }
  55 | 
```

---

## 19. `next/packages/next/src#strata:v1:1exfg5f`

2 location(s) in `next/packages/next/src`.

next-devtools/dev-overlay/icons/left-arrow.tsx:1  (LeftArrow)
```ts
> 1 | export function LeftArrow({
  2 |   title,
  3 |   className,
  4 | }: {
  5 |   title?: string
  6 |   className?: string
  7 | }) {
```

next-devtools/dev-overlay/icons/right-arrow.tsx:1  (RightArrow)
```ts
> 1 | export function RightArrow({
  2 |   title,
  3 |   className,
  4 | }: {
  5 |   title?: string
  6 |   className?: string
  7 | }) {
```

---

## 20. `next/packages/next/src#strata:v1:1i48id4`

2 location(s) in `next/packages/next/src`.

client/legacy/image.tsx:293  (isStaticRequire)
```ts
  287 | }
  288 | 
  289 | type StaticImport = StaticRequire | StaticImageData
  290 | 
  291 | type SafeNumber = number | `${number}`
  292 | 
> 293 | function isStaticRequire(
  294 |   src: StaticRequire | StaticImageData
  295 | ): src is StaticRequire {
  296 |   return (src as StaticRequire).default !== undefined
  297 | }
  298 | 
  299 | function isStaticImageData(
```

shared/lib/get-img-props.ts:124  (isStaticRequire)
```ts
  118 |     | 'backgroundPosition'
  119 |     | 'backgroundRepeat'
  120 |     | 'backgroundImage'
  121 |   >
  122 | >
  123 | 
> 124 | function isStaticRequire(
  125 |   src: StaticRequire | StaticImageData
  126 | ): src is StaticRequire {
  127 |   return (src as StaticRequire).default !== undefined
  128 | }
  129 | 
  130 | function isStaticImageData(
```

---

## 21. `next/packages/next/src#strata:v1:1l7lxej`

2 location(s) in `next/packages/next/src`.

build/webpack/plugins/next-types-plugin/index.ts:263  (formatRouteToRouteType)
```ts
  257 |   } as Record<
  258 |     'edge' | 'node' | 'extra',
  259 |     Record<'static' | 'dynamic', string[]>
  260 |   >,
  261 | })
  262 | 
> 263 | function formatRouteToRouteType(route: string) {
  264 |   const isDynamic = isDynamicRoute(route)
  265 |   if (isDynamic) {
  266 |     route = route
  267 |       .split('/')
  268 |       .map((part) => {
  269 |         if (part.startsWith('[') && part.endsWith(']')) {
```

server/lib/router-utils/typegen.ts:163  (formatRouteToRouteType)
```ts
  157 | 
  158 |   slotMap += '}\n'
  159 |   return slotMap
  160 | }
  161 | 
  162 | // Helper function to format routes to route types (matches the plugin logic exactly)
> 163 | function formatRouteToRouteType(route: string) {
  164 |   const isDynamic = isDynamicRoute(route)
  165 |   if (isDynamic) {
  166 |     route = route
  167 |       .split('/')
  168 |       .map((part) => {
  169 |         if (part.startsWith('[') && part.endsWith(']')) {
```

---

## 22. `next/packages/next/src#strata:v1:1qv7lct`

2 location(s) in `next/packages/next/src`.

server/app-render/entry-base.ts:88  (SegmentViewNode)
```ts
  82 | 
  83 | import type { NodeJsPartialHmrUpdate } from '../../build/swc/types'
  84 | import { workAsyncStorage } from '../app-render/work-async-storage.external'
  85 | import { workUnitAsyncStorage } from './work-unit-async-storage.external'
  86 | import { patchFetch as _patchFetch } from '../lib/patch-fetch'
  87 | 
> 88 | let SegmentViewNode: typeof import('../../next-devtools/userspace/app/segment-explorer-node').SegmentViewNode =
  89 |   () => null
  90 | let SegmentViewStateNode: typeof import('../../next-devtools/userspace/app/segment-explorer-node').SegmentViewStateNode =
  91 |   () => null
  92 | if (process.env.NODE_ENV === 'development') {
  93 |   const mod =
  94 |     require('../../next-devtools/userspace/app/segment-explorer-node') as typeof import('../../next-devtools/userspace/app/segment-explorer-node')
```

server/app-render/entry-base.ts:90  (SegmentViewStateNode)
```ts
  84 | import { workAsyncStorage } from '../app-render/work-async-storage.external'
  85 | import { workUnitAsyncStorage } from './work-unit-async-storage.external'
  86 | import { patchFetch as _patchFetch } from '../lib/patch-fetch'
  87 | 
  88 | let SegmentViewNode: typeof import('../../next-devtools/userspace/app/segment-explorer-node').SegmentViewNode =
  89 |   () => null
> 90 | let SegmentViewStateNode: typeof import('../../next-devtools/userspace/app/segment-explorer-node').SegmentViewStateNode =
  91 |   () => null
  92 | if (process.env.NODE_ENV === 'development') {
  93 |   const mod =
  94 |     require('../../next-devtools/userspace/app/segment-explorer-node') as typeof import('../../next-devtools/userspace/app/segment-explorer-node')
  95 |   SegmentViewNode = mod.SegmentViewNode
  96 |   SegmentViewStateNode = mod.SegmentViewStateNode
```

---

## 23. `next/packages/next/src#strata:v1:1rhhn1t`

2 location(s) in `next/packages/next/src`.

client/dev/hot-reloader/app/hot-reloader-app.tsx:109  (afterApplyUpdates)
```ts
  103 | }
  104 | 
  105 | // Webpack disallows updates in other states.
  106 | function canApplyUpdates() {
  107 |   return module.hot.status() === 'idle'
  108 | }
> 109 | function afterApplyUpdates(fn: any) {
  110 |   if (canApplyUpdates()) {
  111 |     fn()
  112 |   } else {
  113 |     function handler(status: any) {
  114 |       if (status === 'idle') {
  115 |         module.hot.removeStatusHandler(handler)
```

client/dev/hot-reloader/pages/hot-reloader-pages.ts:449  (afterApplyUpdates)
```ts
  443 | }
  444 | 
  445 | // Webpack disallows updates in other states.
  446 | function canApplyUpdates() {
  447 |   return module.hot.status() === 'idle'
  448 | }
> 449 | function afterApplyUpdates(fn: () => void) {
  450 |   if (canApplyUpdates()) {
  451 |     fn()
  452 |   } else {
  453 |     function handler(status: string) {
  454 |       if (status === 'idle') {
  455 |         module.hot.removeStatusHandler(handler)
```

---

## 24. `next/packages/next/src#strata:v1:1rhw95g`

2 location(s) in `next/packages/next/src`.

build/webpack/loaders/css-loader/src/utils.ts:176  (getURLType)
```ts
  170 |   return plugins
  171 | }
  172 | 
  173 | const IS_NATIVE_WIN32_PATH = /^[a-z]:[/\\]|^\\\\/i
  174 | const ABSOLUTE_SCHEME = /^[a-z0-9+\-.]+:/i
  175 | 
> 176 | function getURLType(source: string) {
  177 |   if (source[0] === '/') {
  178 |     if (source[1] === '/') {
  179 |       return 'scheme-relative'
  180 |     }
  181 | 
  182 |     return 'path-absolute'
```

build/webpack/loaders/postcss-loader/src/utils.ts:6  (getURLType)
```ts
   1 | import path from 'path'
   2 | 
   3 | const IS_NATIVE_WIN32_PATH = /^[a-z]:[/\\]|^\\\\/i
   4 | const ABSOLUTE_SCHEME = /^[a-z0-9+\-.]+:/i
   5 | 
>  6 | function getURLType(source: string) {
   7 |   if (source[0] === '/') {
   8 |     if (source[1] === '/') {
   9 |       return 'scheme-relative'
  10 |     }
  11 | 
  12 |     return 'path-absolute'
```

---

## 25. `next/packages/next/src#strata:v1:1vthgdd`

3 location(s) in `next/packages/next/src`.

server/next.ts:63  (RequestHandler)
```ts
  57 |   /** Selects Turbopack as the bundler */
  58 |   turbopack?: boolean
  59 |   /** Selects Webpack as the bundler */
  60 |   webpack?: boolean
  61 | }
  62 | 
> 63 | export type RequestHandler = (
  64 |   req: IncomingMessage,
  65 |   res: ServerResponse,
  66 |   parsedUrl?: NextUrlWithParsedQuery | undefined
  67 | ) => Promise<void>
  68 | 
  69 | export type UpgradeHandler = (
```

server/next.ts:69  (UpgradeHandler)
```ts
  63 | export type RequestHandler = (
  64 |   req: IncomingMessage,
  65 |   res: ServerResponse,
  66 |   parsedUrl?: NextUrlWithParsedQuery | undefined
  67 | ) => Promise<void>
  68 | 
> 69 | export type UpgradeHandler = (
  70 |   req: IncomingMessage,
  71 |   socket: Duplex,
  72 |   head: Buffer
  73 | ) => Promise<void>
  74 | 
  75 | const SYMBOL_LOAD_CONFIG = Symbol('next.load_config')
```

shared/lib/router/router.ts:417  (Subscription)
```ts
  411 | 
  412 | export type AppProps = Pick<CompletePrivateRouteInfo, 'Component' | 'err'> & {
  413 |   router: Router
  414 | } & Record<string, any>
  415 | export type AppComponent = ComponentType<AppProps>
  416 | 
> 417 | type Subscription = (
  418 |   data: PrivateRouteInfo,
  419 |   App: AppComponent,
  420 |   resetScroll: { x: number; y: number } | null
  421 | ) => Promise<void>
  422 | 
  423 | type BeforePopStateCallback = (state: NextHistoryState) => boolean
```

---

## 26. `next/packages/next/src#strata:v1:1wbxbug`

2 location(s) in `next/packages/next/src`.

server/dev/middleware-turbopack.ts:29  (shouldIgnorePath)
```ts
  23 |   findApplicableSourceMapPayload,
  24 | } from '../lib/source-maps'
  25 | import { findSourceMap, type SourceMap } from 'node:module'
  26 | import { fileURLToPath, pathToFileURL } from 'node:url'
  27 | import { inspect } from 'node:util'
  28 | 
> 29 | function shouldIgnorePath(modulePath: string): boolean {
  30 |   return (
  31 |     modulePath.includes('node_modules') ||
  32 |     // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
  33 |     modulePath.includes('next/dist') ||
  34 |     modulePath.startsWith('node:')
  35 |   )
```

server/dev/middleware-webpack.ts:36  (shouldIgnoreSource)
```ts
  30 |   RawSourceMap,
  31 | } from 'next/dist/compiled/source-map08'
  32 | import { formatStackFrameFile } from '../../next-devtools/shared/webpack-module-path'
  33 | import type { MappedPosition } from 'source-map'
  34 | import { inspect } from 'util'
  35 | 
> 36 | function shouldIgnoreSource(sourceURL: string): boolean {
  37 |   return (
  38 |     sourceURL.includes('node_modules') ||
  39 |     // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
  40 |     sourceURL.includes('next/dist') ||
  41 |     sourceURL.startsWith('node:')
  42 |   )
```

---

## 27. `next/packages/next/src#strata:v1:1xdl6wh`

3 location(s) in `next/packages/next/src`.

next-devtools/dev-overlay/components/errors/dev-tools-indicator/dev-tools-info/shortcut-recorder.tsx:324  (IconCross)
```ts
  318 | 
  319 |   return (
  320 |     <span style={{ minWidth: '1em', display: 'inline-block' }}>{label}</span>
  321 |   )
  322 | }
  323 | 
> 324 | function IconCross() {
  325 |   return (
  326 |     <svg height="16" strokeLinejoin="round" viewBox="0 0 16 16" width="16">
  327 |       <path
  328 |         fillRule="evenodd"
  329 |         clipRule="evenodd"
  330 |         d="M12.4697 13.5303L13 14.0607L14.0607 13L13.5303 12.4697L9.06065 7.99999L13.5303 3.53032L14.0607 2.99999L13 1.93933L12.4697 2.46966L7.99999 6.93933L3.53032 2.46966L2.99999 1.93933L1.93933 2.99999L2.46966 3.53032L6.93933 7.99999L2.46966 12.4697L1.93933 13L2.99999 14.0607L3.53032 13.5303L7.99999 9.06065L12.4697 13.5303Z"
```

next-devtools/dev-overlay/icons/eye-icon.tsx:1  (EyeIcon)
```ts
> 1 | export default function EyeIcon() {
  2 |   return (
  3 |     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none">
  4 |       <path
  5 |         fill="currentColor"
  6 |         fillRule="evenodd"
  7 |         d="m.191 2.063.56.498 13.5 12 .561.498.997-1.121-.56-.498-1.81-1.608 2.88-3.342v-.98l-3.204-3.72C10.645.923 6.365.686 3.594 3.08L1.748 1.44 1.188.94.19 2.063ZM14.761 8l-2.442 2.836-1.65-1.466a3.001 3.001 0 0 0-4.342-3.86l-1.6-1.422a5.253 5.253 0 0 1 7.251.682L14.76 8ZM7.526 6.576l1.942 1.727a1.499 1.499 0 0 0-1.942-1.727Zm-7.845.935 1.722-2 1.137.979L1.24 8l2.782 3.23A5.25 5.25 0 0 0 9.9 12.703l.54 1.4a6.751 6.751 0 0 1-7.555-1.892L-.318 8.49v-.98Z"
```

next-devtools/dev-overlay/icons/file.tsx:76  (File)
```ts
  70 |         fillRule="evenodd"
  71 |       />
  72 |     </svg>
  73 |   )
  74 | }
  75 | 
> 76 | function File() {
  77 |   return (
  78 |     <svg width="16" height="17" fill="none" xmlns="http://www.w3.org/2000/svg">
  79 |       <path
  80 |         fillRule="evenodd"
  81 |         clipRule="evenodd"
  82 |         d="M14.5 7v7a2.5 2.5 0 0 1-2.5 2.5H4A2.5 2.5 0 0 1 1.5 14V.5h7.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V7zM13 7v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2h5v5h5zM9.5 2.621V5.5h2.879L9.5 2.621z"
```

---

## 28. `next/packages/next/src#strata:v1:967hau`

2 location(s) in `next/packages/next/src`.

next-devtools/dev-overlay/icons/copy-prompt.tsx:1  (CopyPromptIcon)
```ts
> 1 | export function CopyPromptIcon(props: React.SVGProps<SVGSVGElement>) {
  2 |   return (
  3 |     <svg
  4 |       xmlns="http://www.w3.org/2000/svg"
  5 |       width="16"
  6 |       height="16"
  7 |       viewBox="0 0 16 16"
```

next-devtools/dev-overlay/icons/external.tsx:21  (SourceMappingErrorIcon)
```ts
  15 |         d="M11.5 9.75V11.25C11.5 11.3881 11.3881 11.5 11.25 11.5H4.75C4.61193 11.5 4.5 11.3881 4.5 11.25L4.5 4.75C4.5 4.61193 4.61193 4.5 4.75 4.5H6.25H7V3H6.25H4.75C3.7835 3 3 3.7835 3 4.75V11.25C3 12.2165 3.7835 13 4.75 13H11.25C12.2165 13 13 12.2165 13 11.25V9.75V9H11.5V9.75ZM8.5 3H9.25H12.2495C12.6637 3 12.9995 3.33579 12.9995 3.75V6.75V7.5H11.4995V6.75V5.56066L8.53033 8.52978L8 9.06011L6.93934 7.99945L7.46967 7.46912L10.4388 4.5H9.25H8.5V3Z"
  16 |       />
  17 |     </svg>
  18 |   )
  19 | }
  20 | 
> 21 | export function SourceMappingErrorIcon(props: React.SVGProps<SVGSVGElement>) {
  22 |   return (
  23 |     <svg
  24 |       xmlns="http://www.w3.org/2000/svg"
  25 |       width="16"
  26 |       height="16"
  27 |       viewBox="0 0 16 16"
```

---

## 29. `next/packages/next/src#strata:v1:gybdzc`

16 location(s) in `next/packages/next/src`.

build/analysis/extract-const-value.ts:22  (isExportDeclaration)
```ts
  16 |   TsConstAssertion,
  17 |   TsTypeAssertion,
  18 |   TsSatisfiesExpression,
  19 |   VariableDeclaration,
  20 | } from '@swc/core'
  21 | 
> 22 | function isExportDeclaration(node: Node): node is ExportDeclaration {
  23 |   return node.type === 'ExportDeclaration'
  24 | }
  25 | 
  26 | function isVariableDeclaration(node: Node): node is VariableDeclaration {
  27 |   return node.type === 'VariableDeclaration'
  28 | }
```

build/analysis/extract-const-value.ts:26  (isVariableDeclaration)
```ts
  20 | } from '@swc/core'
  21 | 
  22 | function isExportDeclaration(node: Node): node is ExportDeclaration {
  23 |   return node.type === 'ExportDeclaration'
  24 | }
  25 | 
> 26 | function isVariableDeclaration(node: Node): node is VariableDeclaration {
  27 |   return node.type === 'VariableDeclaration'
  28 | }
  29 | 
  30 | function isIdentifier(node: Node): node is Identifier {
  31 |   return node.type === 'Identifier'
  32 | }
```

build/analysis/extract-const-value.ts:30  (isIdentifier)
```ts
  24 | }
  25 | 
  26 | function isVariableDeclaration(node: Node): node is VariableDeclaration {
  27 |   return node.type === 'VariableDeclaration'
  28 | }
  29 | 
> 30 | function isIdentifier(node: Node): node is Identifier {
  31 |   return node.type === 'Identifier'
  32 | }
  33 | 
  34 | function isBooleanLiteral(node: Node): node is BooleanLiteral {
  35 |   return node.type === 'BooleanLiteral'
  36 | }
```

build/analysis/extract-const-value.ts:34  (isBooleanLiteral)
```ts
  28 | }
  29 | 
  30 | function isIdentifier(node: Node): node is Identifier {
  31 |   return node.type === 'Identifier'
  32 | }
  33 | 
> 34 | function isBooleanLiteral(node: Node): node is BooleanLiteral {
  35 |   return node.type === 'BooleanLiteral'
  36 | }
  37 | 
  38 | function isNullLiteral(node: Node): node is NullLiteral {
  39 |   return node.type === 'NullLiteral'
  40 | }
```

Further locations: build/analysis/extract-const-value.ts:38, build/analysis/extract-const-value.ts:42, build/analysis/extract-const-value.ts:46, build/analysis/extract-const-value.ts:50, build/analysis/extract-const-value.ts:54, build/analysis/extract-const-value.ts:58, build/analysis/extract-const-value.ts:62, build/analysis/extract-const-value.ts:66, build/analysis/extract-const-value.ts:70, build/analysis/extract-const-value.ts:74, build/analysis/extract-const-value.ts:78, build/analysis/extract-const-value.ts:82

---

## 30. `next/packages/next/src#strata:v1:uunywm`

3 location(s) in `next/packages/next/src`.

server/dynamic-rendering-utils.ts:13  (isHangingPromiseRejectionError)
```ts
   7 |   WorkUnitStore,
   8 | } from './app-render/work-unit-async-storage.external'
   9 | import { workUnitAsyncStorage } from './app-render/work-unit-async-storage.external'
  10 | import { getServerReact, getClientReact } from './runtime-reacts.external'
  11 | import { ReflectAdapter } from './web/spec-extension/adapters/reflect'
  12 | 
> 13 | export function isHangingPromiseRejectionError(
  14 |   err: unknown
  15 | ): err is HangingPromiseRejectionError {
  16 |   if (typeof err !== 'object' || err === null || !('digest' in err)) {
  17 |     return false
  18 |   }
  19 | 
```

server/dynamic-rendering-utils.ts:55  (isClientHookDynamicError)
```ts
  49 |         `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
  50 |         `Learn more: https://nextjs.org/docs/messages/blocking-prerender-client-hook`
  51 |     )
  52 |   }
  53 | }
  54 | 
> 55 | export function isClientHookDynamicError(
  56 |   err: unknown
  57 | ): err is ClientHookDynamicError {
  58 |   if (typeof err !== 'object' || err === null || !('digest' in err)) {
  59 |     return false
  60 |   }
  61 | 
```

shared/lib/lazy-dynamic/bailout-to-csr.ts:14  (isBailoutToCSRError)
```ts
   8 |   constructor(public readonly reason: string) {
   9 |     super(`Bail out to client-side rendering: ${reason}`)
  10 |   }
  11 | }
  12 | 
  13 | /** Checks if a passed argument is an error that is thrown if we want to bail out to client-side rendering. */
> 14 | export function isBailoutToCSRError(err: unknown): err is BailoutToCSRError {
  15 |   if (typeof err !== 'object' || err === null || !('digest' in err)) {
  16 |     return false
  17 |   }
  18 | 
  19 |   return err.digest === BAILOUT_TO_CSR
  20 | }
```

---

## 31. `next/packages/next/src#strata:v1:v16ysq`

2 location(s) in `next/packages/next/src`.

next-devtools/dev-overlay/components/copy-button/index.tsx:183  (CopySuccessIcon)
```ts
  177 |         fill="currentColor"
  178 |       />
  179 |     </svg>
  180 |   )
  181 | }
  182 | 
> 183 | function CopySuccessIcon() {
  184 |   return (
  185 |     <svg
  186 |       height="16"
  187 |       xlinkTitle="copied"
  188 |       viewBox="0 0 16 16"
  189 |       width="16"
```

next-devtools/dev-overlay/components/instant-navs/instant-navs-panel.tsx:430  (PlayIcon)
```ts
  424 |         clipRule="evenodd"
  425 |       ></path>
  426 |     </svg>
  427 |   )
  428 | }
  429 | 
> 430 | function PlayIcon() {
  431 |   return (
  432 |     <svg
  433 |       xmlns="http://www.w3.org/2000/svg"
  434 |       viewBox="0 0 20 20"
  435 |       fill="currentColor"
  436 |       width="12"
```

---

## 32. `next/packages/next/src#strata:v1:v2ugnw`

10 location(s) in `next/packages/next/src`.

client/components/builtin/default-null.tsx:4  (ParallelRouteDefaultNull)
```ts
  1 | export const PARALLEL_ROUTE_DEFAULT_NULL_PATH =
  2 |   'next/dist/client/components/builtin/default-null.js'
  3 | 
> 4 | export default function ParallelRouteDefaultNull() {
  5 |   return null
  6 | }
  7 | 
```

client/components/builtin/empty-stub.tsx:1  (Empty)
```ts
> 1 | export default function Empty() {
  2 |   return null
  3 | }
  4 | 
```

client/components/noop-head.tsx:1  (NoopHead)
```ts
> 1 | export default function NoopHead() {
  2 |   return null
  3 | }
  4 | 
```

client/components/segment-cache/navigation-testing-lock.disabled.ts:26  (getPreLockFetch)
```ts
  20 | 
  21 | export type {
  22 |   NavigationLockPrefetch,
  23 |   NavigationLockState,
  24 | } from './navigation-testing-lock'
  25 | 
> 26 | export function getPreLockFetch(): typeof fetch | null {
  27 |   return null
  28 | }
  29 | 
  30 | export function beginNavigationLockPrefetch(): NavigationLockPrefetch | null {
  31 |   return null
  32 | }
```

Further locations: client/components/segment-cache/navigation-testing-lock.disabled.ts:30, client/components/segment-cache/navigation-testing-lock.disabled.ts:34, client/components/segment-cache/navigation-testing-lock.disabled.ts:53, client/components/segment-cache/navigation-testing-lock.disabled.ts:57, next-devtools/dev-overlay.browser.tsx:346, next-devtools/dev-overlay/dev-overlay.stories.tsx:37

---

## 33. `next/packages/next/src#strata:v1:zjp3l6`

2 location(s) in `next/packages/next/src`.

build/swc/loaderWorkerPool.ts:5  (getPoolId)
```ts
   1 | import { Worker } from 'worker_threads'
   2 | 
   3 | const loaderWorkers: Record<string, Map<number, Worker>> = {}
   4 | 
>  5 | function getPoolId(cwd: string, filename: string) {
   6 |   return `${cwd}:${filename}`
   7 | }
   8 | 
   9 | export async function runLoaderWorkerPool(
  10 |   bindings: typeof import('./generated-native'),
  11 |   bindingPath: string
```

build/webpack/utils.ts:92  (formatBarrelOptimizedResource)
```ts
  86 |     }
  87 | 
  88 |     callback({ name, entryModule })
  89 |   }
  90 | }
  91 | 
> 92 | export function formatBarrelOptimizedResource(
  93 |   resource: string,
  94 |   matchResource: string
  95 | ) {
  96 |   return `${resource}@${matchResource}`
  97 | }
  98 | 
```

---

## 34. `vercel-ai/packages/ai/src#strata:v1:170wdp8`

2 location(s) in `vercel-ai/packages/ai/src`.

model/as-reranking-model-v4.ts:3  (asRerankingModelV4)
```ts
  1 | import type { RerankingModelV3, RerankingModelV4 } from '@ai-sdk/provider';
  2 | 
> 3 | export function asRerankingModelV4(
  4 |   model: RerankingModelV3 | RerankingModelV4,
  5 | ): RerankingModelV4 {
  6 |   if (model.specificationVersion === 'v4') {
  7 |     return model;
  8 |   }
  9 | 
```

model/as-video-model-v4.ts:6  (asVideoModelV4)
```ts
   1 | import type {
   2 |   Experimental_VideoModelV3,
   3 |   Experimental_VideoModelV4,
   4 | } from '@ai-sdk/provider';
   5 | 
>  6 | export function asVideoModelV4(
   7 |   model: Experimental_VideoModelV3 | Experimental_VideoModelV4,
   8 | ): Experimental_VideoModelV4 {
   9 |   if (model.specificationVersion === 'v4') {
  10 |     return model;
  11 |   }
  12 | 
```

---

## 35. `workers-sdk/packages/miniflare/src#strata:v1:1s3g3l7`

2 location(s) in `workers-sdk/packages/miniflare/src`.

workers/r2/s3/auth.worker.ts:59  (invalidArgument)
```ts
  53 | 	return encodeURIComponent(value).replace(
  54 | 		/[!'()*]/g,
  55 | 		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  56 | 	);
  57 | }
  58 | 
> 59 | const invalidArgument = (message: string) =>
  60 | 	errorResponse(400, "InvalidArgument", message);
  61 | 
  62 | const unauthorized = () => errorResponse(401, "Unauthorized", "Unauthorized");
  63 | 
  64 | function byteDump(value: string): string {
  65 | 	return Array.from(encoder.encode(value), (byte) =>
```

workers/r2/s3/errors.worker.ts:39  (notImplemented)
```ts
  33 | 	});
  34 | }
  35 | 
  36 | export const noSuchBucket = () =>
  37 | 	errorResponse(404, "NoSuchBucket", "The specified bucket does not exist.");
  38 | 
> 39 | export const notImplemented = (message: string) =>
  40 | 	errorResponse(501, "NotImplemented", message);
  41 | 
  42 | export const routeNotFound = () =>
  43 | 	errorResponse(404, "RouteNotFound", "No route matches this url.");
  44 | 
```

---

## 36. `workers-sdk/packages/miniflare/src#strata:v1:4xb6fc`

4 location(s) in `workers-sdk/packages/miniflare/src`.

workers/r2/schemas.worker.ts:270  (InternalR2GetOptions)
```ts
  264 | 	R2AbortMultipartUploadRequestSchema,
  265 | 	R2ListRequestSchema,
  266 | 	R2DeleteRequestSchema,
  267 | ]);
  268 | 
  269 | export type OmitRequest<T> = Omit<T, "method" | "object">;
> 270 | export type InternalR2GetOptions = OmitRequest<
  271 | 	z.infer<typeof R2GetRequestSchema>
  272 | >;
  273 | export type InternalR2PutOptions = OmitRequest<
  274 | 	z.infer<typeof R2PutRequestSchema>
  275 | >;
  276 | export type InternalR2ListOptions = OmitRequest<
```

workers/r2/schemas.worker.ts:273  (InternalR2PutOptions)
```ts
  267 | ]);
  268 | 
  269 | export type OmitRequest<T> = Omit<T, "method" | "object">;
  270 | export type InternalR2GetOptions = OmitRequest<
  271 | 	z.infer<typeof R2GetRequestSchema>
  272 | >;
> 273 | export type InternalR2PutOptions = OmitRequest<
  274 | 	z.infer<typeof R2PutRequestSchema>
  275 | >;
  276 | export type InternalR2ListOptions = OmitRequest<
  277 | 	z.infer<typeof R2ListRequestSchema>
  278 | >;
  279 | export type InternalR2CreateMultipartUploadOptions = OmitRequest<
```

workers/r2/schemas.worker.ts:276  (InternalR2ListOptions)
```ts
  270 | export type InternalR2GetOptions = OmitRequest<
  271 | 	z.infer<typeof R2GetRequestSchema>
  272 | >;
  273 | export type InternalR2PutOptions = OmitRequest<
  274 | 	z.infer<typeof R2PutRequestSchema>
  275 | >;
> 276 | export type InternalR2ListOptions = OmitRequest<
  277 | 	z.infer<typeof R2ListRequestSchema>
  278 | >;
  279 | export type InternalR2CreateMultipartUploadOptions = OmitRequest<
  280 | 	z.infer<typeof R2CreateMultipartUploadRequestSchema>
  281 | >;
  282 | 
```

workers/r2/schemas.worker.ts:279  (InternalR2CreateMultipartUploadOptions)
```ts
  273 | export type InternalR2PutOptions = OmitRequest<
  274 | 	z.infer<typeof R2PutRequestSchema>
  275 | >;
  276 | export type InternalR2ListOptions = OmitRequest<
  277 | 	z.infer<typeof R2ListRequestSchema>
  278 | >;
> 279 | export type InternalR2CreateMultipartUploadOptions = OmitRequest<
  280 | 	z.infer<typeof R2CreateMultipartUploadRequestSchema>
  281 | >;
  282 | 
  283 | export interface R2ErrorResponse {
  284 | 	version: number;
  285 | 	v4code: number;
```

---

## 37. `workers-sdk/packages/miniflare/src#strata:v1:56ds47`

5 location(s) in `workers-sdk/packages/miniflare/src`.

workers/local-explorer/resources/do.ts:132  (ListObjectsQuery)
```ts
  126 | 		result_info: {
  127 | 			count: allNamespaces.length,
  128 | 		},
  129 | 	});
  130 | }
  131 | 
> 132 | type ListObjectsQuery = NonNullable<
  133 | 	z.output<typeof zDurableObjectsNamespaceListObjectsData>["query"]
  134 | >;
  135 | 
  136 | /**
  137 |  * List Durable Objects in a namespace
  138 |  *
```

workers/local-explorer/resources/kv.ts:86  (ListNamespacesQuery)
```ts
  80 | }
  81 | 
  82 | // ============================================================================
  83 | // API Handlers
  84 | // ============================================================================
  85 | 
> 86 | type ListNamespacesQuery = NonNullable<
  87 | 	z.output<typeof zWorkersKvNamespaceListNamespacesData>["query"]
  88 | >;
  89 | 
  90 | /**
  91 |  * List all KV namespaces across all connected instances.
  92 |  *
```

workers/local-explorer/resources/kv.ts:137  (ListKeysQuery)
```ts
  131 | 		result_info: {
  132 | 			count: allNamespaces.length,
  133 | 		},
  134 | 	});
  135 | }
  136 | 
> 137 | type ListKeysQuery = NonNullable<
  138 | 	z.output<typeof zWorkersKvNamespaceListANamespaceSKeysData>["query"]
  139 | >;
  140 | /**
  141 |  * List a Namespace's Keys
  142 |  *
  143 |  * This endpoint keeps pagination as-is since it operates on a single namespace.
```

workers/local-explorer/resources/r2.ts:115  (ListObjectsQuery)
```ts
  109 | 		result_info: {
  110 | 			count: allBuckets.length,
  111 | 		},
  112 | 	});
  113 | }
  114 | 
> 115 | type ListObjectsQuery = NonNullable<
  116 | 	z.output<typeof zR2BucketListObjectsData>["query"]
  117 | >;
  118 | 
  119 | /**
  120 |  * List objects in an R2 bucket with optional directory navigation.
  121 |  *
```

Further locations: workers/local-explorer/resources/workflows.ts:374

---

## 38. `workers-sdk/packages/wrangler/src#strata:v1:10e0jwi`

4 location(s) in `workers-sdk/packages/wrangler/src`.

pipelines/client.ts:122  (createStream)
```ts
  116 | 		searchParams
  117 | 	);
  118 | 
  119 | 	return response;
  120 | }
  121 | 
> 122 | export async function createStream(
  123 | 	config: Config,
  124 | 	streamConfig: CreateStreamRequest
  125 | ): Promise<Stream> {
  126 | 	const accountId = await requireAuth(config);
  127 | 
  128 | 	const response = await fetchResult<Stream>(
```

pipelines/client.ts:204  (createSink)
```ts
  198 | 		{
  199 | 			method: "DELETE",
  200 | 		}
  201 | 	);
  202 | }
  203 | 
> 204 | export async function createSink(
  205 | 	config: Config,
  206 | 	sinkConfig: CreateSinkRequest
  207 | ): Promise<Sink> {
  208 | 	const accountId = await requireAuth(config);
  209 | 
  210 | 	const response = await fetchResult<Sink>(
```

pipelines/client.ts:257  (createPipeline)
```ts
  251 | 		{
  252 | 			method: "DELETE",
  253 | 		}
  254 | 	);
  255 | }
  256 | 
> 257 | export async function createPipeline(
  258 | 	config: Config,
  259 | 	pipelineConfig: CreatePipelineRequest
  260 | ): Promise<Pipeline> {
  261 | 	const accountId = await requireAuth(config);
  262 | 
  263 | 	const response = await fetchResult<Pipeline>(
```

pipelines/client.ts:278  (validateSql)
```ts
  272 | 		}
  273 | 	);
  274 | 
  275 | 	return response;
  276 | }
  277 | 
> 278 | export async function validateSql(
  279 | 	config: Config,
  280 | 	sqlRequest: ValidateSqlRequest
  281 | ): Promise<ValidateSqlResponse["result"]> {
  282 | 	const accountId = await requireAuth(config);
  283 | 
  284 | 	const response = await fetchResult<ValidateSqlResponse["result"]>(
```

---

## 39. `workers-sdk/packages/wrangler/src#strata:v1:13vju9r`

6 location(s) in `workers-sdk/packages/wrangler/src`.

ai-search/client.ts:24  (baseInstanceUrl)
```ts
  18 | export const DEFAULT_NAMESPACE = "default";
  19 | 
  20 | function baseNamespaceUrl(accountId: string): string {
  21 | 	return `/accounts/${accountId}/ai-search/namespaces`;
  22 | }
  23 | 
> 24 | function baseInstanceUrl(accountId: string, namespace: string): string {
  25 | 	return `${baseNamespaceUrl(accountId)}/${namespace}/instances`;
  26 | }
  27 | 
  28 | function baseTokenUrl(accountId: string): string {
  29 | 	return `/accounts/${accountId}/ai-search/tokens`;
  30 | }
```

artifacts/client.ts:17  (getArtifactsNamespacePath)
```ts
  11 | import type { Config } from "@cloudflare/workers-utils";
  12 | 
  13 | function getArtifactsNamespacesPath(accountId: string): string {
  14 | 	return `/accounts/${accountId}/artifacts/namespaces`;
  15 | }
  16 | 
> 17 | function getArtifactsNamespacePath(
  18 | 	accountId: string,
  19 | 	namespace: string
  20 | ): string {
  21 | 	return `${getArtifactsNamespacesPath(accountId)}/${encodeURIComponent(namespace)}`;
  22 | }
  23 | 
```

deployment-bundle/auto-provisioned-name.ts:4  (autoProvisionedResourceName)
```ts
   1 | /**
   2 |  * The resource name that auto-provisioning will create for a given binding.
   3 |  */
>  4 | export function autoProvisionedResourceName(
   5 | 	scriptName: string,
   6 | 	bindingName: string
   7 | ): string {
   8 | 	return `${scriptName}-${bindingName.toLowerCase().replaceAll("_", "-")}`;
   9 | }
  10 | 
```

deployment-bundle/source-url.ts:4  (withSourceURL)
```ts
   1 | import { pathToFileURL } from "node:url";
   2 | import type { CfModule } from "@cloudflare/workers-utils";
   3 | 
>  4 | function withSourceURL(source: string, sourcePath: string) {
   5 | 	return `${source}\n//# sourceURL=${pathToFileURL(sourcePath)}`;
   6 | }
   7 | 
   8 | /**
   9 |  * Adds `//# sourceURL` comments so V8 knows where source files are on disk.
  10 |  * These URLs are returned in `Debugger.scriptParsed` events, ensuring inspector
```

Further locations: pages/errors.ts:47, tail/createTail.ts:38

---

## 40. `workers-sdk/packages/wrangler/src#strata:v1:1be2oxp`

3 location(s) in `workers-sdk/packages/wrangler/src`.

r2/helpers/catalog.ts:74  (R2CatalogCompactionResponse)
```ts
  68 | 	state: "enabled" | "disabled";
  69 | 
  70 | 	// If undefined, the service will set the default value
  71 | 	targetSizeMb?: number;
  72 | };
  73 | 
> 74 | type R2CatalogCompactionResponse = {
  75 | 	success: boolean;
  76 | };
  77 | 
  78 | /**
  79 |  * Enable compaction maintenance configuration for a table in the R2 catalog
  80 |  */
```

r2/helpers/catalog.ts:117  (R2CatalogSnapshotExpirationResponse)
```ts
  111 | 	max_snapshot_age?: string;
  112 | 
  113 | 	// If undefined, the service will set the default value
  114 | 	min_snapshots_to_keep?: number;
  115 | };
  116 | 
> 117 | type R2CatalogSnapshotExpirationResponse = {
  118 | 	success: boolean;
  119 | };
  120 | 
  121 | export async function enableR2CatalogSnapshotExpiration(
  122 | 	complianceConfig: ComplianceConfig,
  123 | 	accountId: string,
```

r2/helpers/catalog.ts:200  (R2CatalogCredentialResponse)
```ts
  194 | 				"Content-Type": "application/json",
  195 | 			},
  196 | 		}
  197 | 	);
  198 | }
  199 | 
> 200 | type R2CatalogCredentialResponse = {
  201 | 	success: boolean;
  202 | };
  203 | 
  204 | /**
  205 |  * Sets a Cloudflare token which R2 Data Catalog uses for async table maintenance
  206 |  * jobs (such as file compaction), where it needs direct access to the customer's R2 bucket.
```

---

## 41. `workers-sdk/packages/wrangler/src#strata:v1:1g2bguq`

3 location(s) in `workers-sdk/packages/wrangler/src`.

r2/helpers/catalog.ts:28  (R2WarehouseEnableResponse)
```ts
  22 | 		{
  23 | 			method: "GET",
  24 | 		}
  25 | 	);
  26 | }
  27 | 
> 28 | type R2WarehouseEnableResponse = {
  29 | 	id: string;
  30 | 	name: string;
  31 | };
  32 | 
  33 | /**
  34 |  * Activate the R2 bucket as an Iceberg warehouse
```

user/shared.ts:4  (Account)
```ts
  1 | /**
  2 |  * Details for one of the user's accounts
  3 |  */
> 4 | export type Account = { id: string; name: string };
  5 | 
```

user/whoami.ts:357  (AccountInfo)
```ts
  351 | 		} else {
  352 | 			throw e;
  353 | 		}
  354 | 	}
  355 | }
  356 | 
> 357 | type AccountInfo = { name: string; id: string };
  358 | 
  359 | async function getAccounts(
  360 | 	complianceConfig: ComplianceConfig
  361 | ): Promise<AccountInfo[]> {
  362 | 	// Use the shared intersection helper so that `whoami` uses the same approach as
  363 | 	// the interactive `Select an account` prompt (and the non-interactive 'no account ID' error message)
```

---

## 42. `workers-sdk/packages/wrangler/src#strata:v1:1hxacme`

3 location(s) in `workers-sdk/packages/wrangler/src`.

pipelines/types.ts:36  (PipelineListResponse)
```ts
  30 | 	success: boolean;
  31 | 	errors: string[];
  32 | 	messages: string[];
  33 | 	result: T;
  34 | }
  35 | 
> 36 | export interface PipelineListResponse extends CloudflareAPIResponse<
  37 | 	Pipeline[]
  38 | > {
  39 | 	result_info: PaginationInfo;
  40 | }
  41 | 
  42 | export interface CreatePipelineRequest {
```

pipelines/types.ts:107  (StreamListResponse)
```ts
  101 | 	};
  102 | 	worker_binding: {
  103 | 		enabled: boolean;
  104 | 	};
  105 | }
  106 | 
> 107 | export interface StreamListResponse extends CloudflareAPIResponse<Stream[]> {
  108 | 	result_info: PaginationInfo;
  109 | }
  110 | 
  111 | export interface ListStreamsParams {
  112 | 	page?: number;
  113 | 	per_page?: number;
```

pipelines/types.ts:196  (SinkListResponse)
```ts
  190 | 	};
  191 | 	used_by?: Array<{
  192 | 		href: string;
  193 | 	}>;
  194 | };
  195 | 
> 196 | export interface SinkListResponse extends CloudflareAPIResponse<Sink[]> {
  197 | 	result_info: PaginationInfo;
  198 | }
  199 | 
  200 | export interface ListSinksParams {
  201 | 	page?: number;
  202 | 	per_page?: number;
```

---

## 43. `workers-sdk/packages/wrangler/src#strata:v1:1rwbk5v`

2 location(s) in `workers-sdk/packages/wrangler/src`.

cloudchamber/apply.ts:236  (convertContainerAffinitiesForApi)
```ts
  230 | 	return configuration;
  231 | }
  232 | 
  233 | /**
  234 |  * Perform type conversion of affinities so that they can be fed to the API.
  235 |  */
> 236 | function convertContainerAffinitiesForApi(
  237 | 	container: ContainerApp
  238 | ): ApplicationAffinities | undefined {
  239 | 	if (container.affinities === undefined) {
  240 | 		return undefined;
  241 | 	}
  242 | 
```

containers/config.ts:28  (convertContainerAffinitiesForApi)
```ts
  22 | import type { ApplicationAffinityHardwareGeneration } from "@cloudflare/containers-shared/src/client/models/ApplicationAffinityHardwareGeneration";
  23 | import type { Config, ContainerApp } from "@cloudflare/workers-utils";
  24 | 
  25 | /**
  26 |  * Perform type conversion of affinities so that they can be fed to the API.
  27 |  */
> 28 | function convertContainerAffinitiesForApi(
  29 | 	container: ContainerApp
  30 | ): ApplicationAffinities | undefined {
  31 | 	if (container.affinities === undefined) {
  32 | 		return undefined;
  33 | 	}
  34 | 
```

---

## 44. `workers-sdk/packages/wrangler/src#strata:v1:1sngedz`

2 location(s) in `workers-sdk/packages/wrangler/src`.

kv/helpers.ts:140  (updateKVNamespace)
```ts
  134 | 
  135 | /**
  136 |  * Update a KV namespace title under the given `accountId` with the given `namespaceId`.
  137 |  *
  138 |  * @returns the updated namespace information.
  139 |  */
> 140 | export async function updateKVNamespace(
  141 | 	complianceConfig: ComplianceConfig,
  142 | 	accountId: string,
  143 | 	namespaceId: string,
  144 | 	title: string
  145 | ): Promise<KVNamespaceInfo> {
  146 | 	return await fetchResult<KVNamespaceInfo>(
```

r2/helpers/local-uploads.ts:30  (setR2LocalUploadsConfig)
```ts
  24 | }
  25 | 
  26 | /**
  27 |  * Set the local uploads configuration for an R2 bucket.
  28 |  * @see https://developers.cloudflare.com/r2/buckets/local-uploads
  29 |  */
> 30 | export async function setR2LocalUploadsConfig(
  31 | 	complianceConfig: ComplianceConfig,
  32 | 	accountId: string,
  33 | 	bucketName: string,
  34 | 	enabled: boolean
  35 | ): Promise<LocalUploadsConfig> {
  36 | 	return await fetchResult<LocalUploadsConfig>(
```

---

## 45. `workers-sdk/packages/wrangler/src#strata:v1:1wz6lsy`

6 location(s) in `workers-sdk/packages/wrangler/src`.

tail/printing.ts:144  (isRequestEvent)
```ts
  138 | }
  139 | 
  140 | export function jsonPrintLogs(data: WebSocket.RawData): void {
  141 | 	logger.json(JSON.parse(data.toString()));
  142 | }
  143 | 
> 144 | function isRequestEvent(
  145 | 	event: TailEventMessage["event"]
  146 | ): event is RequestEvent {
  147 | 	return Boolean(event && "request" in event);
  148 | }
  149 | 
  150 | function isScheduledEvent(
```

tail/printing.ts:150  (isScheduledEvent)
```ts
  144 | function isRequestEvent(
  145 | 	event: TailEventMessage["event"]
  146 | ): event is RequestEvent {
  147 | 	return Boolean(event && "request" in event);
  148 | }
  149 | 
> 150 | function isScheduledEvent(
  151 | 	event: TailEventMessage["event"]
  152 | ): event is ScheduledEvent {
  153 | 	return Boolean(event && "cron" in event);
  154 | }
  155 | 
  156 | function isEmailEvent(event: TailEventMessage["event"]): event is EmailEvent {
```

tail/printing.ts:156  (isEmailEvent)
```ts
  150 | function isScheduledEvent(
  151 | 	event: TailEventMessage["event"]
  152 | ): event is ScheduledEvent {
  153 | 	return Boolean(event && "cron" in event);
  154 | }
  155 | 
> 156 | function isEmailEvent(event: TailEventMessage["event"]): event is EmailEvent {
  157 | 	return Boolean(event && "mailFrom" in event);
  158 | }
  159 | 
  160 | function isQueueEvent(event: TailEventMessage["event"]): event is QueueEvent {
  161 | 	return Boolean(event && "queue" in event);
  162 | }
```

tail/printing.ts:160  (isQueueEvent)
```ts
  154 | }
  155 | 
  156 | function isEmailEvent(event: TailEventMessage["event"]): event is EmailEvent {
  157 | 	return Boolean(event && "mailFrom" in event);
  158 | }
  159 | 
> 160 | function isQueueEvent(event: TailEventMessage["event"]): event is QueueEvent {
  161 | 	return Boolean(event && "queue" in event);
  162 | }
  163 | 
  164 | function isRpcEvent(event: TailEventMessage["event"]): event is RpcEvent {
  165 | 	return Boolean(event && "rpcMethod" in event);
  166 | }
```

Further locations: tail/printing.ts:164, tail/printing.ts:182

---

## 46. `workers-sdk/packages/wrangler/src#strata:v1:4a3s8u`

3 location(s) in `workers-sdk/packages/wrangler/src`.

email-routing/client.ts:46  (enableEmailRouting)
```ts
  40 | 	return await fetchResult<EmailRoutingSettings>(
  41 | 		config,
  42 | 		`/zones/${zoneId}/email/routing`
  43 | 	);
  44 | }
  45 | 
> 46 | export async function enableEmailRouting(
  47 | 	config: Config,
  48 | 	zoneId: string
  49 | ): Promise<EmailRoutingSettings> {
  50 | 	await requireAuth(config);
  51 | 	return await fetchResult<EmailRoutingSettings>(
  52 | 		config,
```

email-routing/client.ts:62  (disableEmailRouting)
```ts
  56 | 			headers: { "Content-Type": "application/json" },
  57 | 			body: JSON.stringify({}),
  58 | 		}
  59 | 	);
  60 | }
  61 | 
> 62 | export async function disableEmailRouting(
  63 | 	config: Config,
  64 | 	zoneId: string
  65 | ): Promise<EmailRoutingSettings> {
  66 | 	await requireAuth(config);
  67 | 	return await fetchResult<EmailRoutingSettings>(
  68 | 		config,
```

email-routing/client.ts:89  (unlockEmailRoutingDns)
```ts
  83 | 	return await fetchResult<EmailRoutingDnsRecord[]>(
  84 | 		config,
  85 | 		`/zones/${zoneId}/email/routing/dns`
  86 | 	);
  87 | }
  88 | 
> 89 | export async function unlockEmailRoutingDns(
  90 | 	config: Config,
  91 | 	zoneId: string
  92 | ): Promise<EmailRoutingSettings> {
  93 | 	await requireAuth(config);
  94 | 	return await fetchResult<EmailRoutingSettings>(
  95 | 		config,
```

---

## 47. `workers-sdk/packages/wrangler/src#strata:v1:mrpxbp`

2 location(s) in `workers-sdk/packages/wrangler/src`.

kv/helpers.ts:304  (logBulkProgress)
```ts
  298 | 	notation: "standard",
  299 | }).format;
  300 | 
  301 | /**
  302 |  * Helper function for bulk requests, logs ongoing output to console.
  303 |  */
> 304 | function logBulkProgress(
  305 | 	operation: "put" | "delete",
  306 | 	index: number,
  307 | 	total: number
  308 | ) {
  309 | 	logger.log(
  310 | 		`${operation === "put" ? "Uploaded" : "Deleted"} ${Math.floor(
```

r2/helpers/bulk.ts:114  (logBulkProgress)
```ts
  108 | 	notation: "standard",
  109 | }).format;
  110 | 
  111 | /**
  112 |  * Helper function for bulk requests, logs ongoing output to console.
  113 |  */
> 114 | export function logBulkProgress(label: string, index: number, total: number) {
  115 | 	logger.log(
  116 | 		`${label} ${Math.floor(
  117 | 			(100 * index) / total
  118 | 		)}% (${formatNumber(index)} out of ${formatNumber(total)})`
  119 | 	);
  120 | }
```

---

## 48. `zod/packages/zod/src#strata:v1:12k2dhj`

2 location(s) in `zod/packages/zod/src`.

v4/classic/in-out.ts:10  (input)
```ts
   4 | 
   5 | // Co-located with the functions: a type and a value can only share a name from one module.
   6 | export type input<T> = core.input<T>;
   7 | export type output<T> = core.output<T>;
   8 | 
   9 | /** Returns a copy of the schema with every pipe replaced by its input side. */
> 10 | export function input<T extends core.$ZodType>(schema: T): schemas.ZodType<core.input<T>, core.input<T>> {
  11 |   return visit(schema, {
  12 |     pipe: (s) => s._zod.def.in,
  13 |   }) as schemas.ZodType<core.input<T>, core.input<T>>;
  14 | }
  15 | 
  16 | /** Returns a copy of the schema with every pipe replaced by its output side. */
```

v4/mini/in-out.ts:10  (input)
```ts
   4 | 
   5 | // See `classic/in-out.ts` for why these aliases exist.
   6 | export type input<T> = core.input<T>;
   7 | export type output<T> = core.output<T>;
   8 | 
   9 | /** See `classic/in-out.ts`. */
> 10 | export function input<T extends core.$ZodType>(schema: T): schemas.ZodMiniType<core.input<T>, core.input<T>> {
  11 |   return visit(schema, {
  12 |     pipe: (s) => s._zod.def.in,
  13 |   }) as schemas.ZodMiniType<core.input<T>, core.input<T>>;
  14 | }
  15 | 
  16 | /** See `classic/in-out.ts`. */
```

---

## 49. `zod/packages/zod/src#strata:v1:1372cfw`

2 location(s) in `zod/packages/zod/src`.

v4/core/config.ts:12  (config)
```ts
   6 |   /** Localized error map. Lowest priority. */
   7 |   localeError?: errors.$ZodErrorMap | undefined;
   8 | }
   9 | 
  10 | export const globalConfig: $ZodConfig = {};
  11 | 
> 12 | export function config(config?: Partial<$ZodConfig>): $ZodConfig {
  13 |   if (config) Object.assign(globalConfig, config);
  14 |   return globalConfig;
  15 | }
  16 | 
```

v4/core/core.ts:178  (config)
```ts
  172 |   __zod_globalConfig?: $ZodConfig;
  173 | }
  174 | 
  175 | (globalThis as GlobalThisWithConfig).__zod_globalConfig ??= {};
  176 | export const globalConfig: $ZodConfig = (globalThis as GlobalThisWithConfig).__zod_globalConfig!;
  177 | 
> 178 | export function config(newConfig?: Partial<$ZodConfig>): $ZodConfig {
  179 |   if (newConfig) Object.assign(globalConfig, newConfig);
  180 |   return globalConfig;
  181 | }
  182 | 
```

---

## 50. `zod/packages/zod/src#strata:v1:15uu08q`

6 location(s) in `zod/packages/zod/src`.

v4/core/api.ts:1476  (_optional)
```ts
  1470 |   }) as any;
  1471 | }
  1472 | 
  1473 | // ZodOptional
  1474 | export type $ZodOptionalParams = TypeParams<schemas.$ZodOptional, "innerType">;
  1475 | // @__NO_SIDE_EFFECTS__
> 1476 | export function _optional<T extends schemas.$ZodObject>(
  1477 |   Class: util.SchemaClass<schemas.$ZodOptional>,
  1478 |   innerType: T
  1479 | ): schemas.$ZodOptional<T> {
  1480 |   return new Class({
  1481 |     type: "optional",
  1482 |     innerType,
```

v4/core/api.ts:1489  (_nullable)
```ts
  1483 |   }) as any;
  1484 | }
  1485 | 
  1486 | // ZodNullable
  1487 | export type $ZodNullableParams = TypeParams<schemas.$ZodNullable, "innerType">;
  1488 | // @__NO_SIDE_EFFECTS__
> 1489 | export function _nullable<T extends schemas.$ZodObject>(
  1490 |   Class: util.SchemaClass<schemas.$ZodNullable>,
  1491 |   innerType: T
  1492 | ): schemas.$ZodNullable<T> {
  1493 |   return new Class({
  1494 |     type: "nullable",
  1495 |     innerType,
```

v4/core/api.ts:1534  (_success)
```ts
  1528 |   }) as any;
  1529 | }
  1530 | 
  1531 | // ZodSuccess
  1532 | export type $ZodSuccessParams = TypeParams<schemas.$ZodSuccess, "innerType">;
  1533 | // @__NO_SIDE_EFFECTS__
> 1534 | export function _success<T extends schemas.$ZodObject>(
  1535 |   Class: util.SchemaClass<schemas.$ZodSuccess>,
  1536 |   innerType: T
  1537 | ): schemas.$ZodSuccess<T> {
  1538 |   return new Class({
  1539 |     type: "success",
  1540 |     innerType,
```

v4/core/api.ts:1580  (_readonly)
```ts
  1574 |   }) as any;
  1575 | }
  1576 | 
  1577 | // ZodReadonly
  1578 | export type $ZodReadonlyParams = TypeParams<schemas.$ZodReadonly, "innerType">;
  1579 | // @__NO_SIDE_EFFECTS__
> 1580 | export function _readonly<T extends schemas.$ZodObject>(
  1581 |   Class: util.SchemaClass<schemas.$ZodReadonly>,
  1582 |   innerType: T
  1583 | ): schemas.$ZodReadonly<T> {
  1584 |   return new Class({
  1585 |     type: "readonly",
  1586 |     innerType,
```

Further locations: v4/core/api.ts:1608, v4/core/api.ts:1621

---

## 51. `zod/packages/zod/src#strata:v1:162t0em`

2 location(s) in `zod/packages/zod/src`.

v4/classic/schemas.ts:1348  (uint64)
```ts
  1342 | // int64
  1343 | export function int64(params?: string | core.$ZodBigIntFormatParams): ZodBigIntFormat {
  1344 |   return core._int64(ZodBigIntFormat, params);
  1345 | }
  1346 | 
  1347 | // uint64
> 1348 | export function uint64(params?: string | core.$ZodBigIntFormatParams): ZodBigIntFormat {
  1349 |   return core._uint64(ZodBigIntFormat, params);
  1350 | }
  1351 | 
  1352 | // symbol
  1353 | export interface ZodSymbol extends _ZodType<core.$ZodSymbolInternals> {}
  1354 | export const ZodSymbol: core.$constructor<ZodSymbol> = /*@__PURE__*/ core.$constructor("ZodSymbol", (inst, def) => {
```

v4/mini/schemas.ts:698  (uint64)
```ts
  692 |   return core._int64(ZodMiniBigIntFormat, params);
  693 | }
  694 | 
  695 | // uint64
  696 | 
  697 | // @__NO_SIDE_EFFECTS__
> 698 | export function uint64(params?: string | core.$ZodBigIntFormatParams): ZodMiniBigIntFormat {
  699 |   return core._uint64(ZodMiniBigIntFormat, params);
  700 | }
  701 | 
  702 | // ZodMiniSymbol
  703 | export interface ZodMiniSymbol extends _ZodMiniType<core.$ZodSymbolInternals> {
  704 |   // _zod: core.$ZodSymbolInternals;
```

---

## 52. `zod/packages/zod/src#strata:v1:17hu5zw`

2 location(s) in `zod/packages/zod/src`.

v4/core/api.ts:1327  (_record)
```ts
  1321 |   });
  1322 | }
  1323 | 
  1324 | // ZodRecord
  1325 | export type $ZodRecordParams = TypeParams<schemas.$ZodRecord, "keyType" | "valueType" | "partial">;
  1326 | // @__NO_SIDE_EFFECTS__
> 1327 | export function _record<Key extends schemas.$ZodRecordKey, Value extends schemas.$ZodObject>(
  1328 |   Class: util.SchemaClass<schemas.$ZodRecord>,
  1329 |   keyType: Key,
  1330 |   valueType: Value,
  1331 |   params?: string | $ZodRecordParams
  1332 | ): schemas.$ZodRecord<Key, Value> {
  1333 |   return new Class({
```

v4/core/api.ts:1344  (_map)
```ts
  1338 |   }) as any;
  1339 | }
  1340 | 
  1341 | // ZodMap
  1342 | export type $ZodMapParams = TypeParams<schemas.$ZodMap, "keyType" | "valueType">;
  1343 | // @__NO_SIDE_EFFECTS__
> 1344 | export function _map<Key extends schemas.$ZodObject, Value extends schemas.$ZodObject>(
  1345 |   Class: util.SchemaClass<schemas.$ZodMap>,
  1346 |   keyType: Key,
  1347 |   valueType: Value,
  1348 |   params?: string | $ZodMapParams
  1349 | ): schemas.$ZodMap<Key, Value> {
  1350 |   return new Class({
```

---

## 53. `zod/packages/zod/src#strata:v1:1dkfeit`

2 location(s) in `zod/packages/zod/src`.

v3/benchmarks/primitives.ts:75  (short)
```ts
  69 |   })
  70 |   .on("cycle", (e: Benchmark.Event) => {
  71 |     console.log(`z.undefined: ${e.target}`);
  72 |   });
  73 | 
  74 | const literalSuite = new Benchmark.Suite("z.literal");
> 75 | const short = "short";
  76 | const bad = "bad";
  77 | const literalSchema = z.literal("short");
  78 | 
  79 | literalSuite
  80 |   .add("valid", () => {
  81 |     literalSchema.parse(short);
```

v3/benchmarks/string.ts:9  (short)
```ts
   3 | import { z } from "zod/v3";
   4 | 
   5 | const SUITE_NAME = "z.string";
   6 | const suite = new Benchmark.Suite(SUITE_NAME);
   7 | 
   8 | const empty = "";
>  9 | const short = "short";
  10 | const long = "long".repeat(256);
  11 | const manual = (str: unknown) => {
  12 |   if (typeof str !== "string") {
  13 |     throw new Error("Not a string");
  14 |   }
  15 | 
```

---

## 54. `zod/packages/zod/src#strata:v1:1ps0ybb`

2 location(s) in `zod/packages/zod/src`.

v4/classic/schemas.ts:763  (url)
```ts
  757 | export const ZodURL: core.$constructor<ZodURL> = /*@__PURE__*/ core.$constructor("ZodURL", (inst, def) => {
  758 |   // ZodStringFormat.init(inst, def);
  759 |   core.$ZodURL.init(inst, def);
  760 |   ZodStringFormat.init(inst, def);
  761 | });
  762 | 
> 763 | export function url(params?: string | core.$ZodURLParams): ZodURL {
  764 |   return core._url(ZodURL, params);
  765 | }
  766 | 
  767 | export function httpUrl(params?: string | Omit<core.$ZodURLParams, "protocol" | "hostname">): ZodURL {
  768 |   return core._url(ZodURL, {
  769 |     protocol: core.regexes.httpProtocol,
```

v4/mini/schemas.ts:219  (url)
```ts
  213 | export const ZodMiniURL: core.$constructor<ZodMiniURL> = /*@__PURE__*/ core.$constructor("ZodMiniURL", (inst, def) => {
  214 |   core.$ZodURL.init(inst, def);
  215 |   ZodMiniStringFormat.init(inst, def);
  216 | });
  217 | 
  218 | // @__NO_SIDE_EFFECTS__
> 219 | export function url(params?: string | core.$ZodURLParams): ZodMiniURL {
  220 |   return core._url(ZodMiniURL, params);
  221 | }
  222 | 
  223 | // @__NO_SIDE_EFFECTS__
  224 | export function httpUrl(params?: string | Omit<core.$ZodURLParams, "protocol" | "hostname">): ZodMiniURL {
  225 |   return core._url(ZodMiniURL, {
```

---

## 55. `zod/packages/zod/src#strata:v1:1ts9nod`

2 location(s) in `zod/packages/zod/src`.

v4/classic/schemas.ts:799  (nanoid)
```ts
  793 | export const ZodNanoID: core.$constructor<ZodNanoID> = /*@__PURE__*/ core.$constructor("ZodNanoID", (inst, def) => {
  794 |   // ZodStringFormat.init(inst, def);
  795 |   core.$ZodNanoID.init(inst, def);
  796 |   ZodStringFormat.init(inst, def);
  797 | });
  798 | 
> 799 | export function nanoid(params?: string | core.$ZodNanoIDParams): ZodNanoID {
  800 |   return core._nanoid(ZodNanoID, params);
  801 | }
  802 | 
  803 | // ZodCUID
  804 | /**
  805 |  * @deprecated CUID v1 is deprecated by its authors due to information leakage
```

v4/mini/schemas.ts:262  (nanoid)
```ts
  256 |     core.$ZodNanoID.init(inst, def);
  257 |     ZodMiniStringFormat.init(inst, def);
  258 |   }
  259 | );
  260 | 
  261 | // @__NO_SIDE_EFFECTS__
> 262 | export function nanoid(params?: string | core.$ZodNanoIDParams): ZodMiniNanoID {
  263 |   return core._nanoid(ZodMiniNanoID, params);
  264 | }
  265 | 
  266 | // ZodMiniCUID
  267 | /**
  268 |  * @deprecated CUID v1 is deprecated by its authors due to information leakage
```

---

## 56. `zod/packages/zod/src#strata:v1:3nsdm0`

2 location(s) in `zod/packages/zod/src`.

v4/classic/in-out.ts:17  (output)
```ts
  11 |   return visit(schema, {
  12 |     pipe: (s) => s._zod.def.in,
  13 |   }) as schemas.ZodType<core.input<T>, core.input<T>>;
  14 | }
  15 | 
  16 | /** Returns a copy of the schema with every pipe replaced by its output side. */
> 17 | export function output<T extends core.$ZodType>(schema: T): schemas.ZodType<core.output<T>, core.output<T>> {
  18 |   return visit(schema, {
  19 |     pipe: (s) => s._zod.def.out,
  20 |   }) as schemas.ZodType<core.output<T>, core.output<T>>;
  21 | }
  22 | 
```

v4/mini/in-out.ts:17  (output)
```ts
  11 |   return visit(schema, {
  12 |     pipe: (s) => s._zod.def.in,
  13 |   }) as schemas.ZodMiniType<core.input<T>, core.input<T>>;
  14 | }
  15 | 
  16 | /** See `classic/in-out.ts`. */
> 17 | export function output<T extends core.$ZodType>(schema: T): schemas.ZodMiniType<core.output<T>, core.output<T>> {
  18 |   return visit(schema, {
  19 |     pipe: (s) => s._zod.def.out,
  20 |   }) as schemas.ZodMiniType<core.output<T>, core.output<T>>;
  21 | }
  22 | 
```

---

## 57. `zod/packages/zod/src#strata:v1:p46vpe`

2 location(s) in `zod/packages/zod/src`.

v4/core/api.ts:804  (_any)
```ts
  798 |   });
  799 | }
  800 | 
  801 | // Any
  802 | export type $ZodAnyParams = TypeParams<schemas.$ZodAny>;
  803 | // @__NO_SIDE_EFFECTS__
> 804 | export function _any<T extends schemas.$ZodAny>(Class: util.SchemaClass<T>): T {
  805 |   return new Class({
  806 |     type: "any",
  807 |   });
  808 | }
  809 | 
  810 | // Unknown
```

v4/core/api.ts:813  (_unknown)
```ts
  807 |   });
  808 | }
  809 | 
  810 | // Unknown
  811 | export type $ZodUnknownParams = TypeParams<schemas.$ZodUnknown>;
  812 | // @__NO_SIDE_EFFECTS__
> 813 | export function _unknown<T extends schemas.$ZodUnknown>(Class: util.SchemaClass<T>): T {
  814 |   return new Class({
  815 |     type: "unknown",
  816 |   });
  817 | }
  818 | 
  819 | // Never
```

---

## 58. `zod/packages/zod/src#strata:v1:sxem27`

2 location(s) in `zod/packages/zod/src`.

v4/classic/schemas.ts:1211  (int)
```ts
  1205 |     ZodNumber.init(inst, def);
  1206 |   }
  1207 | );
  1208 | 
  1209 | // int
  1210 | export interface ZodInt extends ZodNumberFormat {}
> 1211 | export function int(params?: string | core.$ZodCheckNumberFormatParams): ZodInt {
  1212 |   return core._int(ZodNumberFormat, params);
  1213 | }
  1214 | 
  1215 | // float32
  1216 | export interface ZodFloat32 extends ZodNumberFormat {}
  1217 | export function float32(params?: string | core.$ZodCheckNumberFormatParams): ZodFloat32 {
```

v4/mini/schemas.ts:608  (int)
```ts
  602 |   }
  603 | );
  604 | 
  605 | // int
  606 | 
  607 | // @__NO_SIDE_EFFECTS__
> 608 | export function int(params?: string | core.$ZodCheckNumberFormatParams): ZodMiniNumberFormat {
  609 |   return core._int(ZodMiniNumberFormat, params);
  610 | }
  611 | 
  612 | // float32
  613 | 
  614 | // @__NO_SIDE_EFFECTS__
```

---

## 59. `zod/packages/zod/src#strata:v1:vddxbs`

2 location(s) in `zod/packages/zod/src`.

v4/locales/cs.ts:5  (error)
```ts
   1 | import type { $ZodStringFormats } from "../core/checks.js";
   2 | import type * as errors from "../core/errors.js";
   3 | import * as util from "../core/util.js";
   4 | 
>  5 | const error: () => errors.$ZodErrorMap = () => {
   6 |   const Sizable: Record<string, { unit: string; verb: string }> = {
   7 |     string: { unit: "znaků", verb: "mít" },
   8 |     file: { unit: "bajtů", verb: "mít" },
   9 |     array: { unit: "prvků", verb: "mít" },
  10 |     set: { unit: "prvků", verb: "mít" },
  11 |     map: { unit: "prvků", verb: "mít" },
```

v4/locales/sk.ts:5  (error)
```ts
   1 | import type { $ZodStringFormats } from "../core/checks.js";
   2 | import type * as errors from "../core/errors.js";
   3 | import * as util from "../core/util.js";
   4 | 
>  5 | const error: () => errors.$ZodErrorMap = () => {
   6 |   const Sizable: Record<string, { unit: string; verb: string }> = {
   7 |     string: { unit: "znakov", verb: "mať" },
   8 |     file: { unit: "bajtov", verb: "mať" },
   9 |     array: { unit: "prvkov", verb: "mať" },
  10 |     set: { unit: "prvkov", verb: "mať" },
  11 |     map: { unit: "položiek", verb: "mať" },
```

---

## 60. `zod/packages/zod/src#strata:v1:z68v37`

2 location(s) in `zod/packages/zod/src`.

v4/core/api.ts:1718  (_check)
```ts
  1712 |     return fn(payload.value, payload as $RefinementCtx<T>);
  1713 |   }, params);
  1714 |   return ch;
  1715 | }
  1716 | 
  1717 | // @__NO_SIDE_EFFECTS__
> 1718 | export function _check<O = unknown>(fn: schemas.CheckFn<O>, params?: string | $ZodCustomParams): checks.$ZodCheck<O> {
  1719 |   const ch = new checks.$ZodCheck({
  1720 |     check: "custom",
  1721 |     ...util.normalizeParams(params),
  1722 |   });
  1723 | 
  1724 |   ch._zod.check = fn;
```

v4/mini/schemas.ts:1832  (check)
```ts
  1826 |     ZodMiniType.init(inst, def);
  1827 |   }
  1828 | );
  1829 | 
  1830 | // custom checks
  1831 | // @__NO_SIDE_EFFECTS__
> 1832 | export function check<O = unknown>(fn: core.CheckFn<O>, params?: string | core.$ZodCustomParams): core.$ZodCheck<O> {
  1833 |   const ch = new core.$ZodCheck({
  1834 |     check: "custom",
  1835 |     ...util.normalizeParams(params),
  1836 |   });
  1837 | 
  1838 |   ch._zod.check = fn;
```
