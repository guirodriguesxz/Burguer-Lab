import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { configureApp, configureProduction } from './app.setup'
import { initSentry } from './observability/error-reporter'

async function bootstrap() {
  // rawBody: o webhook Pix valida a assinatura sobre os bytes originais do corpo.
  initSentry() // só age se SENTRY_DSN estiver definido
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true })
  app.useLogger(app.get(Logger)) // logs do Nest também saem estruturados (JSON)
  configureApp(app)
  configureProduction(app)
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0')
}
bootstrap()
