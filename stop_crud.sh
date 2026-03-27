#!/bin/bash

PORT=4000

find_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v port="$PORT" '
      $1 == "LISTEN" && $4 ~ (":" port "$") {
        if (match($NF, /pid=([0-9]+)/, m)) print m[1]
      }'
    return
  fi
}

PIDS=$(find_pids | sort -u)

if [ -z "$PIDS" ]; then
  echo "No hay procesos escuchando en el puerto $PORT."
  exit 0
fi

echo "Deteniendo procesos en puerto $PORT: $PIDS"
for PID in $PIDS; do
  kill "$PID" 2>/dev/null || true
done

sleep 1

REMAINING=$(find_pids | sort -u)
if [ -n "$REMAINING" ]; then
  echo "Algunos procesos siguen activos, forzando cierre: $REMAINING"
  for PID in $REMAINING; do
    kill -9 "$PID" 2>/dev/null || true
  done
fi

echo "CRUD detenido."
