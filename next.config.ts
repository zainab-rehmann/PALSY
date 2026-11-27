import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Supabase storage hosts every uploaded photo/avatar — serve them
    // resized + modern-format instead of full-size originals.
    remotePatterns: [
      { protocol: 'https', hostname: 'ygzanokycmuuoqawaqmo.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    // Tree-shake lucide-react: only the icons actually used ship.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
