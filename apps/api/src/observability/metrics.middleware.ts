import type { NextFunction, Request, Response } from 'express'
import { MetricsService } from './metrics.service'

/**
 * Mede cada requisição. O rótulo "route" é o PADRÃO da rota (/api/orders/:id/status), nunca a URL real:
 * ids e tokens na URL explodiriam a cardinalidade das métricas. O que não casa com rota (404, arquivos
 * estáticos) vira "other".
 */
export function metricsMiddleware(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const end = metrics.httpDuration.startTimer()
    res.on('finish', () => {
      // O próprio middleware é montado com curinga ("*"): se a rota que sobrou é o curinga, nenhuma rota real casou.
      const path = req.route?.path as string | undefined
      const route = path && !path.includes('*') ? `${req.baseUrl}${path}` : 'other'
      end({ method: req.method, route, status: String(res.statusCode) })
    })
    next()
  }
}
