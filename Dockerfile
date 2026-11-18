FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun test src/ && bun --bun run build

# build/ is self-contained (all packages are devDependencies, so adapter-node bundles them).
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/build build
COPY package.json .
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data BODY_SIZE_LIMIT=10M
EXPOSE 3000
CMD ["node", "build"]
