import { rmSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

if (basename(dist) !== "dist" || !dist.startsWith(`${root}/`)) {
  throw new Error("refusing to clean an unexpected output path");
}

rmSync(dist, { recursive: true, force: true });
