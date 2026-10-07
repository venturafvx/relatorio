#!/bin/sh
# Atualiza o app na VPS: puxa o código, reconstrói a imagem e reinicia só o stack "relatorio".
set -e
cd /var/www/relatorio
git pull --ff-only
docker build -t relatorio:latest .
docker stack deploy -c docker-compose.yml relatorio
docker service update --force relatorio_web
docker service ps relatorio_web --no-trunc | head -3
