#!/bin/bash

PORT=4000
SERVER_DIR="$HOME/dev/crud_bonds/server"

get_local_ip() {
  if command -v ip >/dev/null 2>&1; then
    ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}'
    return
  fi

  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i !~ /^127\./) {print $i; exit}}'
    return
  fi

  # Fallback para macOS
  if command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
    default_iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
    ipconfig getifaddr "$default_iface" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
    return
  fi

  echo "localhost"
}

get_public_ip() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 2 https://api.ipify.org 2>/dev/null
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO- --timeout=2 https://api.ipify.org 2>/dev/null
    return
  fi
}

is_port_in_use() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk -v port="$PORT" '$1 == "LISTEN" && $4 ~ (":" port "$") {found=1} END {exit found ? 0 : 1}'
    return
  fi

  return 1
}

if is_port_in_use; then
  echo "El puerto $PORT ya esta en uso. No se inicia una nueva instancia."
else
  cd "$SERVER_DIR" || exit 1
  npm start &
fi

LOCAL_IP=$(get_local_ip)
PUBLIC_IP=$(get_public_ip)

echo "App local:    http://${LOCAL_IP:-localhost}:$PORT"
if [ -n "$PUBLIC_IP" ]; then
  echo "App externa:  http://$PUBLIC_IP:$PORT"
else
  echo "App externa:  no se pudo detectar IP publica automaticamente"
fi
