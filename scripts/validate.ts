#!/usr/bin/env node
import { Command } from "commander";
import { resolveContentDir } from "../src/core/content/loader.js";
import { validateContent } from "./lib/validate-content.js";

const program = new Command();
program
  .name("tastepro-validate")
  .description("Validate committed TastePro content and source provenance")
  .option("--content-dir <path>", "content directory")
  .option("--json", "print a JSON report", false)
  .action(async (options) => {
    let contentDir: string;
    try {
      contentDir = resolveContentDir(options.contentDir);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (options.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, errors: [message], warnings: [] }, null, 2)}\n`,
        );
      } else {
        process.stderr.write(`${message}\n`);
      }
      process.exitCode = 1;
      return;
    }

    let report: Awaited<ReturnType<typeof validateContent>>;
    try {
      report = await validateContent(contentDir);
    } catch (cause) {
      report = {
        errors: [cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)],
        warnings: [],
      };
    }

    const output = {
      ok: report.errors.length === 0,
      contentDir,
      errors: report.errors,
      warnings: report.warnings,
    };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } else {
      process.stdout.write(`Content: ${contentDir}\n`);
      process.stdout.write(`Errors: ${report.errors.length}\n`);
      for (const message of report.errors) process.stdout.write(`  ERROR ${message}\n`);
      process.stdout.write(`Warnings: ${report.warnings.length}\n`);
      for (const message of report.warnings) process.stdout.write(`  WARN ${message}\n`);
      process.stdout.write(
        report.errors.length === 0
          ? "Content validation passed.\n"
          : "Content validation failed.\n",
      );
    }
    if (report.errors.length > 0) process.exitCode = 1;
  });

program.parseAsync(process.argv).catch((cause) => {
  process.stderr.write(
    `${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}\n`,
  );
  process.exitCode = 1;
});
