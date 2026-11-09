#!/usr/bin/env bash
# VPS only. Usage and bootstrap procedure: docs/setup.md, section 11.
set -euo pipefail
umask 077
die() { echo "ERROR: $*" >&2; exit 1; }
mode=${1:-}
root=${2:-}
[[ $root = /* && $root != / && -d $root ]] || die 'Existing absolute deployment root required'
root=$(realpath "$root")
for tool in docker flock curl; do command -v "$tool" >/dev/null || die "Missing $tool"; done
exec 9>"$root/.deploy.lock"
flock -n 9 || die 'Another deployment/rollback is active'
mkdir -p "$root/releases" "$root/.private/releases"
current= previous=- watermark=0
if [[ -f $root/state ]]; then
  read -r current previous watermark < "$root/state"
fi
valid_id() { [[ $1 =~ ^[0-9]+-[0-9a-f]{40}-[a-zA-Z0-9]+$ ]]; }
[[ -z $current ]] || valid_id "$current" || die 'Invalid current release state'
[[ $previous = - ]] || valid_id "$previous" || die 'Invalid previous release state'
[[ $watermark =~ ^[0-9]{1,10}$ ]] || die 'Invalid run watermark'
save_state() {
  printf '%s %s %s\n' "$1" "$2" "$3" > "$root/state.tmp"
  mv -f "$root/state.tmp" "$root/state"
}
compose() {
  local dir=$root/releases/$1
  RESORA_IMAGE_TAG=$(cat "$dir/sha") docker compose --project-name resora-prod \
    --project-directory "$dir" -f "$dir/compose.yml" -f "$dir/images.yml" "${@:2}"
}
smoke() {
  local code path
  # Exact 200, verified TLS, no redirects or retrying credential-bearing calls.
  for path in / /trpc/healthCheck; do
    code=$(curl --connect-timeout 10 --max-time 30 --silent --show-error \
      --output /dev/null --write-out '%{http_code}' "https://resora.telkomdormitory.com$path") || return 1
    [[ $code = 200 ]] || return 1
  done
}
healthy() {
  local service container
  for service in web server; do
    container=$(docker inspect "resora-prod-$service-1" \
      --format '{{.State.Health.Status}}') || return 1
    [[ $container = healthy ]] || return 1
  done
}
verify_images() {
  local id=$1 service expected actual
  for service in web server; do
    expected=$(docker image inspect "ghcr.io/tel-u-dormitory/resora-$service@$(cat "$root/releases/$id/$service.digest")" \
      --format '{{.Id}}') || return 1
    actual=$(docker inspect "resora-prod-$service-1" --format '{{.Image}}') || return 1
    [[ $actual = "$expected" ]] || return 1
  done
}
available() {
  local service
  for service in web server; do
    docker image inspect "ghcr.io/tel-u-dormitory/resora-$service@$(cat "$root/releases/$1/$service.digest")" \
      >/dev/null || return 1
  done
}
apply() {
  compose "$1" up -d --no-build --pull never --wait --wait-timeout 180 || return 1
  healthy && verify_images "$1" && smoke
}
if [[ $mode = status ]]; then
  printf 'current=%s previous=%s latest_run=%s\n' "${current:-none}" "$previous" "$watermark"
  if [[ -f $root/pending ]]; then echo 'Interrupted transaction pending recovery'; fi
  docker ps --filter label=com.docker.compose.project=resora-prod \
    --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
  exit 0
fi
[[ $mode = bootstrap || $mode = deploy || $mode = rollback ]] || die 'Expected bootstrap, deploy, rollback, or status'
# A pending marker survives SIGKILL/reboot. Recover before accepting another change.
if [[ -f $root/pending ]]; then
  [[ -n $current ]] || die 'Interrupted transaction without baseline; operator recovery required'
  echo 'Recovering interrupted transaction to recorded current release'
  available "$current" && apply "$current" || die 'Recovery failed; pending marker retained'
  rm "$root/pending"
fi
if [[ $mode = rollback ]]; then
  [[ -n $current && $previous != - ]] || die 'No previous release available'
  target=$previous
else
  source_dir=${3:-}; sha=${4:-}; web=${5:-}; server=${6:-}; run=${7:-0}
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || die 'Full commit SHA required'
  [[ $web =~ ^sha256:[0-9a-f]{64}$ && $server =~ ^sha256:[0-9a-f]{64}$ ]] || die 'Both image digests required'
  [[ $run =~ ^[0-9]{1,10}$ ]] || die 'Numeric workflow run required'
  [[ -d $source_dir ]] || die 'Source directory missing'
  if [[ $mode = bootstrap ]]; then
    [[ -z $current && $run = 0 ]] || die 'Bootstrap only allowed without existing state and with run 0'
    # Only adopt the actual standalone Compose file used by the live project.
    live_config=$(docker inspect resora-prod-server-1 \
      --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')
    [[ $live_config = "$(realpath "$source_dir/docker-compose.prod.yml")" ]] || die 'Bootstrap source is not the live standalone Compose file'
    healthy && smoke || die 'Baseline must already be healthy over HTTPS'
  else
    [[ -n $current ]] || die 'Bootstrap existing healthy production before enabling CD'
    ((10#$run > 10#$watermark)) || die 'Stale/already deployed workflow run; use explicit rollback instead'
    available "$current" && verify_images "$current" && healthy || die 'Current release drift/unhealthy or rollback images missing'
    # Conservative floor for the current ~4 GB pair plus extraction; no pruning.
    free_kb=$(df -Pk "$root" | awk 'END {print $4}')
    ((free_kb >= 6291456)) || die 'At least 6 GiB free required before image pull'
  fi
  for service in web server; do
    [[ -s $root/.private/production/$service.env ]] || die "Missing runtime $service.env"
    [[ -r $source_dir/apps/$service/.env.example ]] || die "Missing synthetic $service build template"
  done
  release=$(mktemp -d "$root/releases/$run-$sha-XXXXXX")
  target=${release##*/}
  mkdir -p "$release/apps/web" "$release/apps/server" "$root/.private/releases/$target/production"
  if [[ $mode = bootstrap ]]; then
    # Freeze original interpolation too; relative env/template paths stay portable.
    RESORA_IMAGE_TAG=$sha docker compose --project-name resora-prod \
      --project-directory "$source_dir" -f "$source_dir/docker-compose.prod.yml" \
      config --no-env-resolution --no-path-resolution > "$release/compose.yml"
  else
    cp "$source_dir/docker-compose.prod.yml" "$release/compose.yml"
  fi
  for service in web server; do
    cp "$source_dir/apps/$service/.env.example" "$release/apps/$service/.env.example"
    # Runtime-only snapshot: never uploaded to GitHub or included in build context.
    install -m 600 "$root/.private/production/$service.env" "$root/.private/releases/$target/production/$service.env"
  done
  ln -s "$root/.private/releases/$target" "$release/.private"
  printf '%s\n' "$sha" > "$release/sha"
  printf '%s\n' "$web" > "$release/web.digest"
  printf '%s\n' "$server" > "$release/server.digest"
  cat > "$release/images.yml" <<EOF
services:
  web:
    image: ghcr.io/tel-u-dormitory/resora-web@$web
  server:
    image: ghcr.io/tel-u-dormitory/resora-server@$server
EOF
  compose "$target" config --quiet || die 'Invalid candidate configuration'
  if [[ $mode = bootstrap ]]; then
    available "$target" && verify_images "$target" || die 'Baseline digests do not match live containers'
    # Pinning SHA as well prevents adopting an unrelated running image pair.
    for service in web server; do
      live_tag=$(docker inspect "resora-prod-$service-1" --format '{{.Config.Image}}')
      [[ $live_tag = "ghcr.io/tel-u-dormitory/resora-$service:$sha" ]] || die 'Baseline SHA does not match live tag'
    done
    save_state "$target" - 0
    echo "Baseline recorded: $target; containers unchanged"
    exit 0
  fi
  # No container is changed unless BOTH content-addressed pulls have succeeded.
  docker pull "ghcr.io/tel-u-dormitory/resora-web@$web"
  docker pull "ghcr.io/tel-u-dormitory/resora-server@$server"
  available "$target" || die 'Candidate pair unavailable after pull'
fi
[[ -n $current ]] || die 'No recovery baseline'
available "$current" && available "$target" || die 'Required images unavailable locally'
compose "$target" config --quiet || die 'Invalid target configuration'
printf '%s\n' "$target" > "$root/pending.tmp"
mv -f "$root/pending.tmp" "$root/pending"
recover_on_exit() {
  local result=$?
  local fallback saved_previous saved_watermark
  trap - EXIT INT TERM
  if [[ -f $root/pending ]]; then
    echo 'Rollout failed/interrupted; restoring current release' >&2
    # A signal may arrive immediately after the atomic commit. Read its result
    # rather than using an in-memory pointer that could still name the old pair.
    if read -r fallback saved_previous saved_watermark < "$root/state" && valid_id "$fallback" && apply "$fallback"; then
      rm "$root/pending"
      echo 'Recorded healthy release restored; deployment remains failed' >&2
    else
      echo 'ROLLBACK FAILED: operator action required; pending marker retained' >&2
    fi
    exit 1
  fi
  exit "$result"
}
trap recover_on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
apply "$target" || die 'Rollout/health/HTTPS check failed'
if [[ $mode = deploy ]]; then watermark=$run; fi
save_state "$target" "$current" "$watermark"
rm "$root/pending"
echo "Healthy release committed: $target"
# Keep release files/images for operator-reviewed cleanup; never prune globally.
