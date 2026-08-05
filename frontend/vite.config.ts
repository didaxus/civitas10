import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const manualChunks = (id: string) => {
  if (id.includes("/src/features/planning/")) return "planning-remote-ui";
  if (!id.includes("/node_modules/")) return undefined;
  if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/react-router") || id.includes("/scheduler/")) return "react";
  if (id.includes("/node_modules/@logto/")) return "logto";
  if (id.includes("/node_modules/@tabler/icons-react/")) return "icons";
  return "vendor";
};

/** Hashes the exact JavaScript bytes emitted for the remote UI artifact. */
function planningBundleIntegrity(): Plugin {
  return {
    name: "civitas-planning-bundle-integrity",
    generateBundle(_options, bundle) {
      const artifact = Object.values(bundle).find(output => output.type === "chunk" && (output.name === "planning-remote-ui" || output.fileName.includes("planning-remote-ui") || Object.keys(output.modules || {}).some((moduleId) => moduleId.includes("/src/features/planning/"))));
      if (!artifact || artifact.type !== "chunk") {
        const fallback = Object.values(bundle).find(output => output.type === "chunk" && output.isEntry);
        if (!fallback || fallback.type !== "chunk") throw new Error("planning_remote_ui_artifact_missing");
        const bytes = Buffer.from(fallback.code);
        const digest = createHash("sha256").update(bytes).digest("base64");
        this.emitFile({ type: "asset", fileName: "planning-bundle-integrity.json", source: `${JSON.stringify({ artifactId: fallback.fileName, integrity: `sha256-${digest}`, sizeBytes: bytes.byteLength, fallbackReason: "planning_chunk_inlined" }, null, 2)}\n` });
        return;
      }
      const bytes = Buffer.from(artifact.code);
      const digest = createHash("sha256").update(bytes).digest("base64");
      this.emitFile({
        type: "asset",
        fileName: "planning-bundle-integrity.json",
        source: `${JSON.stringify({ artifactId: artifact.fileName, integrity: `sha256-${digest}`, sizeBytes: bytes.byteLength }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), planningBundleIntegrity()],
  build: { rolldownOptions: { output: { manualChunks } } },
});
