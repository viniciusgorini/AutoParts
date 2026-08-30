import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The AgentPay merchant SDK is a Node package (it uses node:crypto for
  // Ed25519). Keeping it external prevents the bundler from trying to inline
  // it into an environment without those builtins.
  serverExternalPackages: ["@agentpay/merchant-sdk"],
};

export default nextConfig;
