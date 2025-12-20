const nextConfig = {
    // Only use standalone for production builds (Electron)
    // In dev mode, let Next.js work normally to avoid "clientReferenceManifest" bugs
    output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
};

module.exports = nextConfig;
