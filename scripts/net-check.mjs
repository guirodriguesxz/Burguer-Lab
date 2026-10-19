// Diagnóstico de rede quando o banco está inalcançável: resolve o host de DATABASE_URL e testa
// a conexão TCP em cada endereço (IPv4/IPv6). Não imprime usuário, senha nem valores de parâmetros
// (exceto connect_timeout/sslmode, que não são sensíveis).
import dns from 'node:dns/promises'
import net from 'node:net'

const raw = process.env.DATABASE_URL
if (!raw) {
  console.log('[net-check] DATABASE_URL não definida')
  process.exit(0)
}

let url
try {
  url = new URL(raw)
} catch {
  console.log('[net-check] DATABASE_URL não é uma URL válida')
  process.exit(0)
}

const host = url.hostname
const port = Number(url.port || 5432)
const keys = [...url.searchParams.keys()]
console.log(`[net-check] host=${host} port=${port}`)
console.log(`[net-check] parâmetros presentes: ${keys.join(', ') || '(nenhum)'}`)
console.log(`[net-check] connect_timeout=${url.searchParams.get('connect_timeout')} sslmode=${url.searchParams.get('sslmode')}`)

let addrs = []
try {
  addrs = await dns.lookup(host, { all: true })
  console.log(`[net-check] DNS: ${addrs.map((a) => `${a.address}(v${a.family})`).join(', ')}`)
} catch (e) {
  console.log(`[net-check] DNS falhou: ${e.code ?? e.message}`)
}

const tryConnect = (address, family) =>
  new Promise((resolve) => {
    const started = Date.now()
    const socket = net.connect({ host: address, port, family, timeout: 8000 })
    const done = (result) => {
      socket.destroy()
      resolve(`${result} em ${Date.now() - started}ms`)
    }
    socket.once('connect', () => done('CONECTOU'))
    socket.once('timeout', () => done('TIMEOUT'))
    socket.once('error', (e) => done(`ERRO ${e.code ?? e.message}`))
  })

for (const a of addrs) {
  console.log(`[net-check] ${a.address} (IPv${a.family}): ${await tryConnect(a.address, a.family)}`)
}
