import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PatientsPage } from './PatientsPage'
import * as backendApi from '../../lib/backendApi'

vi.mock('../../lib/backendApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/backendApi')>(
    '../../lib/backendApi',
  )
  return {
    ...actual,
    listPatients: vi.fn(),
    createPatient: vi.fn(),
    listDevices: vi.fn(),
    createDevice: vi.fn(),
    listPatientSessions: vi.fn(),
    createSession: vi.fn(),
    startCalibrationCapture: vi.fn(),
    stopCalibrationCapture: vi.fn(),
    getCalibrationStatus: vi.fn(),
    trainPatientModel: vi.fn(),
  }
})

const api = vi.mocked(backendApi)

const patientA: backendApi.BackendPatient = {
  id: 1,
  organization_id: 10,
  display_name: 'Paciente A',
  external_ref: null,
}

const deviceA: backendApi.BackendDevice = {
  id: 5,
  organization_id: 10,
  device_uid: 'neurosky-001',
  name: 'Sensor A',
  patient_id: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listDevices.mockResolvedValue([])
  api.listPatientSessions.mockResolvedValue({ items: [], next_cursor: null })
  api.getCalibrationStatus.mockResolvedValue({
    patient_id: 1,
    total_windows: 0,
    foco_windows: 0,
    repouso_windows: 0,
    min_windows_per_class: 20,
  })
})

describe('PatientsPage', () => {
  it('carrega e exibe a lista de pacientes da organização', async () => {
    api.listPatients.mockResolvedValue([patientA])
    render(<PatientsPage />)

    expect(await screen.findByRole('heading', { name: 'Paciente A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Paciente A/ })).toBeInTheDocument()
  })

  it('cadastra um novo paciente e o seleciona automaticamente', async () => {
    api.listPatients.mockResolvedValue([])
    api.createPatient.mockResolvedValue({
      id: 2,
      organization_id: 10,
      display_name: 'Novo Paciente',
      external_ref: null,
    })
    const user = userEvent.setup()
    render(<PatientsPage />)

    await screen.findByText('Cadastre um paciente para começar.')
    await user.type(screen.getByLabelText('Nome'), 'Novo Paciente')
    await user.click(screen.getByRole('button', { name: 'Cadastrar paciente' }))

    expect(api.createPatient).toHaveBeenCalledWith({
      display_name: 'Novo Paciente',
      external_ref: undefined,
    })
    expect(await screen.findByRole('heading', { name: 'Novo Paciente' })).toBeInTheDocument()
  })

  it('cadastra um dispositivo para o paciente selecionado', async () => {
    api.listPatients.mockResolvedValue([patientA])
    api.createDevice.mockResolvedValue(deviceA)
    const user = userEvent.setup()
    render(<PatientsPage />)

    await screen.findByRole('heading', { name: 'Paciente A' })
    await user.type(screen.getByLabelText('Identificador (device_uid)'), 'neurosky-001')
    await user.type(screen.getByLabelText('Nome', { selector: '#device-name' }), 'Sensor A')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))

    expect(api.createDevice).toHaveBeenCalledWith(1, {
      device_uid: 'neurosky-001',
      name: 'Sensor A',
    })
    await waitFor(() => expect(screen.getAllByText(/Sensor A/).length).toBeGreaterThan(0))
  })

  it('inicia e para a captura de calibração rotulada', async () => {
    api.listPatients.mockResolvedValue([patientA])
    api.listDevices.mockResolvedValue([deviceA])
    api.startCalibrationCapture.mockResolvedValue({
      patient_id: 1,
      session_id: 'sess-001',
      label: 'foco',
    })
    api.stopCalibrationCapture.mockResolvedValue({
      patient_id: 1,
      session_id: 'sess-001',
      label: 'foco',
      window_count: 12,
      total_window_count: 12,
      artifact_path: '/tmp/1_sess-001.npz',
    })
    const user = userEvent.setup()
    render(<PatientsPage />)

    await screen.findByRole('heading', { name: 'Paciente A' })
    const sessionInput = screen.getByPlaceholderText('id da sessão ativa')
    await user.type(sessionInput, 'sess-001')

    await user.click(screen.getByRole('button', { name: 'Iniciar captura de foco' }))
    expect(api.startCalibrationCapture).toHaveBeenCalledWith(1, {
      session_id: 'sess-001',
      label: 'foco',
    })

    await screen.findByRole('button', { name: 'Parar captura de foco' })
    await user.click(screen.getByRole('button', { name: 'Parar captura de foco' }))
    expect(api.stopCalibrationCapture).toHaveBeenCalledWith(1, 'sess-001')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Iniciar captura de foco' })).toBeInTheDocument(),
    )
  })

  it('avisa quando a calibração está abaixo do piso recomendado', async () => {
    api.listPatients.mockResolvedValue([patientA])
    api.listDevices.mockResolvedValue([deviceA])
    api.getCalibrationStatus.mockResolvedValue({
      patient_id: 1,
      total_windows: 25,
      foco_windows: 20,
      repouso_windows: 5, // abaixo do piso — é isto que deve disparar o aviso
      min_windows_per_class: 20,
    })

    render(<PatientsPage />)

    await screen.findByRole('heading', { name: 'Paciente A' })
    expect(await screen.findByText('Calibração abaixo do recomendado')).toBeInTheDocument()
  })

  it('não avisa quando a calibração atinge o piso recomendado nas duas classes', async () => {
    api.listPatients.mockResolvedValue([patientA])
    api.listDevices.mockResolvedValue([deviceA])
    api.getCalibrationStatus.mockResolvedValue({
      patient_id: 1,
      total_windows: 44,
      foco_windows: 22,
      repouso_windows: 22,
      min_windows_per_class: 20,
    })

    render(<PatientsPage />)

    await screen.findByRole('heading', { name: 'Paciente A' })
    await waitFor(() => expect(api.getCalibrationStatus).toHaveBeenCalled())
    expect(screen.queryByText('Calibração abaixo do recomendado')).not.toBeInTheDocument()
  })

  it('não deixa iniciar captura sem uma sessão informada', async () => {
    api.listPatients.mockResolvedValue([patientA])
    api.listDevices.mockResolvedValue([deviceA])
    const user = userEvent.setup()
    render(<PatientsPage />)

    await screen.findByRole('heading', { name: 'Paciente A' })
    await user.click(screen.getByRole('button', { name: 'Iniciar captura de foco' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/escolha uma sessão/i)
    expect(api.startCalibrationCapture).not.toHaveBeenCalled()
  })
})
