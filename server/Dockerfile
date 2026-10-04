FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 4000
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm run dev"]
