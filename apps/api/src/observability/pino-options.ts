import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Options } from 'pino-http'

/** O id aceito de fora (X-Request-ID) precisa ser curto e sem caracteres estranhos: ele vai para logs e cabeçalhos. */
const SAFE_REQUEST_ID = /^[\w.-]{1,64}$/

const stripQuery = (url: string | undefined) => (url ?? '').split('?')[0]

/** Rotas barulhentas que não valem uma linha de log por requisição. */
const QUIET = /(\/health|\/metrics)$|^\/(assets|admin\/assets)\//

/**
 * Logs estruturados (JSON, uma linha por requisição) com id de correlação, sem dados sensíveis:
 * não registra cabeçalhos, corpo, cookies, Authorization nem a query string da URL. (A redação de
 * cabeçalhos fica como segunda camada de defesa, caso alguém passe a logá-los.)
 */
export function buildPinoHttpOptions(env: NodeJS.ProcessEnv = process.env): Options {
  return {
    level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const incoming = req.headers['x-request-id']
      const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID()
      res.setHeader('x-request-id', id) // quem chamou consegue citar este id num chamado de suporte
      return id
    },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[redacted]' },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: stripQuery(req.url) }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    autoLogging: { ignore: (req) => QUIET.test(stripQuery(req.url)) },
    customProps: (req) => {
      const r = req as IncomingMessage & { ip?: string; user?: { sub?: string } }
      return { userId: r.user?.sub, ip: r.ip }
    },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  }
}
