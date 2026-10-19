import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import { AllExceptionsFilter } from './all-exceptions.filter'
import { ErrorReporter, NoopErrorReporter, SentryErrorReporter } from './error-reporter'
import { MetricsController } from './metrics.controller'
import { metricsMiddleware } from './metrics.middleware'
import { MetricsService } from './metrics.service'
import { buildPinoHttpOptions } from './pino-options'

@Global()
@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: buildPinoHttpOptions() })],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    { provide: ErrorReporter, useFactory: () => (process.env.SENTRY_DSN ? new SentryErrorReporter() : new NoopErrorReporter()) },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [MetricsService, ErrorReporter],
})
export class ObservabilityModule implements NestModule {
  constructor(private readonly metrics: MetricsService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(metricsMiddleware(this.metrics)).forRoutes('*')
  }
}
