import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scripts = ["start.sh", "stop.sh", "restart.sh", "logs.sh"];

describe("runtime shell scripts", () => {
  it.each(scripts)("%s has valid Bash syntax", (script) => {
    expect(() => execFileSync("bash", ["-n", resolve(script)], { stdio: "pipe" })).not.toThrow();
  });

  it.each(scripts)("%s is executable", (script) => {
    expect(statSync(resolve(script)).mode & 0o111).not.toBe(0);
  });
});
