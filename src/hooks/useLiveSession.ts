import { useEffect, useRef, useState } from 'react'
import { getSessionByExternalId, getSessionSelections, getSessionWords } from '../lib/backendApi'
import type { BackendWord } from '../lib/backendApi'
import { getStatusWsUrl } from '../lib/backendConfig'
import { getAccessToken } from '../lib/authSession'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed'

export type SpokenEntry = {
  wordId: string
  text: string
  confidence: number
  /** ISO string */
  at: string
}

type LastSelected = {
  wordId: string
  utterance: string
  confidence: number
}

export type LiveSessionState = {
  status: ConnectionStatus
  /** id numérico da sessão (não o external_session_id da URL) — usado pra
   * chamadas REST tipo skipToNextWord. null até resolver via
   * getSessionByExternalId. */
  sessionDbId: number | null
  /** paciente dono da sessão — pra tela mostrar de quem é o sinal em vez
   * de um nome fixo. null até resolver via getSessionByExternalId. */
  patientId: number | null
  words: BackendWord[]
  scanningIndex: number
  focusLevel: number
  signalQuality: number
  candidateWord: string | null
  confidence: number
  paused: boolean
  /** Sinal na zona cinzenta perto do limiar calibrado — nem foco nem
   * repouso confiável o bastante. Backend não decide nada nesta janela;
   * a tela deve sinalizar isso em vez de tratar como foco normal. */
  uncertain: boolean
  lastSelected: LastSelected | null
  /** mais recente primeiro */
  spokenHistory: SpokenEntry[]
}

type LiveStatusMessage = {
  type: 'live_status'
  scanning_index: number
  focus_level: number
  signal_quality: number
  candidate_word: string | null
  confidence: number
  paused: boolean
  uncertain: boolean
  last_selected: { word_id: string; utterance: string; confidence: number } | null
}

type SpeakMessage = {
  type: 'speak'
  word_id: string
  text: string
  confidence: number
}

type StatusMessage = LiveStatusMessage | SpeakMessage

const INITIAL_STATE: LiveSessionState = {
  status: 'idle',
  sessionDbId: null,
  patientId: null,
  words: [],
  scanningIndex: 0,
  focusLevel: 0,
  signalQuality: 100,
  candidateWord: null,
  confidence: 0,
  paused: false,
  uncertain: false,
  lastSelected: null,
  spokenHistory: [],
}

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 15000

/**
 * Acompanha uma sessão ao vivo via /ws/status/{sessionId}. Reconecta sozinho
 * se a rede cair (backoff exponencial) — a sessão do paciente no backend não
 * depende de nenhum cliente estar conectado, então isso é só para o viewer
 * se recuperar sem precisar recarregar a página.
 */
export function useLiveSession(
  sessionId: string | null,
  onSpeak?: (event: SpokenEntry) => void,
): LiveSessionState {
  const [state, setState] = useState<LiveSessionState>(INITIAL_STATE)
  const onSpeakRef = useRef(onSpeak)
  onSpeakRef.current = onSpeak

  useEffect(() => {
    if (!sessionId) {
      setState(INITIAL_STATE)
      return
    }

    const token = getAccessToken()
    if (!token) {
      // sem login não tem como abrir o socket — o backend recusa mesmo.
      setState(INITIAL_STATE)
      return
    }

    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectDelay = RECONNECT_MIN_MS

    setState({ ...INITIAL_STATE, status: 'connecting' })

    void (async () => {
      try {
        const session = await getSessionByExternalId(sessionId)
        const [words, selectionsPage] = await Promise.all([
          getSessionWords(session.id),
          getSessionSelections(session.id),
        ])
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          sessionDbId: session.id,
          patientId: session.patient_id,
          words,
          spokenHistory: selectionsPage.items.map((selection) => ({
            wordId: String(selection.word_id),
            text: selection.utterance,
            confidence: selection.confidence,
            at: selection.selected_at,
          })),
        }))
      } catch {
        // grade/histórico ficam vazios; o live_status ainda chega pelo socket.
      }
    })()

    function scheduleReconnect() {
      if (cancelled) return
      reconnectTimer = setTimeout(connect, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
    }

    function connect() {
      if (cancelled) return
      // relê o token a cada tentativa (não só na 1ª vez) — se ele mudou
      // (login renovado noutra aba, por exemplo) a reconexão já usa o novo.
      const currentToken = getAccessToken()
      if (!currentToken) {
        setState((prev) => ({ ...prev, status: 'closed' }))
        return
      }
      socket = new WebSocket(getStatusWsUrl(sessionId as string, currentToken))

      socket.onopen = () => {
        reconnectDelay = RECONNECT_MIN_MS
        setState((prev) => ({ ...prev, status: 'open' }))
      }

      socket.onmessage = (event: MessageEvent<string>) => {
        let message: StatusMessage
        try {
          message = JSON.parse(event.data) as StatusMessage
        } catch {
          return
        }

        if (message.type === 'live_status') {
          setState((prev) => ({
            ...prev,
            scanningIndex: message.scanning_index,
            focusLevel: message.focus_level,
            signalQuality: message.signal_quality,
            candidateWord: message.candidate_word,
            confidence: message.confidence,
            paused: message.paused,
            uncertain: message.uncertain,
            lastSelected: message.last_selected
              ? {
                  wordId: message.last_selected.word_id,
                  utterance: message.last_selected.utterance,
                  confidence: message.last_selected.confidence,
                }
              : prev.lastSelected,
          }))
        } else if (message.type === 'speak') {
          const entry: SpokenEntry = {
            wordId: message.word_id,
            text: message.text,
            confidence: message.confidence,
            at: new Date().toISOString(),
          }
          setState((prev) => ({ ...prev, spokenHistory: [entry, ...prev.spokenHistory] }))
          onSpeakRef.current?.(entry)
        }
      }

      socket.onclose = () => {
        if (cancelled) return
        setState((prev) => ({ ...prev, status: 'closed' }))
        scheduleReconnect()
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [sessionId])

  return state
}
