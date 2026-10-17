import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrototypeScrollVideo } from './PrototypeScrollVideo'

// Regressão de um bug real: antes, um ÚNICO `error` no <video> (rede
// instável no meio do download de ~4MB — plausível em wifi de evento)
// deixava a seção presa na imagem estática pro resto da visita, mesmo
// que a rede se recuperasse — nenhum retry, sem mais nenhuma tentativa.
// "Não continua" por mais que a pessoa role a página.

function getVideoEl(): HTMLVideoElement {
  const el = document.querySelector('video')
  if (!el) throw new Error('vídeo não encontrado no DOM')
  return el
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PrototypeScrollVideo — recuperação de falha de carregamento', () => {
  it('tenta recarregar o vídeo em vez de desistir na primeira falha', () => {
    render(<PrototypeScrollVideo />)
    const video = getVideoEl()
    const loadSpy = vi.spyOn(video, 'load').mockImplementation(() => {})

    act(() => {
      video.dispatchEvent(new Event('error'))
    })
    // ainda não desistiu — a imagem de fallback aparece ENQUANTO tenta de
    // novo (não é "falhou", é "carregando ainda"), mas o vídeo continua
    // no DOM esperando a próxima tentativa.
    expect(screen.getByAltText('Protótipo do MindSpeak montado')).toBeInTheDocument()
    expect(document.querySelector('video')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1500) // RETRY_DELAY_MS
    })
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('recupera normalmente se a 2ª tentativa carregar com sucesso', () => {
    render(<PrototypeScrollVideo />)
    const video = getVideoEl()
    vi.spyOn(video, 'load').mockImplementation(() => {})

    act(() => {
      video.dispatchEvent(new Event('error'))
      vi.advanceTimersByTime(1500)
    })
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })

    // vídeo "pronto" — fallback sai, sem nunca ter marcado falha definitiva.
    expect(screen.queryByAltText('Protótipo do MindSpeak montado')).not.toBeInTheDocument()
  })

  it('desiste em definitivo só depois de esgotar as tentativas', () => {
    render(<PrototypeScrollVideo />)
    const video = getVideoEl()
    const loadSpy = vi.spyOn(video, 'load').mockImplementation(() => {})

    // MAX_LOAD_RETRIES = 2 → 3 falhas seguidas (a 3ª já não tem mais
    // tentativa disponível) é quando desiste de vez.
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        video.dispatchEvent(new Event('error'))
        vi.advanceTimersByTime(1500)
      })
    }

    // depois de desistir, o <video> some do DOM (só a imagem fica) — nada
    // mais tenta recarregar.
    expect(document.querySelector('video')).not.toBeInTheDocument()
    expect(screen.getByAltText('Protótipo do MindSpeak montado')).toBeInTheDocument()
    expect(loadSpy).toHaveBeenCalledTimes(2) // só as 2 tentativas permitidas
  })

  it('trata carregamento que nunca termina (sem error, sem loadedmetadata) como falha e tenta de novo', () => {
    render(<PrototypeScrollVideo />)
    const video = getVideoEl()
    const loadSpy = vi.spyOn(video, 'load').mockImplementation(() => {})

    // nem onError nem onLoadedMetadata disparam — só o tempo passa.
    act(() => {
      vi.advanceTimersByTime(8000) // LOAD_TIMEOUT_MS
    })
    act(() => {
      vi.advanceTimersByTime(1500) // RETRY_DELAY_MS
    })

    expect(loadSpy).toHaveBeenCalledTimes(1)
  })
})
