import type { NextConfig } from "next";

// mirrors StationId in data/stations.ts; the @/ alias doesn't resolve in this file
const STATIONS = "about|projects|experience|skills|awards|github|contact|updates|guestbook";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: `/:station(${STATIONS})`, destination: "/world/:station", permanent: true }];
  },
};

export default nextConfig;
