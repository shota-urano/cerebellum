import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静的 export（web/out/ を Rust の rust-embed が取り込む。docs/specs/07 §3）
  output: "export",
};

export default nextConfig;
