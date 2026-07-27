#!/bin/bash
mount="$1"
ch="$2"
log="/var/log/soma-relay/${mount}.log"
echo "[$(date +%T)] $mount -> $ch (PID $$)" >> /var/log/soma-relay/status.log
exec ffmpeg -hide_banner -loglevel warning \
  -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 \
  -i "http://ice1.somafm.com/${ch}-128-mp3" \
  -c copy -content_type audio/mpeg \
  -f mp3 \
  "icecast://source:hackme@127.0.0.1:8000/${mount}" \
  > "$log" 2>&1
