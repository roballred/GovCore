import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The @govcore/* packages are source-first TS — Next must transpile them.
  transpilePackages: [
    '@govcore/schema',
    '@govcore/rbac',
    '@govcore/audit',
    '@govcore/tenancy',
    '@govcore/auth',
    '@govcore/middleware',
    '@govcore/server',
    '@govcore/theme',
    '@govcore/nextkit',
  ],
}

export default nextConfig
