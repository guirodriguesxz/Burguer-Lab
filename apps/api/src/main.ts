import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  // rawBody: o webhook Pix valida a assinatura sobre os bytes originais do corpo.
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.enableCors({ origin: true })
  app.setGlobalPrefix('api')
  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()
