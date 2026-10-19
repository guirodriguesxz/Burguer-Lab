# Operação em produção

Guia curto para quem mantém o Burger Lab no ar (Render + Neon, mas vale para qualquer host).

## Domínio próprio e HTTPS

1. No Render: **Settings → Custom Domains → Add**, informe o domínio (ex.: `pedidos.suaLoja.com`).
2. No DNS do domínio, crie o `CNAME` apontando para o endereço `*.onrender.com` que o Render mostrar. O certificado HTTPS é emitido sozinho.
3. Ajuste as variáveis: `ADMIN_URL=https://pedidos.suaLoja.com/admin/` (link de redefinição de senha), `PUBLIC_API_URL=https://pedidos.suaLoja.com` (webhook do Pix) e, se usar, `CORS_ORIGIN`.
4. Em produção o cookie de sessão é `Secure`; abrir o painel por `http://` não mantém o login. Por isso o HTTPS é obrigatório.

## Backups

- O workflow `backup.yml` gera um backup lógico criptografado (NDJSON + gzip + AES-256-GCM, chave via scrypt) e guarda como artefato.
- Segredo necessário no GitHub: `BACKUP_PASSPHRASE` (guarde uma cópia em gerenciador de senhas; sem ela o backup não abre) e `DATABASE_URL`.
- **Teste a restauração** pelo menos uma vez por trimestre, num banco vazio: `npm run backup:restore -w @burger-lab/api -- arquivo.enc` (a restauração é transacional: ou entra tudo, ou nada). Backup nunca testado é só esperança.
- O Neon também mantém histórico (point-in-time) conforme o plano; use os dois.

## Monitoramento

- `GET /api/health` para o uptime check (UptimeRobot, Better Stack etc.). Alerte se falhar 2 vezes seguidas.
- `GET /metrics` (Prometheus) exige `Authorization: Bearer $METRICS_TOKEN`. Alertas úteis: taxa de 5xx, latência p95, pedidos pagos por hora caindo a zero em horário de funcionamento, pedidos Pix expirados em excesso.
- Logs estruturados (pino, JSON). `LOG_LEVEL` controla o volume; dados sensíveis (senhas, tokens, cookies) são ocultados.
- `SENTRY_DSN` (opcional) envia erros 5xx ao Sentry, com dados pessoais removidos.
- A trilha de auditoria (login, logout, mudança de senha, preço, cupom, reembolso, usuários) é mantida por `AUDIT_RETENTION_DAYS` dias.

## Rotação de segredos

| Segredo | Efeito da troca | Como |
| --- | --- | --- |
| `JWT_SECRET` | encerra todas as sessões | trocar no host e reiniciar |
| `PIX_WEBHOOK_SECRET` / `MP_WEBHOOK_SECRET` | webhooks com a assinatura antiga são recusados | trocar no host **e** no painel do provedor ao mesmo tempo |
| `MP_ACCESS_TOKEN` | pagamentos Pix param se estiver errado | gerar novo no painel e trocar |
| `DATABASE_URL` | derruba a API até reiniciar | trocar a senha no Neon, atualizar a variável |
| `BACKUP_PASSPHRASE` | backups antigos só abrem com a antiga | guarde as duas até o antigo vencer |

## Incidente: lista de checagem

1. `/api/health` responde? Se não, veja os logs de deploy no Render (migração falhou? banco inacessível?).
2. Pix não confirma: o webhook chega? Confira `PUBLIC_API_URL`, o segredo e os logs. Pagamento tardio é reembolsado automaticamente.
3. Suspeita de conta invadida: troque a senha do usuário (isso revoga as sessões dele) ou o `JWT_SECRET` (revoga todas) e consulte a auditoria.
4. Dados corrompidos: restaure o último backup num banco novo, compare e só então troque o `DATABASE_URL`.
5. Depois de resolver, anote causa e correção.
