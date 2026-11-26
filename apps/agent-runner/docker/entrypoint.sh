#!/bin/sh
# Starts the Kaneo agent runner, under tini rather than the Hermes image's
# s6-overlay (see the Dockerfile). The image's bootstrap runs here, the way
# its entrypoint-dispatch.sh runs it without s6. The runner stays root and
# starts Hermes itself as unprivileged users of its own, one per concurrency
# slot, so Hermes can't read the runner's tokens or its git mirrors.
set -e

# Before the image's bootstrap, whose own error for this suggests otherwise.
if [ "$(id -u)" != 0 ]; then
    echo "[agent-runner] The runner must start as root, not with --user or runAsUser: it runs Hermes as unprivileged users itself." >&2
    exit 1
fi

# The bootstrap uses s6's helpers, which /init would put on PATH.
PATH="/command:/package/admin/s6/command:${PATH}" sh /etc/cont-init.d/01-hermes-setup
exec /usr/local/bin/node /opt/kaneo-agent-runner/index.js
