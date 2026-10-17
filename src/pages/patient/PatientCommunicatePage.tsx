import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  Crosshair,
  Pause,
  Play,
  Radio,
  X,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { getEightPhrases, PHRASES_CHANGED_EVENT } from '../../data/patientPhrases'
import { getPhraseVisual } from './patientPhraseIcons'
import { getPatientSession } from '../../lib/patientSession'
import { getPatientPreferences } from '../../lib/patientPreferences'
import { isSpeechSupported, listVoices, primeSpeech, speakTextAI } from '../../lib/speech'
import { skipToNextWord, triggerFallbackConfirm, type BackendWord } from '../../lib/backendApi'
import { incrementTodaySelectionCount } from '../../lib/patientStats'
import { MindSpeakLogo } from '../../components/brand/MindSpeakLogo'
import { Button } from '../../components/shared/Button'
import { useLiveSession } from '../../hooks/useLiveSession'

const THRESHOLD = 75
const LOCK_MS = 1500
const ATTENTION_MS = 200
const POST_CONFIRM_SCAN_PAUSE_MS = 3000
const OVERLAY_MS = 2000
const FLASH_CARD_MS = 1000
const FLASH_BAR_MS = 1000
const FORCE_FOCUS_MS = 3000

// Plano B pra quando o sinal do sensor não está dando pra confirmar nada
// (eletrodo ruim, bateria, sensor caiu): a tecla abaixo confirma a palavra
// que está destacada na varredura, com o mesmo retorno visual e sonoro de
// uma confirmação por foco. É 100% local — não grava nada no histórico da
// sessão no backend.
const CONFIRM_KEY = 'a'
// Adianta a varredura pra próxima palavra sem esperar o timer.
const SKIP_KEY = 'c'

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function speakPhrase(text: string) {
  const prefs = getPatientPreferences()
  if (!prefs.soundEnabled) return
  void speakTextAI(text, { voiceURI: prefs.voiceURI, rate: 0.92 })
}

function attentionBarClass(v: number) {
  if (v < 40) return 'bg-red-500'
  if (v < 60) return 'bg-yellow-500'
  if (v < 75) return 'bg-blue-500'
  return 'bg-green-500'
}

const liveStatusLabel: Record<'idle' | 'connecting' | 'open' | 'closed', string> = {
  idle: 'Aguardando',
  connecting: 'Conectando…',
  open: 'Conectado',
  closed: 'Reconectando…',
}

export function PatientCommunicatePage() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const liveSessionId = searchParams.get('session')
  const isLive = Boolean(liveSessionId)
  const speechSupported = isSpeechSupported()

  const [phrases, setPhrases] = useState(() => getEightPhrases())
  const [scanIndex, setScanIndex] = useState(0)
  const [scanMs, setScanMs] = useState(2000)
  const [demoRunning, setDemoRunning] = useState(false)
  const [scanPaused, setScanPaused] = useState(false)
  const [attention, setAttention] = useState(45)
  const [overlayPhrase, setOverlayPhrase] = useState<string | null>(null)
  // Índice travado enquanto o overlay está na tela — ver applyConfirmation.
  const [frozenHighlight, setFrozenHighlight] = useState<number | null>(null)
  const [flashCardIndex, setFlashCardIndex] = useState<number | null>(null)
  const [barFlash, setBarFlash] = useState(false)
  const [liveStarted, setLiveStarted] = useState(false)

  const attentionRef = useRef(45)
  const lockMsRef = useRef(0)
  const lastScanForLockRef = useRef(0)
  const cooldownUntilRef = useRef(0)
  const inSpikeRef = useRef(false)
  const nextSpikeAtRef = useRef(0)
  const spikeEndsAtRef = useRef(0)
  const forcedFocusUntilRef = useRef(0)
  const phrasesRef = useRef(phrases)
  const scanIndexRef = useRef(scanIndex)
  const scanPausedRef = useRef(scanPaused)
  const overlayBlockRef = useRef(false)
  // Lidos só dentro do handler de tecla, que é registrado uma vez: precisam
  // do valor do render atual, não do que existia quando o listener subiu.
  const displayWordsRef = useRef<string[]>([])
  // Igual a 'live.words', mas acessível de dentro de handleSpeakEvent sem
  // precisar que o callback seja recriado a cada mudança de lista — ver uso
  // logo abaixo, pra resolver qual card destacar por word_id, não por
  // índice local (que pode já ter avançado quando o evento chega).
  const liveWordsRef = useRef<BackendWord[]>([])
  const scanningIndexRef = useRef(0)
  const isHighlightingRef = useRef(false)
  // Cada confirmação tem um número; os timers de limpeza só agem se ainda
  // forem os da confirmação corrente. Sem isso, uma seleção que chega em
  // cima de outra tem seu overlay apagado cedo pelo timer da anterior.
  const confirmGenRef = useRef(0)
  // Evita disparar dois skips em voo ao mesmo tempo; como não há mais botão
  // pra desabilitar, isto não precisa ser estado de render.
  const skippingRef = useRef(false)
  const confirmingRef = useRef(false)
  const sessionDbIdRef = useRef<number | null>(null)
  phrasesRef.current = phrases
  scanIndexRef.current = scanIndex
  scanPausedRef.current = scanPaused

  // Retorno de confirmação — único caminho, usado tanto pela seleção real
  // (motor do backend ou simulação da demo) quanto pelo atalho de teclado,
  // pra que os dois não se sobreponham com overlay dobrado e contagem dupla.
  //
  // 'fromSensor' decide quem cede a vez: uma seleção de verdade é a fala do
  // paciente e nunca pode ser descartada, então passa por cima de um overlay
  // do atalho; o atalho, ao contrário, é ignorado enquanto há confirmação na
  // tela ou cooldown correndo.
  const applyConfirmation = useCallback(
    (index: number, text: string, { fromSensor }: { fromSensor: boolean }) => {
      const now = performance.now()
      if (!fromSensor && (overlayBlockRef.current || now < cooldownUntilRef.current)) return

      cooldownUntilRef.current = now + POST_CONFIRM_SCAN_PAUSE_MS + 500
      overlayBlockRef.current = true
      const gen = confirmGenRef.current + 1
      confirmGenRef.current = gen

      // Sem congelar, numa sessão ao vivo a varredura do backend segue
      // andando atrás do overlay e, quando ele fecha, o destaque já pulou
      // palavras — dá a impressão de ter confirmado a palavra errada.
      setFrozenHighlight(index)
      setFlashCardIndex(index)
      window.setTimeout(() => {
        if (confirmGenRef.current !== gen) return
        setFlashCardIndex(null)
      }, FLASH_CARD_MS)

      setOverlayPhrase(text)
      window.setTimeout(() => {
        if (confirmGenRef.current !== gen) return
        setOverlayPhrase(null)
        setFrozenHighlight(null)
        overlayBlockRef.current = false
      }, OVERLAY_MS)

      setBarFlash(true)
      window.setTimeout(() => {
        if (confirmGenRef.current !== gen) return
        setBarFlash(false)
      }, FLASH_BAR_MS)

      incrementTodaySelectionCount()
      speakPhrase(text)

      setScanPaused(true)
      lockMsRef.current = 0
      window.setTimeout(() => {
        if (confirmGenRef.current !== gen) return
        setScanPaused(false)
      }, POST_CONFIRM_SCAN_PAUSE_MS)
    },
    [],
  )

  // Resolve o card a destacar pelo word_id que veio no evento, não pelo
  // scanningIndex local deste dispositivo: os dois podem já ter divergido
  // no instante em que o 'speak' chega (um live_status seguinte pode ter
  // avançado a varredura aqui um instante antes), e isso fica mais visível
  // ainda com a confirmação manual (tecla "A"): o evento pode chegar num
  // dispositivo DIFERENTE do que apertou a tecla (ex.: operador no PC,
  // iPad só exibindo) — sem usar o id, o iPad podia "confirmar" o card
  // errado enquanto falava o texto certo. Cai pro índice local só se o id
  // não bater com nada na grade atual (não devia acontecer; guarda só pra
  // nunca travar a tela por causa disto).
  const handleSpeakEvent = useCallback(
    (event: { wordId: string; text: string; confidence: number }) => {
      const byId = liveWordsRef.current.findIndex((w) => String(w.id) === event.wordId)
      const index = byId >= 0 ? byId : scanningIndexRef.current
      applyConfirmation(index, event.text, { fromSensor: true })
    },
    [applyConfirmation],
  )

  const live = useLiveSession(isLive && liveStarted ? liveSessionId : null, handleSpeakEvent)

  const displayWords = useMemo(
    () => (isLive ? live.words.map((w) => w.text) : phrases),
    [isLive, live.words, phrases],
  )
  displayWordsRef.current = displayWords
  liveWordsRef.current = live.words

  useEffect(() => {
    const sync = () => setPhrases(getEightPhrases())
    window.addEventListener(PHRASES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PHRASES_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    if (!getPatientSession()) {
      nav('/acesso', { replace: true })
    }
  }, [nav])

  const confirmSelection = useCallback(
    (index: number, { fromSensor }: { fromSensor: boolean }) => {
      // Pela lista exibida, não por 'phrases': numa sessão ao vivo as palavras
      // vêm do backend, e o atalho precisa falar a palavra que está na tela.
      const text = displayWordsRef.current[index]
      if (!text) return
      applyConfirmation(index, text, { fromSensor })
    },
    [applyConfirmation],
  )

  /* Scan advance (modo demo — em modo ao vivo quem manda é o backend) */
  useEffect(() => {
    if (isLive || !demoRunning || scanPaused) return
    const id = window.setInterval(() => {
      setScanIndex((i) => {
        const len = phrasesRef.current.length || 8
        return (i + 1) % len
      })
    }, scanMs)
    return () => clearInterval(id)
  }, [isLive, demoRunning, scanPaused, scanMs])

  /* Reset lock when highlight moves */
  useEffect(() => {
    if (lastScanForLockRef.current !== scanIndex) {
      lastScanForLockRef.current = scanIndex
      lockMsRef.current = 0
    }
  }, [scanIndex])

  /* Attention simulation + selection (modo demo) */
  useEffect(() => {
    if (isLive || !demoRunning) return

    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(ATTENTION_MS + 50, now - last)
      last = now
      const words = phrasesRef.current
      const len = Math.max(1, words.length)
      const idx = scanIndexRef.current % len

      if (now >= nextSpikeAtRef.current && !inSpikeRef.current) {
        inSpikeRef.current = true
        spikeEndsAtRef.current = now + rand(1800, 3200)
      }
      if (inSpikeRef.current && now >= spikeEndsAtRef.current) {
        inSpikeRef.current = false
        nextSpikeAtRef.current = now + rand(4500, 9000)
      }

      const forced = now < forcedFocusUntilRef.current
      const target = forced ? rand(82, 90) : inSpikeRef.current ? rand(70, 90) : rand(30, 55)
      const a = attentionRef.current
      const alpha = 1 - Math.exp(-dt / 420)
      attentionRef.current = Math.round(a + (target - a) * alpha)
      setAttention(attentionRef.current)

      if (now < cooldownUntilRef.current || scanPausedRef.current || overlayBlockRef.current) {
        return
      }

      const att = attentionRef.current
      if (att >= THRESHOLD) {
        lockMsRef.current += ATTENTION_MS
        if (lockMsRef.current >= LOCK_MS) {
          lockMsRef.current = 0
          confirmSelection(idx, { fromSensor: true })
        }
      } else {
        lockMsRef.current = 0
      }
    }, ATTENTION_MS)

    return () => clearInterval(id)
  }, [isLive, demoRunning, confirmSelection])

  /* Prime speech voices (Safari) */
  useEffect(() => {
    if (!speechSupported) return
    listVoices()
    window.speechSynthesis.addEventListener('voiceschanged', listVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', listVoices)
  }, [])

  const startDemo = () => {
    const now = performance.now()
    attentionRef.current = 42
    inSpikeRef.current = false
    nextSpikeAtRef.current = now + rand(2000, 5000)
    spikeEndsAtRef.current = 0
    forcedFocusUntilRef.current = 0
    lockMsRef.current = 0
    cooldownUntilRef.current = 0
    overlayBlockRef.current = false
    // Invalida os timers de uma confirmação que ainda estivesse em curso,
    // senão eles voltam depois mexendo no estado da demo recém-iniciada.
    confirmGenRef.current += 1
    setAttention(42)
    setScanIndex(0)
    setScanPaused(false)
    setOverlayPhrase(null)
    setFrozenHighlight(null)
    setFlashCardIndex(null)
    setDemoRunning(true)
  }

  const pauseDemo = () => {
    setDemoRunning(false)
    setScanPaused(false)
    lockMsRef.current = 0
    overlayBlockRef.current = false
    confirmGenRef.current += 1
    setOverlayPhrase(null)
    setFrozenHighlight(null)
    setFlashCardIndex(null)
  }

  const simulateFocus = () => {
    forcedFocusUntilRef.current = performance.now() + FORCE_FOCUS_MS
  }

  const startLiveSession = () => {
    // gesto do usuário exigido pelo Safari/iOS pra destravar a Web Speech API.
    primeSpeech()
    setLiveStarted(true)
  }

  // Avança a varredura na hora, sem esperar o timer. Não substitui o
  // controle real — o motor de decisão continua rodando 100% pelo sinal do
  // sensor; isto só pula o destaque adiante, do jeito que o timer faria
  // sozinho depois. Ao vivo quem manda na varredura é o backend, então vai
  // por REST; na demo o índice é local e basta incrementar.
  const skipWord = useCallback(() => {
    if (!isLive) {
      setScanIndex((i) => (i + 1) % (phrasesRef.current.length || 8))
      lockMsRef.current = 0
      return
    }
    if (!sessionDbIdRef.current || skippingRef.current) return
    skippingRef.current = true
    skipToNextWord(sessionDbIdRef.current)
      .catch(() => {
        // falha de rede pontual — o timer automático ainda cobre a
        // varredura, não precisa travar a tela por causa disto.
      })
      .finally(() => {
        skippingRef.current = false
      })
  }, [isLive])

  // Confirmação manual em sessão ao vivo: diferente do modo demo, não
  // atualiza o estado local direto — vai pelo backend, que anuncia a
  // palavra pelo /ws/status pra QUALQUER tela conectada a esta sessão
  // (PC que apertou a tecla, iPad que só está exibindo, etc.). Por isso
  // não chama confirmSelection aqui: o retorno visual (overlay, fala)
  // chega de volta pela própria conexão ao vivo deste dispositivo, igual
  // uma seleção real do sensor chegaria — handleSpeakEvent já cobre isso.
  const triggerLiveFallbackConfirm = useCallback(() => {
    if (!sessionDbIdRef.current || confirmingRef.current) return
    confirmingRef.current = true
    triggerFallbackConfirm(sessionDbIdRef.current)
      .catch(() => {
        // falha de rede pontual — sem retry automático: é uma tecla de
        // atalho, apertar de novo já tenta uma vez nova.
      })
      .finally(() => {
        confirmingRef.current = false
      })
  }, [])

  // Atalhos de teclado. 'C' só adianta a varredura. 'A' confirma a palavra
  // destacada — mas o CAMINHO muda com o modo: no demo é 100% local
  // (confirmSelection, sem backend nenhum pra conversar); em sessão ao
  // vivo vai por triggerLiveFallbackConfirm, que anuncia pelo /ws/status
  // e por isso aparece em QUALQUER tela conectada a esta sessão (não só
  // na que apertou a tecla) — sem gravar nada no histórico clínico. Os
  // dois exigem varredura rodando — sem destaque na tela não há o que
  // confirmar nem de onde avançar — e ficam inertes enquanto uma
  // confirmação está na tela, pra não mexer no destaque congelado por
  // trás do overlay. O resto dos guardas (cooldown) fica por conta do
  // próprio confirmSelection, no caminho local.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return
      const key = e.key.toLowerCase()
      if (key !== CONFIRM_KEY && key !== SKIP_KEY) return
      if (!isHighlightingRef.current) return
      if (key === SKIP_KEY) {
        if (overlayBlockRef.current) return
        skipWord()
        return
      }
      if (overlayBlockRef.current) return
      if (isLive) {
        triggerLiveFallbackConfirm()
        return
      }
      confirmSelection(scanningIndexRef.current, { fromSensor: false })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmSelection, isLive, skipWord, triggerLiveFallbackConfirm])

  const attClamped = isLive
    ? Math.min(100, Math.max(0, Math.round(live.focusLevel)))
    : Math.min(100, Math.max(0, attention))
  const barFillClass = barFlash ? 'bg-green-400 motion-safe:animate-pulse' : attentionBarClass(attClamped)
  const scanningIndex = isLive ? live.scanningIndex : scanIndex
  const highlightedIndex = frozenHighlight ?? scanningIndex
  const isHighlighting = isLive ? liveStarted && live.status === 'open' && !live.paused : demoRunning && !scanPaused
  const connectionLabel = isLive ? liveStatusLabel[live.status] : 'Conectado'
  // Sem isso, o ponto de status ficava verde/"conectado" mesmo com o
  // WebSocket caído (reconectando) — só o texto ao lado mudava, o que passa
  // despercebido a quem olha rápido pra tela numa sessão real.
  const connectionDotClass =
    !isLive || live.status === 'open'
      ? 'bg-emerald-500'
      : live.status === 'connecting'
        ? 'bg-amber-400'
        : 'bg-red-500'
  const connectionDotPulses = !isLive || live.status === 'open'
  scanningIndexRef.current = scanningIndex
  sessionDbIdRef.current = live.sessionDbId
  isHighlightingRef.current = isHighlighting

  return (
    <div className="flex min-h-dvh flex-col bg-slate-900 text-slate-100">
      <header className="flex h-12 max-h-12 shrink-0 items-center justify-between border-b border-slate-800 px-3 sm:px-4">
        <MindSpeakLogo layout="horizontal" size="sm" forceTheme="dark" />
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <span className="relative flex h-2 w-2" aria-hidden>
              {connectionDotPulses ? (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none motion-reduce:opacity-0',
                    connectionDotClass,
                  )}
                />
              ) : null}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', connectionDotClass)} />
            </span>
            <span className="hidden sm:inline">{connectionLabel}</span>
          </div>
          {!speechSupported ? (
            <span
              className="hidden rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 sm:inline"
              title="Este navegador não suporta síntese de voz — o texto aparece na tela, mas não será falado."
            >
              Sem voz
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            icon={<X className="h-4 w-4" aria-hidden />}
            onClick={() => nav('/patient/dashboard')}
          >
            Sair
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-3 py-6 sm:px-6">
        <div
          className="grid w-full max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
          role="list"
          aria-label="Grade de frases"
        >
          {displayWords.map((word, index) => {
            const highlighted = isHighlighting && index === highlightedIndex
            const flash = flashCardIndex === index
            // Sinal na zona cinzenta (ver DecisionEngineConfig.uncertain_margin) —
            // destaca em âmbar em vez de verde: o motor não confirmou nem
            // descontou essa leitura, então não é foco "de verdade" ainda.
            const uncertainHighlight = highlighted && isLive && live.uncertain
            const { icon: Icon, wrap } = getPhraseVisual(word, 'dark')
            return (
              <article
                key={`${index}-${word}`}
                role="listitem"
                className={cn(
                  'flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-2xl border-2 px-2 py-4 text-center transition duration-300 motion-reduce:transition-none sm:min-h-[140px]',
                  'bg-gray-800 border-slate-700/80',
                  highlighted &&
                    !uncertainHighlight &&
                    'border-emerald-400 bg-gray-700 shadow-lg shadow-emerald-500/30 ring-1 ring-emerald-400/40',
                  uncertainHighlight &&
                    'border-amber-400 bg-gray-700 shadow-lg shadow-amber-500/30 ring-1 ring-amber-400/40',
                  flash && 'border-emerald-300 bg-emerald-600/30 shadow-lg shadow-emerald-400/50',
                )}
                aria-current={highlighted ? 'step' : undefined}
              >
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-full', wrap)}>
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <p className="text-balance text-lg font-bold leading-tight text-white sm:text-2xl md:text-3xl">{word}</p>
                {uncertainHighlight ? (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                    Sinal incerto
                  </span>
                ) : null}
              </article>
            )
          })}
        </div>

        <section className="w-full max-w-5xl space-y-2" aria-label="Nível de atenção">
          <div
            className={cn(
              'relative h-4 w-full overflow-hidden rounded-full bg-slate-800 ring-1 ring-slate-700 transition-shadow duration-300',
              barFlash && 'shadow-lg shadow-emerald-400/40',
            )}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={attClamped}
            aria-label="Nível de atenção"
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none', barFillClass)}
              style={{ width: `${attClamped}%` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 z-[1] w-0 border-l-2 border-dashed border-white/90"
              style={{ left: `${THRESHOLD}%` }}
              aria-hidden
            />
          </div>
          <div className="flex flex-col gap-0.5 text-center text-sm text-slate-300 sm:flex-row sm:justify-center sm:gap-6">
            <span className="font-medium tabular-nums">Nível de Atenção: {attClamped}%</span>
            <span className="tabular-nums text-ms-muted">Limiar: {THRESHOLD}%</span>
          </div>
          {isLive ? (
            <p className="text-center text-xs text-ms-muted">
              Qualidade do sinal: {live.signalQuality}%
              {live.paused ? ' · sinal ruim, aguardando' : ''}
              {!live.paused && live.uncertain ? ' · foco incerto, mantenha o olhar' : ''}
            </p>
          ) : null}
        </section>
      </main>

      <footer className="shrink-0 px-3 pb-4 text-center text-xs text-gray-500 sm:px-6">
        Mantenha o foco por 1,5s na palavra destacada para confirmar
      </footer>

      {overlayPhrase ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-[2px]"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Confirmação"
        >
          <div className="flex max-w-[95vw] flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-20 w-20 text-emerald-400 sm:h-24 sm:w-24" aria-hidden />
            <p className="max-w-full text-balance px-2 text-2xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
              {overlayPhrase}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className="fixed bottom-3 left-3 right-3 z-40 flex flex-col gap-2 rounded-xl border border-slate-700/80 bg-slate-900/95 p-3 shadow-xl backdrop-blur sm:left-auto sm:right-4 sm:max-w-md"
        aria-label={isLive ? 'Controles da sessão ao vivo' : 'Controles de demonstração'}
      >
        {isLive ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ms-muted">
              Sessão ao vivo
            </p>
            {!liveStarted ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Radio className="h-4 w-4" aria-hidden />}
                onClick={startLiveSession}
              >
                Iniciar sessão ao vivo
              </Button>
            ) : (
              <>
                <p className="text-xs text-slate-300">{liveStatusLabel[live.status]}</p>
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ms-muted">Demo</p>
            <div className="flex flex-wrap gap-2">
              {!demoRunning ? (
                <Button type="button" variant="secondary" size="sm" icon={<Play className="h-4 w-4" aria-hidden />} onClick={startDemo}>
                  Iniciar Demo
                </Button>
              ) : (
                <Button type="button" variant="secondary" size="sm" icon={<Pause className="h-4 w-4" aria-hidden />} onClick={pauseDemo}>
                  Pausar Demo
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Crosshair className="h-4 w-4" aria-hidden />}
                onClick={simulateFocus}
                disabled={!demoRunning}
              >
                Simular Foco
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-ms-muted">Velocidade:</span>
              {(
                [
                  { label: 'Lenta (3s)', ms: 3000 },
                  { label: 'Normal (2s)', ms: 2000 },
                  { label: 'Rápida (1s)', ms: 1000 },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.ms}
                  type="button"
                  onClick={() => setScanMs(opt.ms)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
                    scanMs === opt.ms ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
