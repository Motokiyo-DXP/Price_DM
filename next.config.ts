import type { NextConfig } from "next";
// All clients receive metadata in the initial HTML head, including LINE crawlers.
const nextConfig: NextConfig = { htmlLimitedBots: /.*/ };
export default nextConfig;
