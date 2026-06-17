import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/erp/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        source: '/api/erp/pedidos/:path*',
        destination: 'http://localhost:3001/api/pedidos/:path*',
      },
      {
        source: '/api/erp/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
};

export default nextConfig;