import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { INestApplication } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { corsOrigin } from './cors'

/** Configuração compartilhada entre a aplicação real e os testes de integração. */
export function configureApp(app: INestApplication) {
  app.enableCors({ origin: corsOrigin() })
  app.setGlobalPrefix('api')
}

/**
 * Produção: a própria API serve os front-ends já compilados (totem em "/" e admin em "/admin"),
 * então um único container basta. Em desenvolvimento a pasta "public" não existe e nada muda.
 */
export function configureProduction(app: NestExpressApplication) {
  // Atrás de proxy (Render, Fly, nginx) o IP real vem do cabeçalho; necessário para o rate limit.
  app.set('trust proxy', 1)
  app.use(helmet({ crossOriginEmbedderPolicy: false }))

  const publicDir = join(__dirname, '..', 'public')
  if (existsSync(publicDir)) app.useStaticAssets(publicDir)
}
