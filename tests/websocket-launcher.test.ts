import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type PackageManifest = {
  readonly scripts?: Record<string, string>;
};

const readManifest = async (): Promise<PackageManifest> => {
  const rawManifest = await readFile("package.json", "utf8");
  return JSON.parse(rawManifest) as PackageManifest;
};

describe("WebSocket relay launcher", () => {
  it("serves Next.js and the /ws upgrade handler from one port", async () => {
    const manifest = await readManifest();

    expect(manifest.scripts?.dev).toContain("server/custom-server.js");
    expect(manifest.scripts?.start).toContain("server/custom-server.js");
    expect(manifest.scripts?.dev).not.toContain("next dev");
    expect(manifest.scripts?.start).not.toContain("next start");
  });
});
