import { beforeAll, describe, expect, it } from "vitest";
import { type AuditService, createAuditService } from "../../src/core/audit.js";
import { estimateTokens } from "../../src/core/budget.js";
import type { GuidelinePack } from "../../src/core/schema.js";
import { createTasteProContext } from "../../src/server/context.js";

let guidelines: GuidelinePack[];
let audit: AuditService;

const DIRTY_HTML = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    .cta { outline: none; transition: transform 200ms; }
  </style>
</head>
<body>
  <img src="/hero.png">
  <form>
    <input type="email" id="email">
  </form>
  <button><svg viewBox="0 0 24 24"></svg></button>
  <div onclick="go()">Go</div>
  <h1>Title</h1>
  <h3>Sub</h3>
  <video autoplay src="/promo.mp4"></video>
  <input type="text" autofocus>
</body>
</html>`;

const CLEAN_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @media (prefers-reduced-motion: reduce) {
      * { animation: none; transition: none; }
    }
  </style>
</head>
<body>
  <h1>Hello</h1>
  <img src="/hero.png" alt="" width="640" height="360">
  <form>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="email">
  </form>
  <button aria-label="Close"><svg viewBox="0 0 24 24"></svg></button>
</body>
</html>`;

beforeAll(async () => {
  guidelines = await createTasteProContext().loader.guidelines();
  audit = createAuditService({ guidelines });
});

describe("static audit", () => {
  it("reports the static rubric issues it can verify", async () => {
    const response = await audit.audit({ html: DIRTY_HTML, target: "checkout page" });
    const ids = response.findings.map((finding) => finding.guidelineId);

    expect(response.mode).toBe("static");
    expect(response.target).toBe("checkout page");
    expect(ids).toEqual(
      expect.arrayContaining([
        "guideline/accessibility-images-need-alt-or-alt-if-decorative",
        "guideline/images-img-needs-explicit-width-and-height-prevents-cls",
        "guideline/accessibility-form-controls-need-label-or-aria-label",
        "guideline/accessibility-icon-only-buttons-need-aria-label",
        "guideline/focus-never-outline-none-outline-none-without-focus-replacement",
        "guideline/anti-patterns-user-scalable-no-or-maximum-scale-1-disabling-zoom",
        "guideline/animation-honor-prefers-reduced-motion-provide-reduced-variant-or-disable",
        "guideline/anti-patterns-div-or-span-with-click-handlers-should-be-button",
        "guideline/accessibility-headings-hierarchical-h1-h6-include-skip-link-for-main-content",
        "guideline/animation-autoplay-motion-5-seconds-alongside-other-content-needs-pause-stop-or-hide-contr",
        "guideline/anti-patterns-autofocus-without-clear-justification",
      ]),
    );
    expect(response.summary.errors).toBeGreaterThanOrEqual(4);
    expect(response.summary.warnings).toBeGreaterThanOrEqual(6);
    expect(response.checked.length).toBeGreaterThanOrEqual(10);
    expect(response.notVerified.join(" ")).toMatch(/rendered layout/i);
    expect(response.notVerified.join(" ")).toMatch(/runtime behavior/i);
    expect(response.notVerified.join(" ")).toMatch(/external stylesheets/i);
    expect(response.truncated).toBe(false);

    for (const finding of response.findings) {
      expect(finding.evidence.length).toBeLessThanOrEqual(200);
      expect(finding.fix.length).toBeGreaterThan(0);
      expect(guidelines.some((guideline) => guideline.id === finding.guidelineId)).toBe(true);
    }
  });

  it("does not invent findings on a clean document", async () => {
    const response = await audit.audit({ html: CLEAN_HTML });
    expect(response.findings).toEqual([]);
    expect(response.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
    expect(response.checked.length).toBeGreaterThanOrEqual(10);
    expect(response.truncated).toBe(false);
  });

  it("rejects empty and oversized documents", async () => {
    await expect(audit.audit({ html: "   " })).rejects.toThrow(/empty/i);
    await expect(audit.audit({ html: "a".repeat(1_000_001) })).rejects.toThrow(/too large/i);
  });

  it("stays inside the token budget and says so", async () => {
    const many = Array.from(
      { length: 60 },
      (_, index) => `<img src="/hero-${index}.png"><div onclick="go()">Go</div>`,
    ).join("\n");
    const response = await audit.audit({
      html: `<html><body>${many}</body></html>`,
      maxTokens: 400,
    });
    expect(estimateTokens(response)).toBeLessThanOrEqual(400);
    expect(response.truncated).toBe(true);
    expect(response.findings.length).toBeLessThan(60);
  });

  it("never echoes the submitted document", async () => {
    const marker = "sensitive-customer-copy-".repeat(100);
    const response = await audit.audit({ html: `<html><body><p>${marker}</p></body></html>` });
    expect(JSON.stringify(response)).not.toContain("sensitive-customer-copy-sens");
  });

  it("requires a renderer for browser mode", async () => {
    await expect(audit.audit({ html: CLEAN_HTML, mode: "browser" })).rejects.toThrow(
      /browser audit is not configured/i,
    );
  });

  it("uses an injected renderer and reports layout overflow", async () => {
    const browser = createAuditService({
      guidelines,
      renderer: async (html) => ({
        html: html.replace("<body>", '<body><div style="width: 4000px">wide</div>'),
        layout: { horizontalOverflow: true },
        notes: ["JavaScript is disabled."],
      }),
    });
    const response = await browser.audit({ html: CLEAN_HTML, mode: "browser" });
    expect(response.mode).toBe("browser");
    expect(response.findings.map((finding) => finding.guidelineId)).toContain(
      "guideline/layout-avoid-unwanted-scrollbars-overflow-x-hidden-on-containers-fix-content-overflow",
    );
    expect(response.notVerified.join(" ")).toMatch(/JavaScript is not executed/i);
  });

  it("bounds concurrent audits and rejects when the queue is full", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = createAuditService({
      guidelines,
      renderer: async (html) => {
        await gate;
        return { html, layout: { horizontalOverflow: false } };
      },
      maxConcurrent: 1,
      maxQueue: 0,
    });

    const first = service.audit({ html: CLEAN_HTML, mode: "browser" });
    await expect(service.audit({ html: CLEAN_HTML, mode: "browser" })).rejects.toThrow(/busy/i);
    release();
    await expect(first).resolves.toBeTruthy();
  });
});
