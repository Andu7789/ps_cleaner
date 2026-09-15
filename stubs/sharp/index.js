// Stub for the real `sharp` package (see package.json's pnpm.overrides).
// `sharp` is never a direct dependency of this app — Next.js always pulls
// it in for its built-in image optimizer, which is disabled here
// (next.config.ts images.unoptimized: true) since this app doesn't use
// next/image and Cloudflare Workers can't run sharp's native bindings
// anyway. The real package's dynamic `require(".../*.node")` calls fail
// esbuild's static bundling for Cloudflare; this stub has no native code
// for esbuild to choke on, and its export is never actually called at
// runtime because the feature it would serve is switched off. If this
// ever throws, something started relying on real image optimization and
// this stub needs revisiting (see DECISIONS.md).
module.exports = function sharpStub() {
  throw new Error("sharp is stubbed out in this deployment — next/image optimization is disabled (next.config.ts).");
};
