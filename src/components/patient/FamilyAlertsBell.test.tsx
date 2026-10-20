import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FamilyAlertsBell } from './FamilyAlertsBell'
import * as backendApi from '../../lib/backendApi'

// O backend já recusa o cuidador dando baixa em alerta (403 — ver
// app/api/rest/dashboard.py, acknowledge exige clinician/admin). Este
// componente é por isso deliberadamente só leitura: nenhum teste aqui
// deve existir pra um botão de "marcar como visto" que o backend
// rejeitaria de qualquer forma.

vi.mock('../../lib/backendApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/backendApi')>('../../lib/backendApi')
  return { ...actual, listPatientAlerts: vi.fn() }
})

const api = vi.mocked(backendApi)

const alertaCritico: backendApi.PatientAlert = {
  id: 1,
  session_id: 9,
  word_id: 4,
  utterance: 'Dor',
  severity: 'critico',
  confidence: 0.9,
  selected_at: '2026-09-22T17:20:41.000Z',
  acknowledged_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FamilyAlertsBell', () => {
  it('não chama a API nem mostra nada quando não há paciente selecionado', () => {
    render(<FamilyAlertsBell patientId={null} />)
    expect(api.listPatientAlerts).not.toHaveBeenCalled()
  })

  it('mostra a contagem de não lidos como badge no sino', async () => {
    api.listPatientAlerts.mockResolvedValue({
      items: [alertaCritico],
      next_cursor: null,
      unacknowledged_count: 3,
    })
    render(<FamilyAlertsBell patientId={8} />)

    await waitFor(() => expect(api.listPatientAlerts).toHaveBeenCalledWith(8, {
      limit: 10,
      unacknowledgedOnly: true,
    }))
    expect(await screen.findByText('3')).toBeInTheDocument()
  })

  it('ao clicar, abre a lista com severidade e texto da frase — sem botão de ação', async () => {
    api.listPatientAlerts.mockResolvedValue({
      items: [alertaCritico],
      next_cursor: null,
      unacknowledged_count: 1,
    })
    const user = userEvent.setup()
    render(<FamilyAlertsBell patientId={8} />)

    await waitFor(() => expect(api.listPatientAlerts).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /notificações/i }))

    expect(await screen.findByText('Dor')).toBeInTheDocument()
    expect(screen.getByText(/crítico/i)).toBeInTheDocument()
    // só-leitura: nunca deve haver um jeito de dar baixa por aqui — isso
    // é privilégio da equipe clínica (o backend recusaria mesmo).
    expect(screen.queryByRole('button', { name: /marcar como vist/i })).not.toBeInTheDocument()
  })

  it('sem notificações pendentes, não mostra nenhum badge', async () => {
    api.listPatientAlerts.mockResolvedValue({
      items: [],
      next_cursor: null,
      unacknowledged_count: 0,
    })
    render(<FamilyAlertsBell patientId={8} />)

    await waitFor(() => expect(api.listPatientAlerts).toHaveBeenCalled())
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
