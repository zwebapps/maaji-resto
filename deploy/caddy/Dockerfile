# Caddy with two security modules compiled in. There is no CDN in front
# of this VPS, so the WAF and the edge rate limits live here:
#
#   coraza-caddy     OWASP Coraza WAF + the OWASP Core Rule Set (CRS)
#   caddy-ratelimit  per-IP sliding-window limits on login/code/order routes
#
# Built on the VPS by `deploy/deploy.sh build` (next to the app image).
# Versions are pinned so a release can't silently pick up a new module;
# bump them deliberately and re-run `caddy validate` (see deploy/SECURITY.md).
# (Named EDGE_CADDY_VERSION: the builder image sets its own CADDY_VERSION
# env, which would shadow an ARG of that name.)
ARG EDGE_CADDY_VERSION=2.11.9

FROM caddy:${EDGE_CADDY_VERSION}-builder-alpine AS build
ARG EDGE_CADDY_VERSION
RUN xcaddy build v${EDGE_CADDY_VERSION} \
      --with github.com/corazawaf/coraza-caddy/v2@v2.6.2 \
      --with github.com/mholt/caddy-ratelimit@5625512f24f6

FROM caddy:${EDGE_CADDY_VERSION}-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
