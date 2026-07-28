# Deployment

The production build is static: a folder of files, no server-side runtime, no
database. Anything that serves static files can host it. This covers the Docker
image (the default), plain static hosts, sub-path deploys, and getting new
snippets onto a running instance.

## Docker

The repo ships a two-stage build. Node builds the app, the result is copied into
an `nginx:alpine` image, and nginx serves it. The nginx config
(`docker/nginx.conf`) handles the static serving, a hash-router fallback, gzip,
and cache headers split by how often each file type changes.

### Build and run locally

```bash
docker compose up -d --build
```

Dashboard on http://localhost:8080. The port maps `8080:80` in
`docker-compose.yml`; change the host side if 8080 is taken. `restart:
unless-stopped` brings it back after a reboot.

Whatever is in `public/snippets/` when the image builds gets baked in. Rebuild to
change the bundled set.

### Pull the prebuilt image

`.github/workflows/docker.yml` builds and pushes to GHCR on every push to `main`
and on `v*` tags. To pull instead of build:

```bash
docker run -d -p 8080:80 --name snippet-dashboard \
  ghcr.io/<owner>/snippet-dashboard:latest
```

Or as a compose file with no build step:

```yaml
services:
  snippet-dashboard:
    image: ghcr.io/<owner>/snippet-dashboard:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

Tags: `latest` tracks `main`, `X.Y.Z` and `X.Y` are cut from `v*` tags.

### Health check

The image has a `HEALTHCHECK` that hits `/` every 30s, so `docker ps` and compose
report the container as healthy without extra tooling.

## Static hosting

No Docker needed. Build and upload the folder:

```bash
npm run build
# copy the contents of dist/ to your host's web root
```

Works on nginx, Caddy, Netlify, GitHub Pages, an S3 bucket, or a folder the
homelab already serves. The app is hash-routed, so it needs no rewrite rules for
its own navigation; a plain static host is enough. Snippet files and the manifest
are already inside `dist/`.

## Sub-path deploys

By default the app assumes it lives at the domain root (`/`). To serve it under a
sub-path (behind a reverse proxy at `/snippets/`, or on GitHub Pages at
`/<repo>/`), set `VITE_BASE` at build time so the asset and manifest URLs come out
right:

```bash
VITE_BASE=/snippets/ npm run build
```

With Docker, pass it as a build arg:

```bash
docker compose build --build-arg VITE_BASE=/snippets/
# or uncomment the args block in docker-compose.yml
```

The base is baked in at build time (Vite writes it into `BASE_URL`), so it can't
change on an already-built image or `dist/`. Changing the sub-path means
rebuilding. Serving on a dedicated subdomain at its root needs no base change,
which is usually the simpler option behind a proxy.

## Adding snippets to a running instance

Two ways, depending on whether the snippet should be shared or just yours.

- **Just this browser, no redeploy.** Use the in-app editor. It saves to the
  browser (see [SNIPPETS.md](SNIPPETS.md#the-editor)), so a snippet appears
  immediately for you and survives app updates, but only on that device.
- **Shared, for everyone.** Add the folder under `public/snippets/`, commit, and
  rebuild the image (or `npm run build` and re-upload). The `prebuild` hook
  regenerates the manifest, so the new snippet is listed on the next build.

To serve extra snippets from outside the image without rebuilding, mount a folder
over the served path. The catch is the manifest: the app only lists what the
manifest contains, and nginx won't regenerate it. So generate it on the host first
and mount the whole folder read-only:

```bash
npm run snippets:manifest   # writes public/snippets/manifest.json
```

```yaml
volumes:
  - ./public/snippets:/usr/share/nginx/html/snippets:ro
```

For most cases the browser layer or a rebuild is simpler; the mount is there for
when you really want files living outside the image.
