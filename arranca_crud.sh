#!/bin/bash

# Arranca el servidor (puerto 4000)
cd ~/dev/crud_bonds/server
npm start &

DEFAULT_IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
SERVER_IP=$(
  ipconfig getifaddr "$DEFAULT_IFACE" 2>/dev/null || \
  ipconfig getifaddr en0 2>/dev/null || \
  ipconfig getifaddr en1 2>/dev/null || \
  echo "localhost"
)

echo "App corriendo en http://$SERVER_IP:4000"
