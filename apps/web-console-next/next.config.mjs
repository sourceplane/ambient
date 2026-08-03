import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `@saas/sdk` is a workspace-source package: its `package.json` exports
  // point at `./src/index.ts` and the file uses TS NodeNext-style `./*.js`
  // import specifiers that resolve to the sibling `.ts` source. Next's
  // webpack pipeline does not perform that pairing for source-mode workspace
  // deps, so register an extension alias and run the package through SWC.
  transpilePackages: ["@saas/sdk"],
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  // The console used to own `/orgs`, `/account`, `/onboarding` and `/demo` at
  // the top level. The catalog is the product now and owns the root namespace,
  // so the console lives entirely under `/studio`. These are permanent (308)
  // because the old addresses are not coming back — and they are server-side so
  // a deep bookmark like `/orgs/acme/settings/webhooks/we_123` lands on the
  // same page rather than on a 404 or a generic home.
  //
  // `/login` and `/auth/callback` deliberately stay at the top level: they are
  // the entry point for both surfaces, and a signed-out visitor arriving at a
  // film page should not be sent through a URL that says "studio".
  async redirects() {
    return [
      { source: "/orgs", destination: "/studio/orgs", permanent: true },
      { source: "/orgs/:path*", destination: "/studio/orgs/:path*", permanent: true },
      { source: "/account", destination: "/studio/account", permanent: true },
      { source: "/account/:path*", destination: "/studio/account/:path*", permanent: true },
      { source: "/onboarding", destination: "/studio/onboarding", permanent: true },
      { source: "/demo", destination: "/studio/demo", permanent: true },
    ];
  },
  // `output: "standalone"` is required by the @opennextjs/cloudflare adapter,
  // which reads `.next/standalone/**` to bundle the server function before
  // emitting Pages-compatible assets into `.open-next/assets/**`.
  output: "standalone",
  // Trace from the monorepo root so the standalone build pulls in workspace
  // dependencies (e.g. @saas/contracts) instead of trying to resolve them
  // from the per-app node_modules.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    // Lint runs separately via `pnpm lint`. Skip during `next build` to keep
    // the build deterministic across Node/ESLint flat-config quirks.
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "",
    // M0 / Solo profile (ambient ships single-user). Build with
    // NEXT_PUBLIC_SOLO_MODE=false to restore the full multi-tenant baseline.
    // See specs/profiles/solo-m0.md.
    NEXT_PUBLIC_SOLO_MODE: process.env.NEXT_PUBLIC_SOLO_MODE ?? "true",
  },
};

export default nextConfig;
