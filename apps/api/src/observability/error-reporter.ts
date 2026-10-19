import { Injectable, Logger } from '@nestjs/common'
import * as Sentry from '@sentry/node'

export interface ErrorContext {
  requestId?: string
  userId?: string
  route?: string
}

/** Para onde vão os erros inesperados (5xx). Trocar o serviço de monitoramento é implementar esta classe. */
export abstract class ErrorReporter {
  abstract capture(error: unknown, context: ErrorContext): void
}

/** Sem DSN configurado: o erro já aparece no log estruturado, e nada sai da aplicação. */
@Injectable()
export class NoopErrorReporter extends ErrorReporter {
  capture() {
    // nada a enviar
  }
}

/**
 * Remove de um evento do Sentry tudo que poderia identificar pessoas ou vazar segredos: cabeçalhos, cookies,
 * corpo da requisição, query strings e dados do usuário (fica só o id). O SDK já não envia dados pessoais por padrão; esta
 * limpeza garante que nada disso chegue ao Sentry mesmo que alguém ative essa opção por engano.
 */
export function scrubSentryEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.headers
    delete event.request.cookies
    delete event.request.data
    delete event.request.query_string
    if (event.request.url) event.request.url = event.request.url.split('?')[0]
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined
  delete event.server_name // nome da máquina
  return event
}

export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.SENTRY_DSN) return false
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.GIT_SHA,
    tracesSampleRate: 0, // só erros; sem tracing
    beforeSend: scrubSentryEvent,
  })
  return true
}

@Injectable()
export class SentryErrorReporter extends ErrorReporter {
  private readonly log = new Logger('Sentry')

  capture(error: unknown, ctx: ErrorContext) {
    try {
      Sentry.withScope((scope) => {
        if (ctx.requestId) scope.setTag('requestId', ctx.requestId)
        if (ctx.route) scope.setTag('route', ctx.route)
        if (ctx.userId) scope.setUser({ id: ctx.userId })
        Sentry.captureException(error)
      })
    } catch (e) {
      this.log.warn(`Falha ao enviar erro ao Sentry: ${e instanceof Error ? e.message : e}`)
    }
  }
}
