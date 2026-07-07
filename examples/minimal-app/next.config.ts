import type { NextConfig } from 'next'

// The @govcore/* packages ship compiled ESM + types (dist/), so a consumer
// needs no `transpilePackages` and no build config — that's what #71 delivers.
const nextConfig: NextConfig = {}

export default nextConfig
