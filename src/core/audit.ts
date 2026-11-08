import { type HTMLElement, parse } from "node-html-parser";
import { fitJson } from "./budget.js";
import type { GuidelinePack } from "./schema.js";

export type AuditMode = "static" | "browser";

export interface AuditRequest {
  /** Submitted HTML. The audit never persists or echoes the document. */
  html: string;
  /** Human-readable label for the report, not fetched. */
  target?: string;
  mode?: AuditMode;
  maxTokens?: number;
}

export interface AuditFinding {
  guidelineId: string;
  severity: GuidelinePack["severity"];
  category: string;
  rule: string;
  evidence: string;
  fix: string;
}

export interface AuditResponse {
  target: string;
  mode: AuditMode;
  findings: AuditFinding[];
  summary: { errors: number; warnings: number; infos: number };
  checked: string[];
  notVerified: string[];
  truncated: boolean;
}

export interface AuditRenderResult {
  html: string;
  layout?: { horizontalOverflow?: boolean };
  notes?: string[];
}

export type AuditRenderer = (html: string) => Promise<AuditRenderResult>;

export interface AuditService {
  audit(request: AuditRequest): Promise<AuditResponse>;
}

const MAX_HTML_CHARS = 1_000_000;
const MAX_FINDINGS = 50;
const DEFAULT_MAX_TOKENS = 2_000;
const MIN_MAX_TOKENS = 256;
const MAX_MAX_TOKENS = 8_000;

/**
 * Every finding cites a real guideline id. Keeping this mapping explicit means
 * a content update that removes or renames a rule fails at service creation
 * instead of producing a report with dangling citations.
 */
const GUIDELINE = {
  imageAlt: "guideline/accessibility-images-need-alt-or-alt-if-decorative",
  imageDimensions: "guideline/images-img-needs-explicit-width-and-height-prevents-cls",
  formLabel: "guideline/accessibility-form-controls-need-label-or-aria-label",
  iconButton: "guideline/accessibility-icon-only-buttons-need-aria-label",
  outline: "guideline/focus-never-outline-none-outline-none-without-focus-replacement",
  zoom: "guideline/anti-patterns-user-scalable-no-or-maximum-scale-1-disabling-zoom",
  reducedMotion:
    "guideline/animation-honor-prefers-reduced-motion-provide-reduced-variant-or-disable",
  clickHandler: "guideline/anti-patterns-div-or-span-with-click-handlers-should-be-button",
  heading: "guideline/accessibility-headings-hierarchical-h1-h6-include-skip-link-for-main-content",
  autoplay:
    "guideline/animation-autoplay-motion-5-seconds-alongside-other-content-needs-pause-stop-or-hide-contr",
  inputName: "guideline/forms-inputs-need-autocomplete-and-meaningful-name",
  autofocus: "guideline/anti-patterns-autofocus-without-clear-justification",
  overflow:
    "guideline/layout-avoid-unwanted-scrollbars-overflow-x-hidden-on-containers-fix-content-overflow",
} as const;

const STATIC_CHECK_IDS: string[] = Object.values(GUIDELINE).filter(
  (id) => id !== GUIDELINE.overflow,
);

const STATIC_NOT_VERIFIED = [
  "Rendered layout, color contrast, and computed styles (requires browser mode).",
  "Runtime behavior: focus order, keyboard interaction, hydration, and gestures.",
  "External stylesheets and scripts (only inline HTML/CSS is inspected).",
  "Content, copy, and brand quality (requires human review).",
];

const BROWSER_NOT_VERIFIED = [
  "Page JavaScript is not executed; runtime behavior and hydration are not verified.",
  "Color contrast and visual quality require human review.",
  "External stylesheets and scripts are not fetched.",
];

const NON_LABEL_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

function shorten(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

function openingTag(element: HTMLElement): string {
  const text = element.toString();
  const end = text.indexOf(">");
  return end >= 0 ? text.slice(0, end + 1) : text;
}

function cssText(root: HTMLElement): string {
  const blocks = root
    .querySelectorAll("style")
    .map((style) => style.textContent)
    .join("\n");
  const inline = root
    .querySelectorAll("[style]")
    .map((element) => element.getAttribute("style") ?? "")
    .join("\n");
  return `${blocks}\n${inline}`;
}

function classText(root: HTMLElement): string {
  return root
    .querySelectorAll("[class]")
    .map((element) => element.getAttribute("class") ?? "")
    .join(" ");
}

function hasAccessibleLabel(control: HTMLElement, labelFor: Set<string>): boolean {
  if (control.getAttribute("aria-label")?.trim()) return true;
  if (control.getAttribute("aria-labelledby")?.trim()) return true;
  if (control.closest("label")) return true;
  const id = control.getAttribute("id")?.trim();
  return Boolean(id && labelFor.has(id));
}

function motionEvidence(css: string): string {
  return (
    css.match(/(?:animation|transition)[^;{}]{0,80}/i)?.[0]?.trim() ??
    "animation/transition present"
  );
}

export function createAuditService(options: {
  guidelines: GuidelinePack[];
  renderer?: AuditRenderer;
  /** Maximum in-flight audits. Static parsing and browser renders share this cap. */
  maxConcurrent?: number;
  /** Maximum audits waiting for a slot before new requests are rejected. */
  maxQueue?: number;
}): AuditService {
  const byId = new Map(options.guidelines.map((guideline) => [guideline.id, guideline]));
  const missing = Object.values(GUIDELINE).filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`Audit rubric is missing guideline ids: ${missing.join(", ")}`);
  }

  const maxConcurrent = Number.isFinite(options.maxConcurrent)
    ? Math.max(1, Math.floor(options.maxConcurrent as number))
    : 2;
  const maxQueue = Number.isFinite(options.maxQueue)
    ? Math.max(0, Math.floor(options.maxQueue as number))
    : 8;
  let active = 0;
  const waiting: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active += 1;
      return;
    }
    if (waiting.length >= maxQueue) {
      throw new Error("Audit is busy. Retry shortly.");
    }
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
    // release() handed this slot over; do not increment again.
  }

  function release(): void {
    const next = waiting.shift();
    if (next) {
      next();
      return;
    }
    active -= 1;
  }

  const runAudit = async (request: AuditRequest): Promise<AuditResponse> => {
    if (typeof request.html !== "string" || request.html.trim().length === 0) {
      throw new Error("Audit HTML is empty.");
    }
    if (request.html.length > MAX_HTML_CHARS) {
      throw new Error(
        `Audit HTML is too large (max ${MAX_HTML_CHARS.toLocaleString()} characters).`,
      );
    }

    const mode: AuditMode = request.mode ?? "static";
    let rendered = request.html;
    let horizontalOverflow = false;
    const rendererNotes: string[] = [];

    if (mode === "browser") {
      if (!options.renderer) {
        throw new Error(
          "Browser audit is not configured. Submit HTML with mode=static or enable TASTEPRO_AUDIT_BROWSER=playwright.",
        );
      }
      const result = await options.renderer(request.html);
      rendered = result.html;
      horizontalOverflow = Boolean(result.layout?.horizontalOverflow);
      if (result.notes) rendererNotes.push(...result.notes);
    }

    const root = parse(rendered, { comment: false });
    const findings: AuditFinding[] = [];
    const seen = new Set<string>();

    const add = (guidelineId: string, rule: string, evidence: string, fix: string): void => {
      const key = `${guidelineId}|${evidence}`;
      if (seen.has(key)) return;
      seen.add(key);
      const guideline = byId.get(guidelineId);
      if (!guideline) throw new Error(`Audit cited an unknown guideline: ${guidelineId}`);
      findings.push({
        guidelineId,
        severity: guideline.severity,
        category: guideline.category,
        rule,
        evidence: shorten(evidence, 200),
        fix,
      });
    };

    for (const image of root.querySelectorAll("img")) {
      if (!image.hasAttribute("alt")) {
        add(
          GUIDELINE.imageAlt,
          "img-alt",
          openingTag(image),
          'Add alt text that describes the image, or alt="" if it is decorative.',
        );
      }
      if (!image.hasAttribute("width") || !image.hasAttribute("height")) {
        add(
          GUIDELINE.imageDimensions,
          "img-dimensions",
          openingTag(image),
          "Add explicit width and height attributes, or reserve the aspect ratio in CSS.",
        );
      }
    }

    const labelFor = new Set(
      root
        .querySelectorAll("label[for]")
        .map((label) => label.getAttribute("for")?.trim())
        .filter((value): value is string => Boolean(value)),
    );
    for (const control of root.querySelectorAll("input, select, textarea")) {
      if (control.rawTagName === "input") {
        const type = (control.getAttribute("type") ?? "text").toLowerCase();
        if (NON_LABEL_INPUT_TYPES.has(type)) continue;
      }
      if (!hasAccessibleLabel(control, labelFor)) {
        add(
          GUIDELINE.formLabel,
          "form-label",
          openingTag(control),
          "Wrap the control in a <label> or add aria-label/aria-labelledby.",
        );
      }
      if (!control.getAttribute("name")?.trim()) {
        add(
          GUIDELINE.inputName,
          "input-name",
          openingTag(control),
          "Add a meaningful name attribute and the appropriate autocomplete value.",
        );
      }
    }

    for (const button of root.querySelectorAll("button")) {
      if (button.textContent.replace(/\s+/g, " ").trim()) continue;
      if (
        button.getAttribute("aria-label")?.trim() ||
        button.getAttribute("aria-labelledby")?.trim() ||
        button.getAttribute("title")?.trim()
      ) {
        continue;
      }
      if (!button.querySelector("svg, img")) continue;
      add(
        GUIDELINE.iconButton,
        "icon-button-label",
        openingTag(button),
        "Add aria-label or aria-labelledby with the action name.",
      );
    }

    const css = cssText(root);
    const classes = classText(root);

    const outlineEvidence =
      css.match(/\boutline\s*:\s*(?:none|0)\b/i)?.[0] ??
      (/(?:^|\s)outline-none(?:\s|$)/.test(classes) ? 'class="outline-none"' : undefined);
    const hasFocusReplacement =
      /:focus(?:-visible)?\b/.test(css) || /(?:^|\s)focus(?:-visible)?:/.test(classes);
    if (outlineEvidence && !hasFocusReplacement) {
      add(
        GUIDELINE.outline,
        "outline-none",
        outlineEvidence,
        "Replace outline removal with a visible :focus-visible ring or equivalent.",
      );
    }

    for (const meta of root.querySelectorAll("meta")) {
      if ((meta.getAttribute("name") ?? "").toLowerCase() !== "viewport") continue;
      const content = meta.getAttribute("content") ?? "";
      if (
        /user-scalable\s*=\s*no/i.test(content) ||
        /maximum-scale\s*=\s*1(?:\.0+)?(?:\s*,|\s*$)/i.test(content)
      ) {
        add(
          GUIDELINE.zoom,
          "zoom-disabled",
          openingTag(meta),
          "Allow pinch zoom: remove user-scalable=no and maximum-scale=1.",
        );
      }
    }

    const hasMotion =
      /\b(?:animation|animation-name|transition|transition-property)\s*:/i.test(css) ||
      /(?:^|\s)(?:transition|animate-\S+)(?:\s|$)/.test(classes);
    const hasReducedMotion =
      /prefers-reduced-motion/i.test(css) || /(?:^|\s)motion-reduce:/.test(classes);
    if (hasMotion && !hasReducedMotion) {
      add(
        GUIDELINE.reducedMotion,
        "reduced-motion",
        motionEvidence(css),
        "Add a @media (prefers-reduced-motion: reduce) branch that disables or reduces the motion.",
      );
    }

    for (const element of root.querySelectorAll("div, span")) {
      if (!element.hasAttribute("onclick")) continue;
      add(
        GUIDELINE.clickHandler,
        "div-click-handler",
        openingTag(element),
        "Use <button> for actions or <a> for navigation.",
      );
    }

    let previousHeading = 0;
    for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const level = Number(heading.rawTagName.slice(1));
      if (!Number.isFinite(level)) continue;
      if (previousHeading > 0 && level > previousHeading + 1) {
        add(
          GUIDELINE.heading,
          "heading-order",
          `<h${previousHeading}> followed by <h${level}>`,
          `Use <h${previousHeading + 1}> or adjust the outline so heading levels do not skip.`,
        );
        break;
      }
      previousHeading = level;
    }

    for (const media of root.querySelectorAll("video, audio")) {
      if (!media.hasAttribute("autoplay") || media.hasAttribute("controls")) continue;
      add(
        GUIDELINE.autoplay,
        "autoplay-without-controls",
        openingTag(media),
        "If the clip runs longer than 5 seconds alongside other content, add pause/stop/hide controls. Verify the duration.",
      );
    }

    for (const element of root.querySelectorAll("[autofocus]")) {
      add(
        GUIDELINE.autofocus,
        "autofocus",
        openingTag(element),
        "Remove autofocus unless a single primary input on desktop has a clear justification.",
      );
    }

    if (mode === "browser" && horizontalOverflow) {
      add(
        GUIDELINE.overflow,
        "horizontal-overflow",
        "document scrollWidth exceeds clientWidth",
        "Find the element that widens the page; constrain it or use overflow-x-clip on the container.",
      );
    }

    const kept = findings.slice(0, MAX_FINDINGS);
    const summary = { errors: 0, warnings: 0, infos: 0 };
    for (const finding of kept) {
      if (finding.severity === "error") summary.errors += 1;
      else if (finding.severity === "warn") summary.warnings += 1;
      else summary.infos += 1;
    }

    const response: AuditResponse = {
      target: shorten(request.target ?? "submitted HTML", 200),
      mode,
      findings: kept,
      summary,
      checked: mode === "browser" ? Object.values(GUIDELINE) : [...STATIC_CHECK_IDS],
      notVerified: [
        ...(mode === "browser" ? BROWSER_NOT_VERIFIED : STATIC_NOT_VERIFIED),
        ...rendererNotes,
      ],
      truncated: findings.length > MAX_FINDINGS,
    };

    const maxTokens = Math.min(
      MAX_MAX_TOKENS,
      Math.max(MIN_MAX_TOKENS, Math.floor(request.maxTokens ?? DEFAULT_MAX_TOKENS)),
    );
    const fitted = fitJson(response, maxTokens, {
      requiredKeys: [
        "target",
        "mode",
        "findings",
        "summary",
        "checked",
        "notVerified",
        "truncated",
      ],
      arrayKeys: ["findings", "checked", "notVerified"],
      itemKeys: ["guidelineId", "severity", "category", "rule", "evidence", "fix"],
    });
    fitted.value.truncated = response.truncated || fitted.truncated;
    return fitted.value;
  };

  return {
    async audit(request: AuditRequest): Promise<AuditResponse> {
      await acquire();
      try {
        return await runAudit(request);
      } finally {
        release();
      }
    },
  };
}
