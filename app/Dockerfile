FROM node:22.10.0-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# pnpm без corepack
RUN npm i -g pnpm@latest

# pnpm в CI-режиме (важно для docker build)
ENV CI=true

# Ставим зависимости (лучше кэшируется)
COPY package.json ./
# Если есть lock — раскомментируй:
# COPY pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile=false

# Копируем исходники
COPY . .

EXPOSE 8545
CMD ["pnpm", "hardhat", "node", "--hostname", "0.0.0.0"]
