/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: "/Olle-pwa-",
  assetPrefix: "/Olle-pwa-",
};

export default nextConfig;
