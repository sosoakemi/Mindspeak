import { useCallback, useEffect, useState } from 'react'
import { getPatientSession, patchPatientSession, PATIENT_SESSION_CHANGED_EVENT } from '../lib/patientSession'
import { getActiveSessionId } from '../lib/activeSession'
import { getAccessToken } from '../lib/authSession'
import { getStatusWsUrl } from '../lib/backendConfig'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

// Tempo máximo esperando o handshake do WebSocket antes de desistir e
// reportar "não conectou" — sem isso um backend fora do ar deixaria o botão
// girando pra sempre.
const CONNECT_TIMEOUT_MS = 6000

/** Tenta abrir de verdade o /ws/status/{sessionId} (o mesmo endpoint que a
 * tela de comunicação ao vivo usa) só pra confirmar que o backend está no
 * ar e aceita a conexão — fecha o socket assim que sabe o resultado, não
 * fica "ouvindo" nada. Não é sinônimo de "sensor conectado": só confirma
 * que a sessão existe e o backend está alcançável a partir daqui. */
function checkStatusSocket(sessionId: string, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let socket: WebSocket
    try {
      socket = new WebSocket(getStatusWsUrl(sessionId, token))
    } catch {
      resolve(false)
      return
    }

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      socket.onopen = null
      socket.onerror = null
      socket.onclose = null
      try {
        socket.close()
      } catch {
        // já fechado — sem problema
      }
      resolve(ok)
    }

    const timer = window.setTimeout(() => finish(false), CONNECT_TIMEOUT_MS)
    socket.onopen = () => finish(true)
    socket.onerror = () => finish(false)
    socket.onclose = () => finish(false)
  })
}

export function usePatientSync() {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => getPatientSession()?.lastSyncAt ?? null)
  const [backendReachable, setBackendReachable] = useState(
    () => getPatientSession()?.backendReachable ?? false,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const s = getPatientSession()
    setLastSyncAt(s?.lastSyncAt ?? null)
    setBackendReachable(s?.backendReachable ?? false)
  }, [])

  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    window.addEventListener(PATIENT_SESSION_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(PATIENT_SESSION_CHANGED_EVENT, onChange)
  }, [refresh])

  const sync = useCallback(async () => {
    if (!getPatientSession()) {
      setErrorMessage('Sessão não encontrada. Faça login novamente.')
      setStatus('error')
      return
    }
    if (status === 'syncing') return

    const sessionId = getActiveSessionId()
    if (!sessionId) {
      setStatus('error')
      setErrorMessage(
        'Nenhuma sessão ao vivo conectada ainda — informe o id da sessão na tela de Comunicação.',
      )
      patchPatientSession({ backendReachable: false })
      return
    }

    const token = getAccessToken()
    if (!token) {
      setStatus('error')
      setErrorMessage('Sua sessão de login expirou. Faça login novamente.')
      patchPatientSession({ backendReachable: false })
      return
    }

    setStatus('syncing')
    setErrorMessage(null)

    const reachable = await checkStatusSocket(sessionId, token)

    if (!reachable) {
      setStatus('error')
      setErrorMessage(
        'Não foi possível conectar ao backend para esta sessão. Verifique se o servidor está no ar e se a sessão ainda existe.',
      )
      patchPatientSession({ backendReachable: false })
      return
    }

    const now = new Date().toISOString()
    patchPatientSession({ lastSyncAt: now, backendReachable: true })
    setStatus('success')
    window.setTimeout(() => setStatus((s) => (s === 'success' ? 'idle' : s)), 2500)
  }, [status])

  const formatLastSync = useCallback(() => {
    if (!lastSyncAt) return '—'
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(lastSyncAt))
    } catch {
      return '—'
    }
  }, [lastSyncAt])

  return {
    status,
    errorMessage,
    lastSyncAt,
    backendReachable,
    sync,
    formatLastSync,
    isSyncing: status === 'syncing',
  }
}
