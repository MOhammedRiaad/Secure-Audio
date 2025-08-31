#!/usr/bin/env bash
set -euo pipefail

# Secure-Audio: Atomically replace the served React build with a new build
#
# Usage examples:
#   sudo bash scripts/update-frontend.sh --src /home/ubuntu/new-build
#   sudo bash scripts/update-frontend.sh --tar /home/ubuntu/build-artifact.tar.gz
#
# Nginx is expected to serve from:
#   /var/www/secure-audio/client/build
#
# The script will:
# - Validate source build contains index.html
# - Stage new build in a temp dir
# - Backup current build as a tar.gz under /var/www/secure-audio/backups
# - Atomically swap build directory
# - Set safe ownership and permissions
# - Test and reload Nginx

DOMAIN=${DOMAIN:-}
NGINX_TEST_AND_RELOAD=${NGINX_TEST_AND_RELOAD:-true}
DEST_ROOT="/var/www/secure-audio/client"
DEST_BUILD="$DEST_ROOT/build"
BACKUP_DIR="/var/www/secure-audio/backups"
STAGE_BASE="/var/www/secure-audio/tmp"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }
err() { echo "[ERROR] $*" >&2; }

usage() {
  cat <<USAGE
Usage: sudo bash scripts/update-frontend.sh [--src <dir>|--tar <file.tar.gz>] [--owner <user>] [--group <group>]

Options:
  --src DIR        Path to a prepared React build directory (should contain index.html at its root)
  --tar FILE       Path to a tar.gz containing the build (its root should contain index.html)
  --owner USER     File owner to set on deployed files (default: ubuntu)
  --group GROUP    File group to set on deployed files (default: ubuntu)

Environment:
  DOMAIN                    Optional; only used for logs
  NGINX_TEST_AND_RELOAD     If 'true' (default), run 'nginx -t' and reload after swap
USAGE
}

OWNER="ubuntu"
GROUP="ubuntu"
SRC_DIR=""
TAR_FILE=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --src)
      SRC_DIR="${2:-}"; shift 2;
      ;;
    --tar)
      TAR_FILE="${2:-}"; shift 2;
      ;;
    --owner)
      OWNER="${2:-}"; shift 2;
      ;;
    --group)
      GROUP="${2:-}"; shift 2;
      ;;
    -h|--help)
      usage; exit 0;
      ;;
    *)
      err "Unknown argument: $1"; usage; exit 1;
      ;;
  esac
done

if [[ -z "$SRC_DIR" && -z "$TAR_FILE" ]]; then
  err "You must provide either --src DIR or --tar FILE"; usage; exit 1;
fi
if [[ -n "$SRC_DIR" && -n "$TAR_FILE" ]]; then
  err "Provide only one of --src or --tar"; usage; exit 1;
fi

TS=$(date +%Y%m%d%H%M%S)
STAGE_DIR="$STAGE_BASE/build-$TS"
OLD_DIR="$DEST_BUILD._old_$TS"
BACKUP_FILE="$BACKUP_DIR/build-$TS.tar.gz"

log "Starting frontend update${DOMAIN:+ for domain: $DOMAIN}"

# Ensure base directories exist
sudo mkdir -p "$DEST_ROOT" "$BACKUP_DIR" "$STAGE_BASE"

# Stage new build
if [[ -n "$SRC_DIR" ]]; then
  if [[ ! -d "$SRC_DIR" ]]; then err "--src not a directory: $SRC_DIR"; exit 1; fi
  log "Staging from directory: $SRC_DIR -> $STAGE_DIR"
  sudo mkdir -p "$STAGE_DIR"
  sudo rsync -a --delete "$SRC_DIR"/ "$STAGE_DIR"/
elif [[ -n "$TAR_FILE" ]]; then
  if [[ ! -f "$TAR_FILE" ]]; then err "--tar not a file: $TAR_FILE"; exit 1; fi
  log "Staging from tarball: $TAR_FILE -> $STAGE_DIR"
  sudo mkdir -p "$STAGE_DIR"
  sudo tar -xzf "$TAR_FILE" -C "$STAGE_DIR"
fi

# Validate staged build
if [[ ! -f "$STAGE_DIR/index.html" ]]; then
  # Sometimes build output nests files under 'build' inside tar. Try to detect.
  if [[ -f "$STAGE_DIR/build/index.html" ]]; then
    log "Detected nested 'build' directory inside artifact; flattening"
    sudo rsync -a --delete "$STAGE_DIR/build/" "$STAGE_DIR/"
    sudo rm -rf "$STAGE_DIR/build"
  fi
fi
if [[ ! -f "$STAGE_DIR/index.html" ]]; then
  err "Staged build missing index.html at root: $STAGE_DIR"; exit 1;
fi

# Prepare permissions on staged files
sudo chown -R "$OWNER":"$GROUP" "$STAGE_DIR"
sudo find "$STAGE_DIR" -type d -exec chmod 755 {} +
sudo find "$STAGE_DIR" -type f -exec chmod 644 {} +

# Backup current build if exists
if [[ -d "$DEST_BUILD" ]]; then
  log "Backing up current build to $BACKUP_FILE"
  sudo tar -czf "$BACKUP_FILE" -C "$DEST_ROOT" "$(basename "$DEST_BUILD")"
  log "Renaming current build to $OLD_DIR"
  sudo mv "$DEST_BUILD" "$OLD_DIR"
fi

# Atomic swap: move staged into place
log "Activating new build at $DEST_BUILD"
sudo mv "$STAGE_DIR" "$DEST_BUILD"

# Cleanup old directory if present
if [[ -d "$OLD_DIR" ]]; then
  log "Removing old build directory: $OLD_DIR"
  sudo rm -rf "$OLD_DIR"
fi

# Test and reload Nginx (optional)
if [[ "${NGINX_TEST_AND_RELOAD}" == "true" ]]; then
  log "Testing Nginx configuration"
  if sudo nginx -t; then
    log "Reloading Nginx"
    sudo systemctl reload nginx
  else
    err "Nginx config test failed; NOT reloading"
  fi
fi

log "Frontend update complete. Served path: $DEST_BUILD"
log "If browser shows old content, force-refresh (Ctrl+F5) due to client-side caching."
