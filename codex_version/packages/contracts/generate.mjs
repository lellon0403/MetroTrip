import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const output = resolve(here, "src/schema.d.ts");
const python =
  process.env.METROTRIP_PYTHON ??
  (process.platform === "win32"
    ? resolve(root, "services/api/.venv/Scripts/python.exe")
    : "python");

mkdirSync(dirname(output), { recursive: true });
execFileSync(python, [resolve(root, "services/api/scripts/export_openapi.py")], {
  cwd: root,
  stdio: "inherit",
});
execFileSync(
  process.execPath,
  [
    resolve(root, "node_modules/openapi-typescript/bin/cli.js"),
    resolve(root, "generated/openapi.json"),
    "-o",
    output,
  ],
  { cwd: root, stdio: "inherit" },
);
