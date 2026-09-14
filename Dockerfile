FROM node:24-alpine AS base
WORKDIR /app
FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build
FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S museum && adduser -S museum -G museum
COPY --from=builder --chown=museum:museum /app/.next/standalone ./
COPY --from=builder --chown=museum:museum /app/.next/static ./.next/static
COPY --from=builder --chown=museum:museum /app/public ./public
USER museum
EXPOSE 3000
CMD ["node", "server.js"]
