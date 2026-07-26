import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

interface LatestJson {
  version?: string;
  name?: string;
}

function readLatestVersion(name: "radio" | "chat" | "dashboard" | "profiles" | "freelance" | "games" | "forum" | "trivia"): string {
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
      const profilesV = readLatestVersion("profiles");
      const freelanceV = readLatestVersion("freelance");
      const gamesV = readLatestVersion("games");
      const forumV = readLatestVersion("forum");
      const triviaV = readLatestVersion("trivia");
      const radioBase = "/micro/radio/latest";
      const chatBase  = "/micro/chat/latest";
      const dashBase   = "/micro/dashboard/latest";
      const profilesBase = "/micro/profiles/latest";
      const freelanceBase = "/micro/freelance/latest";
      const gamesBase = "/micro/games/latest";
      const forumBase = "/micro/forum/latest";
      const triviaBase = "/micro/trivia/latest";
      const radioQ = radioV ? `?v=${encodeURIComponent(radioV)}` : "";
      const chatQ  = chatV  ? `?v=${encodeURIComponent(chatV)}`  : "";
      const dashQ   = dashV  ? `?v=${encodeURIComponent(dashV)}`   : "";
      const profilesQ = profilesV ? `?v=${encodeURIComponent(profilesV)}` : "";
      const freelanceQ = freelanceV ? `?v=${encodeURIComponent(freelanceV)}` : "";
      const gamesQ = gamesV ? `?v=${encodeURIComponent(gamesV)}` : "";
      const forumQ = forumV ? `?v=${encodeURIComponent(forumV)}` : "";
      const triviaQ = triviaV ? `?v=${encodeURIComponent(triviaV)}` : "";
      const tags = [
        `<link rel="stylesheet" href="${radioBase}/style.css${radioQ}">`,
        `<link rel="stylesheet" href="${chatBase}/style.css${chatQ}">`,
        `<link rel="stylesheet" href="${dashBase}/style.css${dashQ}">`,
        `<link rel="stylesheet" href="${profilesBase}/style.css${profilesQ}">`,
        `<link rel="stylesheet" href="${freelanceBase}/style.css${freelanceQ}">`,
        `<link rel="stylesheet" href="${gamesBase}/style.css${gamesQ}">`,
        `<link rel="stylesheet" href="${forumBase}/style.css${forumQ}">`,
        `<link rel="stylesheet" href="${triviaBase}/style.css${triviaQ}">`,
        `<script type="module" src="${radioBase}/entry.js${radioQ}"></script>`,
        `<script type="module" src="${chatBase}/entry.js${chatQ}"></script>`,
        `<script type="module" src="${dashBase}/entry.js${dashQ}"></script>`,
        `<script type="module" src="${profilesBase}/entry.js${profilesQ}"></script>`,
        `<script type="module" src="${freelanceBase}/entry.js${freelanceQ}"></script>`,
        `<script type="module" src="${gamesBase}/entry.js${gamesQ}"></script>`,
        `<script type="module" src="${forumBase}/entry.js${forumQ}"></script>`,
        `<script type="module" src="${triviaBase}/entry.js${triviaQ}"></script>`,
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
