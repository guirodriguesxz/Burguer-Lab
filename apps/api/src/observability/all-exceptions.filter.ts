import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { ErrorReporter } from './error-reporter'

/**
 * Erros esperados (400, 401, 403, 404, 409...) seguem o caminho normal. Erros inesperados (5xx: bug,
 * banco fora, falha de provedor) são registrados com o id da requisição e enviados ao monitoramento.
 * O cliente continua recebendo só a resposta genérica do Nest, nunca o stack trace.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Exception')

  // O adaptador HTTP é injetado pelo próprio Nest na classe base (BaseExceptionFilter); ele ainda não existe
  // quando o filtro é construído, por isso não pode ser passado ao super().
  constructor(private readonly reporter: ErrorReporter) {
    super()
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    if (status >= 500) {
      const req = host.switchToHttp().getRequest<{ id?: string; method?: string; route?: { path?: string }; baseUrl?: string; user?: { sub?: string } }>()
      const route = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : undefined
      this.log.error(
        { requestId: req.id, route, err: exception instanceof Error ? { message: exception.message, stack: exception.stack } : String(exception) },
        'Erro inesperado',
      )
      try {
        this.reporter.capture(exception, { requestId: req.id, userId: req.user?.sub, route })
      } catch (e) {
        // Monitoramento fora do ar nunca pode impedir a resposta ao cliente (sem isso a requisição ficaria pendurada).
        this.log.warn(`Falha ao reportar o erro: ${e instanceof Error ? e.message : e}`)
      }
    }
    super.catch(exception, host)
  }
}
