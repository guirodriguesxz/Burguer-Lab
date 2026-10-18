#!/bin/sh
# Inicialização do container: aplica migrações (com novas tentativas), seed opcional e inicia a API.
# Bancos serverless (ex.: Neon gratuito) "dormem" quando ociosos e a primeira conexão pode falhar
# enquanto ele acorda; por isso as migrações são tentadas várias vezes antes de desistir.
set -e

attempt=0
max=10
until npx prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max" ]; then
    echo "Banco indisponível após $max tentativas. Abortando."
    exit 1
  fi
  echo "Banco indisponível (tentativa $attempt/$max). Nova tentativa em 6s..."
  sleep 6
done

if [ "$SEED_ON_BOOT" = "true" ]; then
  node dist-seed/seed.js
fi

exec node dist/main
