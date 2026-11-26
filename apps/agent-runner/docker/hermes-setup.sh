#!/command/with-contenv sh
# Replaces the Hermes image's /etc/cont-init.d/01-hermes-setup. Its bootstrap
# runs commands as the hermes user, so the container's environment, which
# holds the runner's tokens, is closed to that user first, and the bootstrap
# runs without the tokens. The entrypoint runs this; were s6-overlay's /init
# to run instead, s6 would run it.
# Keep the names in step with WITHHELD in src/hermes/child-env.ts.
set -e

if [ -d /run/s6/container_environment ]; then
    chmod 0700 /run/s6/container_environment
fi

exec env -u KANEO_RUNNER_TOKEN -u KANEO_GIT_TOKEN -u GH_TOKEN -u GITHUB_TOKEN \
    -u GH_ENTERPRISE_TOKEN -u GITHUB_ENTERPRISE_TOKEN \
    -u GITHUB_APP_ID -u GITHUB_APP_INSTALLATION_ID -u GITHUB_PRIVATE_KEY \
    -u GITHUB_PRIVATE_KEY_BASE64 \
    /opt/hermes/docker/stage2-hook.sh
