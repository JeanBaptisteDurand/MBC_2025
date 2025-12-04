/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PUBLIC_ONCHAINKIT_API_KEY: string;
  readonly VITE_ZERODEV_PROJECT_ID: string;
  readonly VITE_ZERODEV_BUNDLER_URL: string;
  readonly VITE_ZERODEV_PAYMASTER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
