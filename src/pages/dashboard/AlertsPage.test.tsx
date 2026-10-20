import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertsPage } from './AlertsPage'
import { DashboardProvider } from './dashboard-context'
import * as backendApi from '../../lib/backendApi'

vi.mock('../../lib/backendApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/backendApi')>('../../lib/backendApi')
  return {
    ...actual,
    listPatients: vi.fn(),
    listPatientAlerts: vi.fn(),
    acknowledgeAlerts: vi.fn(),
  }
})

const api = vi.mocked(backendApi)

const paciente = {
  id: 7,
  organization_id: 1,
  display_name: 'Paciente Teste',
  external_ref: null,
  voice_preference: null,
}

function alerta(overrides: Partial<backendApi.PatientAlert> = {}): backendApi.PatientAlert {
  return {
    id: 1,
    session_id: 1,
    word_id: 1,
    utterance: 'ESTOU COM DOR',
    severity: 'critico',
    confidence: 0.9,
    selected_at: '2026-10-06T14:22:00Z',
    acknowledged_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  api.listPatients.mockResolvedValue([paciente])
  api.acknowledgeAlerts.mockResolvedValue({ acknowledged: 1 })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardProvider>
        <AlertsPage />
      </DashboardProvider>
    </MemoryRouter>,
  )
}

describe('AlertsPage', () => {
  it('mostra os alertas do paciente selecionado', async () => {
    api.listPatientAlerts.mockResolvedValue({
      items: [alerta(), alerta({ id: 2, utterance: 'CHAMAR ALGUÉM', severity: 'moderado' })],
      next_cursor: null,
      unacknowledged_count: 2,
    })

    renderPage()

    expect(await screen.findByText('ESTOU COM DOR')).toBeInTheDocument()
    expect(screen.getByText('CHAMAR ALGUÉM')).toBeInTheDocument()
    await waitFor(() => expect(api.listPatientAlerts).toHaveBeenCalledWith(7, { limit: 100 }))
  })

  it('filtra por severidade', async () => {
    api.listPatientAlerts.mockResolvedValue({
      items: [alerta(), alerta({ id: 2, utterance: 'CHAMAR ALGUÉM', severity: 'moderado' })],
      next_cursor: null,
      unacknowledged_count: 2,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('ESTOU COM DOR')

    await user.click(screen.getByRole('button', { name: 'Moderados' }))

    expect(screen.queryByText('ESTOU COM DOR')).not.toBeInTheDocument()
    expect(screen.getByText('CHAMAR ALGUÉM')).toBeInTheDocument()
  })

  it('dá baixa em um alerta e recarrega a lista', async () => {
    api.listPatientAlerts.mockResolvedValue({
      items: [alerta()],
      next_cursor: null,
      unacknowledged_count: 1,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('ESTOU COM DOR')

    await user.click(screen.getByRole('button', { name: /marcar como visto/i }))

    await waitFor(() =>
      expect(api.acknowledgeAlerts).toHaveBeenCalledWith(7, { selectionIds: [1] }),
    )
    // Recarrega em vez de confiar no estado local: a contagem em aberto é
    // calculada no servidor.
    await waitFor(() => expect(api.listPatientAlerts).toHaveBeenCalledTimes(2))
  })

  it('explica o vazio em vez de mostrar uma lista em branco', async () => {
    api.listPatientAlerts.mockResolvedValue({
      items: [],
      next_cursor: null,
      unacknowledged_count: 0,
    })

    renderPage()

    expect(await screen.findByText('Nenhum alerta.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /marcar todos como visto/i })).toBeDisabled()
  })

  it('mostra que o alerta já foi visto, sem oferecer a ação de novo', async () => {
    api.listPatientAlerts.mockResolvedValue({
      items: [alerta({ acknowledged_at: '2026-10-06T15:00:00Z' })],
      next_cursor: null,
      unacknowledged_count: 0,
    })

    renderPage()

    const item = await screen.findByRole('listitem')
    expect(within(item).getByText(/^Visto/)).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: /marcar como visto/i })).toBeDisabled()
  })
})
