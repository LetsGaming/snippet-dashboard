# syntax=docker/dockerfile:1

# ---- build ----
# Node 22 matches @types/node in package.json. This stage runs the normal
# `npm run build`, so the `prebuild` hook regenerates the snippet manifest and
# whatever sits in public/snippets/ at build time ends up baked into the image.
FROM node:22-alpine AS build
WORKDIR /app

# Install deps first so this layer stays cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Sub-path deploys (e.g. behind a reverse proxy at /snippets/) set this at build
# time; the default is the domain root. See docs/DEPLOYMENT.md.
ARG VITE_BASE=/
ENV VITE_BASE=${VITE_BASE}
RUN npm run build

# ---- serve ----
FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
