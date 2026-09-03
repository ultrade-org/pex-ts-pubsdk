import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const failures = [];

for (const [subpath, entry] of Object.entries(packageJson.exports ?? {})) {
  if (typeof entry === "string") {
    if (!existsSync(resolve(root, entry))) failures.push(`${subpath} target is missing: ${entry}`);
    continue;
  }
  for (const field of ["types", "import"]) {
    const target = entry?.[field];
    if (typeof target !== "string" || !existsSync(resolve(root, target))) {
      failures.push(`${subpath} ${field} target is missing: ${String(target)}`);
    }
  }
  if (typeof entry?.import === "string" && existsSync(resolve(root, entry.import))) {
    try {
      await import(pathToFileURL(resolve(root, entry.import)).href);
    } catch (error) {
      failures.push(`${subpath} import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Built package entry points loaded successfully.");
}
