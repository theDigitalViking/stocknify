import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict TypeScript — fail the build on type errors
  typescript: { ignoreBuildErrors: false },
  // ESLint is run separately via `turbo lint` (eslint.config.mjs).
  // Next.js 14 + ESLint 9 have an API incompatibility so we skip the
  // duplicate lint pass here; CI enforces it via the lint step.
  eslint: { ignoreDuringBuilds: true },

  // Allow images from Supabase storage and other trusted hosts
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // Environment variables are validated in src/env.ts via @t3-oss/env-nextjs.
  // Do NOT add raw process.env references here.
}

export default withNextIntl(nextConfig)
