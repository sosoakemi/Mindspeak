import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
// import (não caminho solto em /public) — o build quebra se este arquivo
// sumir, em vez de virar um 404 silencioso em produção como já aconteceu
// com /images/helmet-side.png (removida do disco fora desta sessão).
import fallbackImage from '../assets/headset-placeholder.png'

// ⚠️ Se reexportar este vídeo: precisa ser "all-intra" (todo frame é
// keyframe — no ffmpeg: `-g 1 -bf 0`). Sem isso, cada `video.currentTime =`
// do scroll obriga o navegador a decodificar de trás pra frente até o
// keyframe mais próximo — com poucos keyframes (ex.: 1 pro vídeo inteiro),
// isso trava visivelmente o scrub. All-intra deixa o arquivo maior, mas
// cada busca é instantânea (essencial pra um vídeo controlado por scroll).
const VIDEO_SRC = '/video/3dvideo.home.mp4'
// imagem do protótipo já montado — usada como pôster (antes do vídeo carregar)
// e como fallback total se o vídeo não puder ser reproduzido.
const FALLBACK_IMAGE_SRC = fallbackImage

// Altura do wrapper em "viewports": controla quanto scroll equivale ao
// vídeo inteiro (maior = scrub mais lento/gradual). A seção libera o
// scroll normal assim que o usuário passa dessa altura.
const SCROLL_HEIGHT_VH = 380
// suavização do lerp por frame (0–1): menor = mais suave e "atrasado"
// atrás do scroll, maior = mais colado no scroll. 0.35 fica perceptível
// como suavização sem parecer que o vídeo está atrasado.
const SMOOTHING = 0.35

// Rede instável larga um `error` no <video> sem nenhum motivo permanente
// (conexão caiu no meio do download de um arquivo de ~4MB, por exemplo —
// bem plausível em wifi de evento/apresentação). Sem retry, essa falha
// transitória virava definitiva: `videoFailed` nunca mais voltava a
// false, e a seção inteira ficava presa na imagem estática pro resto da
// visita — "não continua" por mais que a pessoa role a página, mesmo a
// rede já tendo se recuperado. MAX_LOAD_RETRIES tenta de novo antes de
// desistir de vez.
const MAX_LOAD_RETRIES = 2
const RETRY_DELAY_MS = 1500
// Se nem onLoadedMetadata nem onError disparam dentro deste tempo (modo
// economia de dados do navegador tratando preload="auto" como "none", por
// exemplo), força uma nova tentativa em vez de ficar esperando pra
// sempre — mesmo sintoma do caso acima (fallback permanente), causa
// diferente (nunca chega a falhar, só nunca termina de carregar).
const LOAD_TIMEOUT_MS = 8000

type PinState = 'before' | 'pinned' | 'after'

// O vídeo original (render 3D) vinha com fundo branco/preto de estúdio, não
// transparente — <video> não suporta canal alfa de forma confiável entre
// navegadores, então em vez disso o fundo foi removido do arquivo (fora
// desta sessão): máscara por "flood fill" a partir das bordas identifica só
// o fundo realmente conectado à borda do quadro (preserva partes claras
// legítimas do modelo, como a tira da headband, que têm cor parecida com o
// fundo mas não tocam a borda) e recompõe cada frame sobre #060D17 antes de
// reexportar o mp4. #060D17 é o tom central do degradê abaixo — a cor final
// do degradê (#020617) é a mesma do fundo escuro das páginas do site
// (site-dark.css), então a costura com o resto da página fica invisível.
const BACKDROP = {
  background: 'radial-gradient(ellipse 80% 70% at 50% 40%, #060D17 0%, #050b14 60%, #020617 100%)',
}

/**
 * Vídeo do protótipo (visto de fora) que "monta/desmonta" conforme o
 * usuário rola a página — o scroll é o único controle (sem play/pause,
 * sem barra de progresso). Fica preso na tela enquanto dura o scrub e
 * solta o scroll normal ao terminar.
 *
 * Não usa `position: sticky`: o body/#root do app têm `overflow-x:
 * hidden` (evita scroll horizontal em outras páginas), e QUALQUER
 * ancestral com overflow diferente de `visible` quebra sticky — o
 * elemento simplesmente nunca gruda. Em vez disso, o pin é calculado à
 * mão a partir do scroll e aplicado como `position: fixed` (3 estados:
 * antes / preso / depois), que não depende de overflow de ancestral.
 */
export function PrototypeScrollVideo() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef(0) // 0..1, atualizado a cada scroll/resize
  const rafRef = useRef<number | null>(null)
  const [pinState, setPinState] = useState<PinState>('before')
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  // Precisa ser state (não ref): o watchdog abaixo depende dele pra saber
  // quando reiniciar o relógio a cada nova tentativa — um ref mutado não
  // dispara re-render, então o efeito nunca rearmaria pra 2ª tentativa.
  const [retryAttempt, setRetryAttempt] = useState(0)

  // Agenda uma nova tentativa de carregar o vídeo (rede falhou ou travou
  // sem nunca terminar) até MAX_LOAD_RETRIES; depois disso, desiste pra
  // valer e mostra o fallback estático — aí sim definitivo, não mais
  // reavaliado enquanto este componente existir.
  const scheduleRetryOrGiveUp = () => {
    setRetryAttempt((attempt) => {
      if (attempt >= MAX_LOAD_RETRIES) {
        setVideoFailed(true)
        return attempt
      }
      setTimeout(() => {
        videoRef.current?.load()
      }, RETRY_DELAY_MS)
      return attempt + 1
    })
  }

  // Watchdog de carregamento: se nem onLoadedMetadata nem onError
  // chegarem a tempo (ver LOAD_TIMEOUT_MS — ex.: modo economia de dados
  // tratando preload="auto" como "none"), trata como se tivesse falhado.
  // Reinicia a cada retryAttempt, então cada nova tentativa ganha seu
  // próprio prazo — sem isto, só a 1ª tentativa seria vigiada.
  useEffect(() => {
    if (videoReady || videoFailed) return
    const timeout = setTimeout(scheduleRetryOrGiveUp, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timeout)
  }, [videoReady, videoFailed, retryAttempt])

  // posição de scroll dentro da seção → estado de pin + progresso 0..1.
  // Progresso fica em ref (não re-renderiza a cada pixel de scroll);
  // pinState vira state, mas só muda de fato 2 vezes por passagem pela
  // seção (before→pinned→after), então o re-render é raro.
  useEffect(() => {
    function updateProgress() {
      const section = sectionRef.current
      if (!section) return
      const rect = section.getBoundingClientRect()
      const scrollableDistance = rect.height - window.innerHeight

      let nextState: PinState
      let nextProgress: number

      if (scrollableDistance <= 0) {
        // seção mais curta que a viewport (telas muito altas) — não tem o
        // que prender, só mostra o vídeo parado no frame correspondente.
        nextState = 'pinned'
        nextProgress = rect.top <= 0 ? 1 : 0
      } else if (rect.top > 0) {
        nextState = 'before'
        nextProgress = 0
      } else if (rect.top <= -scrollableDistance) {
        nextState = 'after'
        nextProgress = 1
      } else {
        nextState = 'pinned'
        nextProgress = -rect.top / scrollableDistance
      }

      progressRef.current = nextProgress
      setPinState((prev) => (prev === nextState ? prev : nextState))
    }

    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)
    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [])

  // "Prime" exigido por Safari/iOS: um seek programático antes do vídeo
  // nunca ter tocado às vezes não redesenha o frame em WebKit. Um
  // play()+pause() mudo e silencioso destrava isso sem o usuário notar.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoReady) return
    let cancelled = false
    void (async () => {
      try {
        video.muted = true
        await video.play()
        if (cancelled) return
        video.pause()
        video.currentTime = 0
      } catch {
        // autoplay bloqueado mesmo mudo (raro, mas existe) — sem problema:
        // o primeiro seek do scroll ainda vai buscar o frame certo.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [videoReady])

  // Loop de suavização: setar currentTime direto no handler de scroll
  // dispara dezenas de vezes por segundo e "engasga" a busca de frame do
  // vídeo. Em vez disso, a cada requestAnimationFrame o currentTime atual
  // se aproxima do alvo (progressRef * duration) — suaviza a transição
  // entre frames e alinha as atualizações ao ciclo de pintura do browser.
  useEffect(() => {
    if (!videoReady || videoFailed) return

    function tick() {
      const video = videoRef.current
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        const target = progressRef.current * video.duration
        const current = video.currentTime
        const next = current + (target - current) * SMOOTHING
        if (Math.abs(next - current) > 0.01) {
          video.currentTime = next
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [videoReady, videoFailed])

  const showFallbackImage = videoFailed || !videoReady

  return (
    <section
      ref={sectionRef}
      aria-label="Montagem do protótipo MindSpeak em 3D"
      className="relative"
      style={{ height: `${SCROLL_HEIGHT_VH}vh` }}
    >
      <div
        className={cn(
          'left-0 flex h-dvh w-full items-center justify-center overflow-hidden',
          pinState === 'pinned' && 'fixed inset-x-0 top-0',
          pinState === 'before' && 'absolute inset-x-0 top-0',
          pinState === 'after' && 'absolute inset-x-0 bottom-0',
        )}
        style={BACKDROP}
      >
        {!videoFailed ? (
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            aria-hidden
            tabIndex={-1}
            className={`h-full w-full max-w-4xl object-contain transition-opacity duration-500 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
            onLoadedMetadata={() => setVideoReady(true)}
            onError={scheduleRetryOrGiveUp}
          />
        ) : null}

        {showFallbackImage ? (
          <img
            src={FALLBACK_IMAGE_SRC}
            alt="Protótipo do MindSpeak montado"
            className="absolute inset-0 h-full w-full object-contain p-10"
          />
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center">
          <p className="rounded-full bg-white/5 px-4 py-2 text-xs font-medium tracking-wide text-slate-300 backdrop-blur-sm">
            Role a página para ver a montagem
          </p>
        </div>
      </div>
    </section>
  )
}
