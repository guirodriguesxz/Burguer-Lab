#!/bin/sh
# Inicialização do container: aplica migrações (com novas tentativas), seed opcional e inicia a API.
# Bancos serverless (ex.: Neon gratuito) "dormem" quando ociosos e a primeira conexão pode falhar
# enquanto ele acorda. Só nesse caso (P1001/P1002, sem conexão) vale tentar de novo; erros de
# configuração (URL inválida, senha errada, migração quebrada) abortam na hora.

attempt=0
max=10
while true; do
  if out=$(npx prisma migrate deploy 2>&1); then
    echo "$out"
    break
  fi
  echo "$out"

  case "$out" in
    *P1001*|*P1002*)
      attempt=$((attempt + 1))
      if [ "$attempt" -ge "$max" ]; then
        echo "Banco inalcançável após $max tentativas. Abortando."
        exit 1
      fi
      echo "Banco inalcançável (tentativa $attempt/$max). Nova tentativa em 6s..."
      sleep 6
      ;;
    *)
      echo "Falha nas migrações (não é problema de conexão). Verifique DATABASE_URL e as migrações. Abortando."
      exit 1
      ;;
  esac
done

if [ "$SEED_ON_BOOT" = "true" ]; then
  node dist-seed/seed.js || exit 1
fi

exec node dist/main
