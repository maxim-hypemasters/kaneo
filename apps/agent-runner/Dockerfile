# Kaneo AI agent runner: Hermes Agent plus a small Node service that claims
# readiness checks and Ship runs from Kaneo. Build from the repository root:
#   docker build -f apps/agent-runner/Dockerfile -t kaneo-agent-runner .

# The bundle needs only hono/client at build time; types come from the
# workspace and are checked in CI, not here.
FROM --platform=$BUILDPLATFORM node:24.19.0-alpine AS builder
WORKDIR /build
RUN npm install --no-save --no-audit --no-fund esbuild@0.28.1 hono@4.13.12
COPY apps/agent-runner/src ./src
RUN npx esbuild src/index.ts --bundle --platform=node --target=node24 \
  --format=esm --outfile=dist/index.js

FROM nousresearch/hermes-agent:v0.23.4
# Node and git ship with the Hermes image; gh opens the pull requests, and
# tini, in place of the image's compatibility shim of that name, is PID 1.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gh tini \
  && rm -rf /var/lib/apt/lists/*
# Nothing that runs as the hermes user may hold the container's environment,
# which has the runner's tokens. The runner doesn't run under the image's
# s6-overlay: with s6 as PID 1, Hermes serves every chat from the gateway s6
# supervises, which runs as that user with that environment. tini is PID 1
# instead, and the entrypoint runs the image's bootstrap without the tokens
# (01-hermes-setup). In case /init runs anyway, the s6 services that would
# run as that user with the environment go too: the dashboard and gateway
# services, the gateway reconciliation in 02-reconcile-profiles, and
# 015-supervise-perms, which lets that user's group start root-supervised
# services. The no-op main-hermes service stays, since s6 needs one.
RUN rm -rf /etc/s6-overlay/s6-rc.d/dashboard \
    /etc/s6-overlay/s6-rc.d/profile-gateways \
    /etc/s6-overlay/s6-rc.d/user/contents.d/dashboard \
    /etc/s6-overlay/s6-rc.d/user/contents.d/profile-gateways \
    /etc/cont-init.d/015-supervise-perms \
    /etc/cont-init.d/02-reconcile-profiles
COPY --chmod=0755 apps/agent-runner/docker/hermes-setup.sh /etc/cont-init.d/01-hermes-setup
COPY --from=builder /build/dist/index.js /opt/kaneo-agent-runner/index.js
COPY --chmod=0755 apps/agent-runner/docker/entrypoint.sh /opt/kaneo-agent-runner/entrypoint.sh
RUN mkdir -p /work
# The runner runs as root and starts Hermes, and git in Hermes's checkout, as
# one user per concurrency slot (uid and gid HERMES_UID+1 and up, created at
# startup), with a Hermes home of its own in each run's directory.
# HERMES_UID/HERMES_GID set the image's own hermes user, which only the
# image's bootstrap runs as.
# The base image's /opt/data volume, Hermes's default home, goes unused. Its
# PATH also has /opt/data/.local/bin, which that user can write, ahead of
# /usr/bin; root must never look up a command there.
ENV WORK_DIR=/work HERMES_UID=10000 HERMES_GID=10000 \
  PATH=/opt/hermes/bin:/opt/hermes/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
VOLUME ["/work"]
# -s: tini still reaps what Hermes leaves behind under another init, such as
# docker run --init.
ENTRYPOINT ["/usr/bin/tini", "-s", "--", "/opt/kaneo-agent-runner/entrypoint.sh"]
