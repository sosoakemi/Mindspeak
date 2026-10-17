import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PatientCommunicatePage } from './PatientCommunicatePage'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { savePatientSession } from '../../lib/patientSession'
import { getEightPhrases } from '../../data/patientPhrases'
import { getTodaySelectionCount } from '../../lib/patientStats'
import * as backendApi from '../../lib/backendApi'
import * as useLiveSessionModule from '../../hooks/useLiveSession'

// Sessão ao vivo: o teste não abre WebSocket nenhum (não existe no jsdom),
// então o hook é mockado com um estado "conectado" controlado — só o
// suficiente pra isHighlighting virar true e sessionDbIdRef ter um valor.
vi.mock('../../hooks/useLiveSession', () => ({
  useLiveSession: vi.fn(),
}))

vi.mock('../../lib/backendApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/backendApi')>('../../lib/backendApi')
  return {
    ...actual,
    triggerFallbackConfirm: vi.fn(() => Promise.resolve({ status: 'ok' })),
    skipToNextWord: vi.fn(() => Promise.resolve({ status: 'ok' })),
  }
})

const api = vi.mocked(backendApi)
const useLiveSessionMock = vi.mocked(useLiveSessionModule.useLiveSession)

// A página fala por síntese de voz e abre WebSocket em sessão ao vivo —
// nenhum dos dois existe no jsdom. Aqui só interessa o atalho de teclado.
vi.mock('../../lib/speech', () => ({
  isSpeechSupported: () => true,
  listVoices: () => [],
  primeSpeech: () => {},
  speakTextAI: vi.fn(() => Promise.resolve()),
}))

// jsdom não implementa speechSynthesis; a página escuta 'voiceschanged'.
Object.defineProperty(window, 'speechSynthesis', {
  configurable: true,
  value: { addEventListener: () => {}, removeEventListener: () => {}, getVoices: () => [] },
})

// jsdom não implementa matchMedia, de que o ThemeProvider depende.
window.matchMedia = window.matchMedia ?? ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}) as unknown as MediaQueryList)

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  savePatientSession({
    patientId: '1',
    patientName: 'Teste',
    connectedAt: new Date().toISOString(),
  })
  // Default "idle" — as mesmas chaves de INITIAL_STATE no hook real. Os
  // testes de modo demo nem olham pra isto (isLive é false, então o valor
  // devolvido aqui não afeta o que a tela mostra); só o teste de sessão ao
  // vivo sobrescreve com um estado "conectado".
  useLiveSessionMock.mockReturnValue({
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
  })
})

function renderPage(initialEntries: string[] = ['/patient/communicate']) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <PatientCommunicatePage />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('PatientCommunicatePage — atalho de confirmação', () => {
  it('não confirma nada enquanto a varredura não está rodando', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.keyboard('a')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(getTodaySelectionCount()).toBe(0)
  })

  it('confirma a palavra destacada quando a varredura está rodando', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /iniciar demo/i }))
    await user.keyboard('a')

    const overlay = await screen.findByRole('alertdialog', { name: /confirma/i })
    // A varredura começa no índice 0, então é a 1ª palavra da grade.
    expect(overlay).toHaveTextContent(getEightPhrases()[0])
    expect(getTodaySelectionCount()).toBe(1)
  })

  it('a tecla C adianta a varredura sem confirmar nada', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /iniciar demo/i }))
    const [primeira] = getEightPhrases()
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(primeira)

    await user.keyboard('c')

    await waitFor(() =>
      expect(screen.getByRole('listitem', { current: 'step' })).not.toHaveTextContent(primeira),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(getTodaySelectionCount()).toBe(0)
  })

  it('ignora toques repetidos enquanto a confirmação está na tela', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /iniciar demo/i }))
    await user.keyboard('a')
    await screen.findByRole('alertdialog')
    await user.keyboard('aaa')

    await waitFor(() => expect(getTodaySelectionCount()).toBe(1))
  })
})

describe('PatientCommunicatePage — tecla A em sessão ao vivo', () => {
  it('anuncia pelo backend em vez de confirmar localmente', async () => {
    useLiveSessionMock.mockReturnValue({
      status: 'open',
      sessionDbId: 123,
      patientId: 1,
      words: [{ id: 1, text: 'Água', severity: 'informativo', position: 1 }],
      scanningIndex: 0,
      focusLevel: 40,
      signalQuality: 100,
      candidateWord: 'Água',
      confidence: 0.4,
      paused: false,
      uncertain: false,
      lastSelected: null,
      spokenHistory: [],
    })
    const user = userEvent.setup()
    renderPage(['/patient/communicate?session=sess-ipad-001'])

    await user.click(screen.getByRole('button', { name: /iniciar sessão ao vivo/i }))
    await user.keyboard('a')

    await waitFor(() => expect(api.triggerFallbackConfirm).toHaveBeenCalledWith(123))
    // o retorno visual chega de volta pela conexão ao vivo (handleSpeakEvent),
    // não por uma atualização local direta — por isso nenhum overlay aparece
    // só de apertar a tecla, no mock que não simula a mensagem chegando.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    // e continua sem gravar no contador local, já que o caminho ao vivo
    // não chama confirmSelection/applyConfirmation.
    expect(getTodaySelectionCount()).toBe(0)
  })

  it('não chama o backend sem a varredura estar rodando', async () => {
    useLiveSessionMock.mockReturnValue({
      status: 'open',
      sessionDbId: 123,
      patientId: 1,
      words: [{ id: 1, text: 'Água', severity: 'informativo', position: 1 }],
      scanningIndex: 0,
      focusLevel: 40,
      signalQuality: 100,
      candidateWord: 'Água',
      confidence: 0.4,
      paused: false,
      uncertain: false,
      lastSelected: null,
      spokenHistory: [],
    })
    const user = userEvent.setup()
    renderPage(['/patient/communicate?session=sess-ipad-002'])

    // sem clicar em "Iniciar sessão ao vivo" — liveStarted continua false.
    await user.keyboard('a')

    expect(api.triggerFallbackConfirm).not.toHaveBeenCalled()
  })

  it('ao receber o anúncio, destaca o card pelo word_id — não pelo scanningIndex local', async () => {
    // scanningIndex fica em 0 (Água) o tempo todo; o evento de fala anuncia
    // o id 2 (Banheiro). Regressão: antes, o card destacado vinha de
    // scanningIndexRef.current (o índice LOCAL deste dispositivo), que pode
    // já ter divergido do que o backend realmente confirmou — sobretudo
    // relevante pra confirmação manual, que pode chegar num dispositivo
    // diferente do que apertou a tecla (operador no PC, iPad só exibindo).
    useLiveSessionMock.mockReturnValue({
      status: 'open',
      sessionDbId: 123,
      patientId: 1,
      words: [
        { id: 1, text: 'Água', severity: 'informativo', position: 1 },
        { id: 2, text: 'Banheiro', severity: 'informativo', position: 2 },
      ],
      scanningIndex: 0,
      focusLevel: 40,
      signalQuality: 100,
      candidateWord: 'Água',
      confidence: 0.4,
      paused: false,
      uncertain: false,
      lastSelected: null,
      spokenHistory: [],
    })
    const user = userEvent.setup()
    renderPage(['/patient/communicate?session=sess-ipad-003'])
    await user.click(screen.getByRole('button', { name: /iniciar sessão ao vivo/i }))

    const onSpeak = useLiveSessionMock.mock.calls.at(-1)?.[1]
    expect(onSpeak).toBeTypeOf('function')
    act(() => {
      onSpeak?.({ wordId: '2', text: 'Banheiro', confidence: 0.9, at: new Date().toISOString() })
    })

    const overlay = await screen.findByRole('alertdialog', { name: /confirma/i })
    expect(overlay).toHaveTextContent('Banheiro')

    const cards = screen.getAllByRole('listitem')
    expect(cards[1]).toHaveAttribute('aria-current', 'step') // Banheiro, não Água
    expect(cards[0]).not.toHaveAttribute('aria-current')
  })
})
