import type { NextConfig } from "next";

// dev（next dev）でのみ /api を Rust サーバーへプロキシする。
// 本番は同一オリジン配信なので rewrites は不要（`output: 'export'` とも併用できない）。
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // 静的 export（web/out/ を Rust の rust-embed が取り込む。docs/specs/07 §3）
  output: "export",
  ...(isDev
    ? {
        // docs/specs/07 §5 / docs/specs/03 §5: dev 時のみ localhost:48210 へ
        async rewrites() {
          return [
            { source: "/api/:path*", destination: "http://localhost:48210/api/:path*" },
          ];
        },
      }
    : {}),
};

export default nextConfig;
