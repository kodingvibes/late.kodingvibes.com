import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

interface LatestJson {
  version?: string;
  name?: string;
}

function readLatestVersion(name: "radio" | "chat" | "dashboard"): string {
  try {
    const raw = fs.readFileSync(`/var/www/html/micro/${name}/latest.json`, "utf8");
    const parsed = JSON.parse(raw) as LatestJson;
    return parsed.version ?? "";
  } catch {
    return "";
  }
}

// ponytail: microfront URLs include a ?v=<version> cache-bust query so Safari
// (and any other immutable-cache browser) treats each deploy as a distinct
// asset. The server symlink at /micro/{radio,chat,dashboard}/latest/ still
// swaps the underlying file; the query string only forces a fresh fetch
// after the shell rebuilds. Nginx ignores query strings when serving
// static files.
const microfrontsPlugin: Plugin = {
  name: "late-microfronts",
  transformIndexHtml: {
    order: "post",
    handler(html, ctx) {
      if (!ctx.filename.endsWith("index.html")) return html;
      const radioV = readLatestVersion("radio");
      const chatV  = readLatestVersion("chat");
      const dashV   = readLatestVersion("dashboard");
      const radioBase = "/micro/radio/latest";
      const chatBase  = "/micro/chat/latest";
      const dashBase   = "/micro/dashboard/latest";
      const radioQ = radioV ? `?v=${encodeURIComponent(radioV)}` : "";
      const chatQ  = chatV  ? `?v=${encodeURIComponent(chatV)}`  : "";
      const dashQ   = dashV  ? `?v=${encodeURIComponent(dashV)}`   : "";
      const tags = [
        `<link rel="stylesheet" href="${radioBase}/style.css${radioQ}">`,
        `<link rel="stylesheet" href="${chatBase}/style.css${chatQ}">`,
        `<link rel="stylesheet" href="${dashBase}/style.css${dashQ}">`,
        `<script type="module" src="${radioBase}/entry.js${radioQ}"></script>`,
        `<script type="module" src="${chatBase}/entry.js${chatQ}"></script>`,
        `<script type="module" src="${dashBase}/entry.js${dashQ}"></script>`,
      ].join("\n    ");
      return html.replace("</body>", `    ${tags}\n  </body>`);
    },
  },
};

export default defineConfig({
  plugins: [microfrontsPlugin, react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@late/theme": path.resolve(__dirname, "../packages/late-theme"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    modulePreload: {
      polyfill: true,
      resolveDependencies: (_filename, deps) => deps,
    },
    rollupOptions: {
      // React and react-dom live in /vendor/vendor.js, shared with the
      // microfronts via the import map. One React instance in the page,
      // no broken hooks / refs across microfronts.
      external: [
        "react", "react-dom", "react-dom/client", "react/jsx-runtime",
        /^https?:\/\//,
        /^\/micro\//,
      ],
      output: {
        manualChunks(id) {
          if (/node_modules\/(react-router-dom|scheduler)\//.test(id)) {
            return "react-vendor";
          }
        },
      },
    },
  },
});
