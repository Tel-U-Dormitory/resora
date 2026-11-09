#!/usr/bin/env bash
# GitHub runner only. Never log key material or interpolate unvalidated SSH input.
set -euo pipefail
[[ ${VPS_HOST:-} =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ ${VPS_USER:-} =~ ^[a-z_][a-z0-9_-]*$ ]]
[[ ${VPS_PORT:-} =~ ^[0-9]{1,5}$ ]] && ((10#$VPS_PORT > 0 && 10#$VPS_PORT < 65536))
[[ ${VPS_DEPLOY_PATH:-} =~ ^/[a-zA-Z0-9/_-]+$ && $VPS_DEPLOY_PATH != / ]]
[[ ${GITHUB_SHA:-} =~ ^[0-9a-f]{40}$ && ${GITHUB_RUN_NUMBER:-} =~ ^[1-9][0-9]{0,9}$ ]]
[[ ${WEB_DIGEST:-} =~ ^sha256:[0-9a-f]{64}$ && ${SERVER_DIGEST:-} =~ ^sha256:[0-9a-f]{64}$ ]]
[[ -n ${VPS_SSH_KEY:-} && -n ${VPS_KNOWN_HOSTS:-} ]]
umask 077
key_dir=$(mktemp -d)
trap 'rm -rf -- "$key_dir"' EXIT
printf '%s\n' "$VPS_SSH_KEY" > "$key_dir/key"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$key_dir/known_hosts"
unset VPS_SSH_KEY VPS_KNOWN_HOSTS
ssh_options=(-i "$key_dir/key" -p "$VPS_PORT" -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$key_dir/known_hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
# The receiver holds a separate upload lock until the deployment process exits.
# No git pull, no remote build, no production credentials in this archive.
# Send the receiver first as a command; stdin remains exclusively the tar stream.
receiver='set -euo pipefail
umask 077
root=$1; sha=$2; web=$3; server=$4; run=$5
test -d "$root"
exec 8>"$root/.upload.lock"
flock -n 8 || { echo "Another upload/deployment is active" >&2; exit 1; }
incoming=$(mktemp -d "$root/incoming.XXXXXX")
trap '\''rm -rf -- "$incoming"'\'' EXIT
tar -xf - -C "$incoming"
# Ignore terminal hangup: finish rollout/recovery under the host lock.
trap '\'''\'' HUP
# Keep rollout output independent of the SSH pipe after a client disconnect.
set +e
bash "$incoming/scripts/deploy-prod.sh" deploy "$root" "$incoming" "$sha" "$web" "$server" "$run" > "$root/deploy-$run.log" 2>&1
result=$?
cat "$root/deploy-$run.log"
exit "$result"'
printf -v remote 'bash -c %q -- %q %q %q %q %q' \
  "$receiver" "$VPS_DEPLOY_PATH" "$GITHUB_SHA" "$WEB_DIGEST" "$SERVER_DIGEST" "$GITHUB_RUN_NUMBER"
tar -cf - docker-compose.prod.yml scripts/deploy-prod.sh \
  apps/web/.env.example apps/server/.env.example |
  ssh "${ssh_options[@]}" "$VPS_USER@$VPS_HOST" "$remote"
