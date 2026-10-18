import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { configureApp, configureProduction } from './app.setup'

async function bootstrap() {
  // rawBody: o webhook Pix valida a assinatura sobre os bytes originais do corpo.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })
  configureApp(app)
  configureProduction(app)
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0')
}
bootstrap()
