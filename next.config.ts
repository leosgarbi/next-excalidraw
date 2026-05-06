import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build "standalone" para gerar uma imagem Docker mínima
  // (.next/standalone contém server.js + node_modules tree-shaken).
  output: "standalone",
};

export default nextConfig;

