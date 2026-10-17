import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePatientSelection } from './usePatientSelection'
import * as backendApi from '../lib/backendApi'

// Extraído de dashboard-context.tsx e portal-patient-context.tsx — os
// dois convergiram pra exatamente esta lógica de seleção/persistência, e
// cada um já teve o próprio bug ("primeiro da lista em silêncio, sem
// escolha explícita") corrigido em momento diferente. Testar aqui, uma
// vez, cobre os dois portais ao mesmo tempo.

vi.mock('../lib/backendApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/backendApi')>('../lib/backendApi')
  return { ...actual, listPatients: vi.fn() }
})

const api = vi.mocked(backendApi)

const patientA: backendApi.BackendPatient = {
  id: 1,
  organization_id: 10,
  display_name: 'Paciente A',
  external_ref: null,
}
const patientB: backendApi.BackendPatient = {
  id: 2,
  organization_id: 10,
  display_name: 'Paciente B',
  external_ref: null,
}

const STORAGE_KEY = 'test_patient_selection_key'

function Probe({ storageKey }: { storageKey: string }) {
  const { patients, selectedPatient, selectPatient, loading, error } =
    usePatientSelection(storageKey)
  if (loading) return <p>carregando</p>
  if (error) return <p>erro: {error}</p>
  return (
    <div>
      <p data-testid="selected">{selectedPatient?.display_name ?? 'nenhum'}</p>
      <ul>
        {patients.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => selectPatient(p.id)}>
              {p.display_name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('usePatientSelection', () => {
  it('cai no primeiro da lista quando não há escolha salva', async () => {
    api.listPatients.mockResolvedValue([patientA, patientB])
    render(<Probe storageKey={STORAGE_KEY} />)

    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Paciente A'))
  })

  it('lembra a escolha salva entre "visitas" (nova instância do hook)', async () => {
    api.listPatients.mockResolvedValue([patientA, patientB])
    const user = userEvent.setup()
    const { unmount } = render(<Probe storageKey={STORAGE_KEY} />)

    await screen.findByText('Paciente B')
    await user.click(screen.getByRole('button', { name: 'Paciente B' }))
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Paciente B'))

    unmount()
    render(<Probe storageKey={STORAGE_KEY} />)
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Paciente B'))
  })

  it('cai no primeiro quando a escolha salva aponta pra alguém que saiu da lista', async () => {
    localStorage.setItem(STORAGE_KEY, '999') // id que não existe mais
    api.listPatients.mockResolvedValue([patientA, patientB])
    render(<Probe storageKey={STORAGE_KEY} />)

    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Paciente A'))
  })

  it('duas chaves de storage diferentes não se afetam (portais independentes)', async () => {
    api.listPatients.mockResolvedValue([patientA, patientB])
    const user = userEvent.setup()
    render(<Probe storageKey="chave-clinico" />)

    await screen.findByText('Paciente B')
    await user.click(screen.getByRole('button', { name: 'Paciente B' }))
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Paciente B'))

    // uma chave DIFERENTE (o outro portal) não deve ter sido afetada.
    expect(localStorage.getItem('chave-familiar')).toBeNull()
  })
})
