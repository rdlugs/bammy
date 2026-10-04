import { generateKeyPairSync } from "node:crypto";
import { defineConfig } from "vitest/config";

// A throwaway GitHub App so the installation flow is testable; every forge call
// is stubbed, so this key never signs anything GitHub sees.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    env: {
      GITHUB_HOST: "github.com",
      GITHUB_APP_ID: "123",
      GITHUB_APP_SLUG: "bammy-test",
      GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
      GITHUB_APP_CLIENT_ID: "client-id",
      GITHUB_APP_CLIENT_SECRET: "client-secret",
      GITHUB_WEBHOOK_SECRET: "webhook-secret",
      API_PUBLIC_URL: "https://bammy.example.com",
    },
  },
});
