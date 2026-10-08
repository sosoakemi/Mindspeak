import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage } from './HistoryPage'
import { DashboardProvider } from './dashboard-context'
import * as backendApi from '../../lib/backendApi'

vi.mock('../../lib/backendApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/backendApi')>('../../lib/backendApi')
  return {
    ...actual,
    listPatients: vi.fn(),
    getPatientTimeline: vi.fn(),
    listPatientSessions: vi.fn(),
    listSessionSignalInterruptions: vi.fn(),
  }
})

const api = vi.mocked(backendApi)

const paciente = {
  id: 7,
  organization_id: 1,
  display_name: 'Paciente Teste',
  external_ref: null,
}

const sessao: backendApi.BackendSession = {
  id: 42,
  organization_id: 1,
  patient_id: 7,
  device_id: 1,
  external_session_id: 'sess-demo-001',
  status: 'completed',
  started_at: '2026-10-08T16:00:00Z',
  ended_at: '2026-10-08T17:00:00Z',
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  api.listPatients.mockResolvedValue([paciente])
  api.getPatientTimeline.mockResolvedValue({ items: [], next_cursor: null })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardProvider>
        <HistoryPage />
      </DashboardProvider>
    </MemoryRouter>,
  )
}

describe('HistoryPage — seção de sessões', () => {
  it('lista as sessões do paciente selecionado', async () => {
    api.listPatientSessions.mockResolvedValue({ items: [sessao], next_cursor: null })

    renderPage()

    expect(await screen.findByText('sess-demo-001')).toBeInTheDocument()
    await waitFor(() => expect(api.listPatientSessions).toHaveBeenCalledWith(7, { limit: 10 }))
  })

  it('carrega as interrupções só quando a sessão é expandida', async () => {
    api.listPatientSessions.mockResolvedValue({ items: [sessao], next_cursor: null })
    api.listSessionSignalInterruptions.mockResolvedValue([
      {
        kind: 'sinal_ruim',
        started_at: '2026-10-08T16:10:00Z',
        ended_at: '2026-10-08T16:10:05Z',
        duration_seconds: 5.0,
        missed_frames: 4,
      },
    ])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('sess-demo-001')

    expect(api.listSessionSignalInterruptions).not.toHaveBeenCalled()

    await user.click(screen.getByText('sess-demo-001'))

    await waitFor(() => expect(api.listSessionSignalInterruptions).toHaveBeenCalledWith(42))
    expect(await screen.findByText(/Sinal ruim/)).toBeInTheDocument()
    expect(screen.getByText(/5\.0s/)).toBeInTheDocument()
  })

  it('não recarrega ao expandir a mesma sessão duas vezes', async () => {
    api.listPatientSessions.mockResolvedValue({ items: [sessao], next_cursor: null })
    api.listSessionSignalInterruptions.mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('sess-demo-001')

    await user.click(screen.getByText('sess-demo-001'))
    await screen.findByText(/Nenhuma interrupção/)
    await user.click(screen.getByText('sess-demo-001'))
    await user.click(screen.getByText('sess-demo-001'))

    expect(api.listSessionSignalInterruptions).toHaveBeenCalledTimes(1)
  })

  it('mostra que não houve interrupção quando a lista vem vazia', async () => {
    api.listPatientSessions.mockResolvedValue({ items: [sessao], next_cursor: null })
    api.listSessionSignalInterruptions.mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('sess-demo-001')

    await user.click(screen.getByText('sess-demo-001'))

    expect(await screen.findByText(/Nenhuma interrupção de sinal registrada/)).toBeInTheDocument()
  })
})
