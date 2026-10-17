/**
 * Um único build precisa servir dois cenários bem diferentes:
 *
 * 1) Sessão real (clínica/casa): PC com o sensor + backend local, iPad na
 *    mesma rede WiFi (ver a documentação do projeto). Aberto por localhost
 *    ou por um IP de rede local (192.168.x.x, 10.x.x.x, 172.16-31.x.x) ou
 *    hostname .local
 *    — o app assume que o backend está no mesmo host, na porta 8000.
 * 2) Demo pública (Vercel + backend hospedado à parte, ex. Render/Railway):
 *    aberto por um domínio público (mindspeak-tcc.vercel.app) — não tem
 *    PC nem sensor nenhum do outro lado, então usa VITE_API_BASE_URL (a
 *    URL do backend na nuvem, só com simulador).
 *
 * A escolha entre os dois é automática, pelo hostname de onde a página foi
 * aberta — não pela variável de ambiente estar definida ou não. Isso
 * permite abrir o MESMO link da Vercel tanto pra demo quanto, se um dia
 * essa build for aberta na rede local, continuar indo pro backend local.
 */
const BACKEND_PORT = 8000

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.local$/,
]

function isPrivateNetworkHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

function currentHostname(): string {
  if (typeof window !== 'undefined' && window.location.hostname) {
    return window.location.hostname
  }
  return 'localhost'
}

function resolveHost(): string {
  const override = import.meta.env.VITE_BACKEND_HOST as string | undefined
  if (override) return override
  return currentHostname()
}

function explicitBaseUrl(): string | undefined {
  const override = import.meta.env.VITE_API_BASE_URL as string | undefined
  return override ? override.replace(/\/+$/, '') : undefined
}

/** Só usa a URL pública quando a página foi aberta por um domínio público
 * de verdade — em rede local, o backend do mesmo host sempre tem prioridade
 * (é lá que o sensor de verdade está, quando houver um). */
function shouldUsePublicBackend(): boolean {
  return explicitBaseUrl() !== undefined && !isPrivateNetworkHost(currentHostname())
}

export function getApiBaseUrl(): string {
  if (shouldUsePublicBackend()) return explicitBaseUrl() as string
  return `http://${resolveHost()}:${BACKEND_PORT}`
}

/** `token` é obrigatório no backend — a conexão é recusada sem ele. */
export function getStatusWsUrl(sessionId: string, token: string): string {
  const path = `/ws/status/${encodeURIComponent(sessionId)}`
  const query = `?token=${encodeURIComponent(token)}`

  if (shouldUsePublicBackend()) {
    const wsBase = (explicitBaseUrl() as string).replace(/^http/, 'ws')
    return `${wsBase}${path}${query}`
  }

  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${resolveHost()}:${BACKEND_PORT}${path}${query}`
}
