#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
dest="$unit_dir/cursor-remote.service"

mkdir -p "$unit_dir"
node "$root/systemd/render.js" "$dest"

loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable cursor-remote.service
systemctl --user restart cursor-remote.service
systemctl --user status cursor-remote.service --no-pager
