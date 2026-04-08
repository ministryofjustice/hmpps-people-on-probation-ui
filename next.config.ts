import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['bunyan', 'bunyan-format', 'dtrace-provider'],
  sassOptions: {
    includePaths: [path.join(process.cwd(), 'assets', 'scss')],
  },
}

export default nextConfig
