-- Ollama can run without authentication, while any provider can use a
-- credential-specific API base URL.
ALTER TABLE "llm_credentials"
  ALTER COLUMN "encrypted_key" DROP NOT NULL,
  ADD COLUMN "base_url" TEXT;
