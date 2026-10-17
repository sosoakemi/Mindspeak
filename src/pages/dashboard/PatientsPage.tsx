import { useEffect, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Cpu,
  GraduationCap,
  Loader2,
  Play,
  Plus,
  Radio,
  Square,
  UserPlus,
} from 'lucide-react'
import { Button } from '../../components/shared/Button'
import { cn } from '../../lib/cn'
import { msCardPad, msInputBase, msLabel, msPill } from '../../lib/msStyles'
import {
  BackendApiError,
  createDevice,
  createPatient,
  createSession,
  endSession,
  getCalibrationStatus,
  listDevices,
  listPatientSessions,
  listPatients,
  startCalibrationCapture,
  stopCalibrationCapture,
  trainPatientModel,
  type BackendDevice,
  type BackendPatient,
  type BackendSession,
  type CalibrationLabel,
  type CalibrationStatus,
} from '../../lib/backendApi'

type Feedback = { kind: 'ok' | 'error'; text: string }

// Mesma condição que train_patient_classifier aplica no backend (ver
// ml_min_calibration_windows_per_class) — treinar mesmo assim ainda é
// possível (é só um aviso, não bloqueia o botão), mas quem está prestes a
// treinar precisa saber que esse paciente em particular pode ter um
// modelo menos confiável, sem precisar adivinhar ou abrir o console.
function belowCalibrationFloor(status: CalibrationStatus): boolean {
  return (
    status.foco_windows < status.min_windows_per_class ||
    status.repouso_windows < status.min_windows_per_class
  )
}

function FeedbackText({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null
  return (
    <p
      role="status"
      className={cn(
        'text-sm font-medium',
        feedback.kind === 'ok' ? 'text-green-700 dark:text-emerald-400' : 'text-red-600',
      )}
    >
      {feedback.text}
    </p>
  )
}

function apiErrorText(err: unknown, fallback: string): string {
  return err instanceof BackendApiError ? err.message : fallback
}

// --- lista + criação de pacientes -------------------------------------

function PatientListPanel({
  patients,
  selectedId,
  loading,
  onSelect,
  onCreated,
}: {
  patients: BackendPatient[]
  selectedId: number | null
  loading: boolean
  onSelect: (id: number) => void
  onCreated: (patient: BackendPatient) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [externalRef, setExternalRef] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  // true depois que o usuário já viu o aviso de duplicado e clicou de novo
  // em "Cadastrar" mesmo assim — evita bloquear pra sempre um paciente que
  // por coincidência tem o mesmo nome de outro já cadastrado.
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)

  const trimmedName = displayName.trim()
  const isDuplicateName =
    trimmedName.length > 0 &&
    patients.some((p) => p.display_name.trim().toLowerCase() === trimmedName.toLowerCase())

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!trimmedName) {
      setFeedback({ kind: 'error', text: 'Informe o nome do paciente.' })
      return
    }
    if (isDuplicateName && !duplicateConfirmed) {
      // 1º clique com nome repetido só avisa — não cadastra ainda. Clicar
      // de novo (com o mesmo nome) confirma e cadastra mesmo assim.
      setDuplicateConfirmed(true)
      setFeedback({
        kind: 'error',
        text: `Já existe um paciente chamado "${trimmedName}" nesta organização. Clique em "Cadastrar paciente" de novo para confirmar mesmo assim.`,
      })
      return
    }
    setIsCreating(true)
    setFeedback(null)
    try {
      const patient = await createPatient({
        display_name: displayName.trim(),
        external_ref: externalRef.trim() || undefined,
      })
      onCreated(patient)
      setDisplayName('')
      setExternalRef('')
      setDuplicateConfirmed(false)
      setFeedback({ kind: 'ok', text: `${patient.display_name} cadastrado(a).` })
    } catch (err) {
      setFeedback({ kind: 'error', text: apiErrorText(err, 'Não foi possível cadastrar agora.') })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className={cn(msCardPad, 'space-y-5')}>
      <div>
        <h2 className="text-sm font-semibold text-ms-primary">Pacientes</h2>
        <p className="mt-1 text-xs text-ms-muted">Da sua organização.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label htmlFor="patient-name" className={msLabel}>
            Nome
          </label>
          <input
            id="patient-name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              setDuplicateConfirmed(false)
            }}
            className={cn(msInputBase, 'border border-ms-border px-3 py-2')}
            placeholder="Nome do paciente"
            aria-describedby={isDuplicateName ? 'patient-name-duplicate-hint' : undefined}
          />
          {isDuplicateName ? (
            <p id="patient-name-duplicate-hint" className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Já existe um paciente com esse nome nesta organização.
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="patient-ref" className={msLabel}>
            Referência externa (opcional)
          </label>
          <input
            id="patient-ref"
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            className={cn(msInputBase, 'border border-ms-border px-3 py-2')}
            placeholder="Ex.: prontuário nº 123"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          fullWidth
          isLoading={isCreating}
          icon={<UserPlus className="h-4 w-4" aria-hidden />}
        >
          Cadastrar paciente
        </Button>
        <FeedbackText feedback={feedback} />
      </form>

      <div className="border-t border-ms-border-subtle pt-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-ms-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </p>
        ) : patients.length === 0 ? (
          <p className="text-sm text-ms-muted">Nenhum paciente cadastrado ainda.</p>
        ) : (
          <ul className="space-y-1">
            {patients.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => onSelect(patient.id)}
                  className={cn(
                    'flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition',
                    selectedId === patient.id
                      ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100 dark:bg-blue-950/60 dark:text-blue-100 dark:ring-blue-800/80'
                      : 'text-ms-secondary hover:bg-ms-subtle hover:text-ms-primary',
                  )}
                >
                  <span className="truncate">{patient.display_name}</span>
                  <span className="shrink-0 text-xs text-ms-muted">#{patient.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// --- dispositivos --------------------------------------------------------

function DevicesCard({
  patientId,
  devices,
  loading,
  onCreated,
}: {
  patientId: number
  devices: BackendDevice[]
  loading: boolean
  onCreated: (device: BackendDevice) => void
}) {
  const [deviceUid, setDeviceUid] = useState('')
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!deviceUid.trim() || !name.trim()) {
      setFeedback({ kind: 'error', text: 'Informe o identificador e o nome do sensor.' })
      return
    }
    setIsCreating(true)
    setFeedback(null)
    try {
      const device = await createDevice(patientId, {
        device_uid: deviceUid.trim(),
        name: name.trim(),
      })
      onCreated(device)
      setDeviceUid('')
      setName('')
      setFeedback({ kind: 'ok', text: `Sensor "${device.name}" cadastrado.` })
    } catch (err) {
      setFeedback({ kind: 'error', text: apiErrorText(err, 'Não foi possível cadastrar o sensor.') })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className={cn(msCardPad, 'space-y-4')}>
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ms-primary">
          <Cpu className="h-4 w-4" aria-hidden /> Dispositivos (sensores)
        </h2>
        <p className="mt-1 text-xs text-ms-muted">
          O identificador precisa ser o mesmo <code>--device-id</code> usado no simulador ou no
          leitor serial do TGAM.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="device-uid" className={msLabel}>
            Identificador (device_uid)
          </label>
          <input
            id="device-uid"
            value={deviceUid}
            onChange={(e) => setDeviceUid(e.target.value)}
            className={cn(msInputBase, 'border border-ms-border px-3 py-2')}
            placeholder="neurosky-001"
          />
        </div>
        <div>
          <label htmlFor="device-name" className={msLabel}>
            Nome
          </label>
          <input
            id="device-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(msInputBase, 'border border-ms-border px-3 py-2')}
            placeholder="Sensor do quarto 3"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" isLoading={isCreating} icon={<Plus className="h-4 w-4" aria-hidden />}>
          Adicionar
        </Button>
      </form>
      <FeedbackText feedback={feedback} />

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-ms-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
        </p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-ms-muted">Nenhum sensor cadastrado para este paciente.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {devices.map((device) => (
            <li key={device.id} className={msPill}>
              {device.name} — <span className="font-mono">{device.device_uid}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- sessão + calibração ao vivo -----------------------------------------

function CalibrationCard({
  patientId,
  devices,
  sessions,
  onSessionCreated,
  onSessionEnded,
}: {
  patientId: number
  devices: BackendDevice[]
  sessions: BackendSession[]
  onSessionCreated: (session: BackendSession) => void
  onSessionEnded: (session: BackendSession) => void
}) {
  const [deviceId, setDeviceId] = useState<number | ''>('')
  const [externalSessionId, setExternalSessionId] = useState('')
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [endingSessionId, setEndingSessionId] = useState<number | null>(null)
  const [sessionFeedback, setSessionFeedback] = useState<Feedback | null>(null)

  const [activeExternalSessionId, setActiveExternalSessionId] = useState('')
  const [activeLabel, setActiveLabel] = useState<CalibrationLabel | null>(null)
  const [captureFeedback, setCaptureFeedback] = useState<Feedback | null>(null)
  const [isTogglingCapture, setIsTogglingCapture] = useState(false)

  const [status, setStatus] = useState<CalibrationStatus | null>(null)
  const [isTraining, setIsTraining] = useState(false)
  const [trainFeedback, setTrainFeedback] = useState<Feedback | null>(null)

  const refreshStatus = async () => {
    try {
      setStatus(await getCalibrationStatus(patientId))
    } catch {
      // status é só um indicador — falha aqui não bloqueia o resto da tela.
    }
  }

  useEffect(() => {
    setActiveLabel(null)
    setActiveExternalSessionId('')
    setStatus(null)
    refreshStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  const onCreateSession = async (e: FormEvent) => {
    e.preventDefault()
    if (!deviceId || !externalSessionId.trim()) {
      setSessionFeedback({ kind: 'error', text: 'Escolha o sensor e informe o id da sessão.' })
      return
    }
    setIsCreatingSession(true)
    setSessionFeedback(null)
    try {
      const session = await createSession({
        patient_id: patientId,
        device_id: deviceId,
        external_session_id: externalSessionId.trim(),
      })
      onSessionCreated(session)
      setActiveExternalSessionId(session.external_session_id)
      setSessionFeedback({ kind: 'ok', text: `Sessão "${session.external_session_id}" criada.` })
    } catch (err) {
      setSessionFeedback({ kind: 'error', text: apiErrorText(err, 'Não foi possível criar a sessão.') })
    } finally {
      setIsCreatingSession(false)
    }
  }

  const toggleCapture = async (label: CalibrationLabel) => {
    if (!activeExternalSessionId.trim()) {
      setCaptureFeedback({ kind: 'error', text: 'Escolha uma sessão ativa antes de capturar.' })
      return
    }
    setIsTogglingCapture(true)
    setCaptureFeedback(null)
    try {
      if (activeLabel === label) {
        const result = await stopCalibrationCapture(patientId, activeExternalSessionId.trim())
        setActiveLabel(null)
        setCaptureFeedback({
          kind: 'ok',
          text: `Captura de "${result.label}" parada — ${result.window_count} janelas neste trecho (${result.total_window_count} no total).`,
        })
        await refreshStatus()
      } else {
        await startCalibrationCapture(patientId, {
          session_id: activeExternalSessionId.trim(),
          label,
        })
        setActiveLabel(label)
        setCaptureFeedback({
          kind: 'ok',
          text: `Captura de "${label}" iniciada — mantenha o sensor enviando dados por /ws/eeg.`,
        })
      }
    } catch (err) {
      setCaptureFeedback({ kind: 'error', text: apiErrorText(err, 'Não foi possível controlar a captura.') })
    } finally {
      setIsTogglingCapture(false)
    }
  }

  const onTrain = async () => {
    setIsTraining(true)
    setTrainFeedback(null)
    try {
      const result = await trainPatientModel(patientId)
      setTrainFeedback({
        kind: 'ok',
        text: `Modelo v${result.version} treinado — acurácia ${(result.accuracy * 100).toFixed(1)}%.`,
      })
    } catch (err) {
      setTrainFeedback({ kind: 'error', text: apiErrorText(err, 'Não foi possível treinar agora.') })
    } finally {
      setIsTraining(false)
    }
  }

  // Encerrar é o único caminho que libera o motor de decisão da memória do
  // backend; sem isto a sessão fica 'active' pra sempre e o motor fica
  // pendurado no servidor.
  const onEndSession = async (session: BackendSession) => {
    setEndingSessionId(session.id)
    setSessionFeedback(null)
    try {
      const ended = await endSession(session.id)
      onSessionEnded(ended)
      if (activeExternalSessionId === session.external_session_id) {
        setActiveExternalSessionId('')
      }
      setSessionFeedback({ kind: 'ok', text: `Sessão "${session.external_session_id}" encerrada.` })
    } catch (error) {
      setSessionFeedback({
        kind: 'error',
        text: apiErrorText(error, 'Não foi possível encerrar a sessão.'),
      })
    } finally {
      setEndingSessionId(null)
    }
  }

  const activeSessions = sessions.filter((s) => s.status === 'active')

  return (
    <div className={cn(msCardPad, 'space-y-6')}>
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ms-primary">
          <Radio className="h-4 w-4" aria-hidden /> Sessão e calibração ao vivo
        </h2>
        <p className="mt-1 text-xs text-ms-muted">
          Crie a sessão com o mesmo <code>--session-id</code> que o simulador ou o leitor serial vão
          usar, deixe o sensor (ou <code>tools/eeg_simulator.py</code>) enviando frames por
          /ws/eeg, e então inicie a captura rotulada.
        </p>
      </div>

      <form onSubmit={onCreateSession} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="session-device" className={msLabel}>
            Sensor
          </label>
          <select
            id="session-device"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : '')}
            className={cn(msInputBase, 'border border-ms-border px-3 py-2')}
          >
            <option value="">Selecione…</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} ({device.device_uid})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="session-external-id" className={msLabel}>
            Id da sessão (external_session_id)
          </label>
          <input
            id="session-external-id"
            value={externalSessionId}
            onChange={(e) => setExternalSessionId(e.target.value)}
            className={cn(msInputBase, 'border border-ms-border px-3 py-2')}
            placeholder="calib-2026-08-17"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" isLoading={isCreatingSession} icon={<Plus className="h-4 w-4" aria-hidden />}>
          Criar sessão
        </Button>
      </form>
      <FeedbackText feedback={sessionFeedback} />

      {activeSessions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activeSessions.map((session) => (
            <span key={session.id} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveExternalSessionId(session.external_session_id)}
                className={cn(
                  msPill,
                  'cursor-pointer',
                  activeExternalSessionId === session.external_session_id &&
                    'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 dark:bg-blue-950/60 dark:text-blue-100 dark:ring-blue-800',
                )}
              >
                {session.external_session_id}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                isLoading={endingSessionId === session.id}
                disabled={endingSessionId !== null}
                onClick={() => void onEndSession(session)}
                title="Encerra a sessão e libera o motor de decisão no servidor"
                aria-label={`Encerrar sessão ${session.external_session_id}`}
              >
                Encerrar
              </Button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl bg-ms-subtle p-4 dark:bg-ms-subtle-strong/80">
        <p className={msLabel}>Sessão em captura</p>
        <input
          value={activeExternalSessionId}
          onChange={(e) => setActiveExternalSessionId(e.target.value)}
          className={cn(msInputBase, 'border border-ms-border px-3 py-2')}
          placeholder="id da sessão ativa"
        />

        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            variant={activeLabel === 'foco' ? 'danger' : 'primary'}
            size="sm"
            isLoading={isTogglingCapture && activeLabel !== 'repouso'}
            disabled={isTogglingCapture && activeLabel === 'repouso'}
            icon={
              activeLabel === 'foco' ? (
                <Square className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )
            }
            onClick={() => toggleCapture('foco')}
          >
            {activeLabel === 'foco' ? 'Parar captura de foco' : 'Iniciar captura de foco'}
          </Button>
          <Button
            type="button"
            variant={activeLabel === 'repouso' ? 'danger' : 'secondary'}
            size="sm"
            isLoading={isTogglingCapture && activeLabel !== 'foco'}
            disabled={isTogglingCapture && activeLabel === 'foco'}
            icon={
              activeLabel === 'repouso' ? (
                <Square className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )
            }
            onClick={() => toggleCapture('repouso')}
          >
            {activeLabel === 'repouso' ? 'Parar captura de repouso' : 'Iniciar captura de repouso'}
          </Button>
        </div>
        <div className="mt-3">
          <FeedbackText feedback={captureFeedback} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ms-border-subtle pt-4">
        <div className="flex flex-wrap gap-4 text-sm text-ms-secondary">
          <span>
            Total: <strong className="text-ms-primary">{status?.total_windows ?? 0}</strong>
          </span>
          <span>
            Foco: <strong className="text-ms-primary">{status?.foco_windows ?? 0}</strong>
          </span>
          <span>
            Repouso: <strong className="text-ms-primary">{status?.repouso_windows ?? 0}</strong>
          </span>
        </div>
        {status && status.total_windows > 0 && belowCalibrationFloor(status) ? (
          <span
            className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600"
            title={`Mínimo recomendado: ${status.min_windows_per_class} janelas por classe (foco e repouso).`}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Calibração abaixo do recomendado
          </span>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="sm"
          isLoading={isTraining}
          disabled={!status || status.total_windows === 0}
          icon={<GraduationCap className="h-4 w-4" aria-hidden />}
          onClick={onTrain}
        >
          Treinar modelo
        </Button>
      </div>
      <FeedbackText feedback={trainFeedback} />
    </div>
  )
}

// --- painel de detalhe do paciente ---------------------------------------

function PatientDetailPanel({ patient }: { patient: BackendPatient }) {
  const [devices, setDevices] = useState<BackendDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [sessions, setSessions] = useState<BackendSession[]>([])

  useEffect(() => {
    let cancelled = false
    setLoadingDevices(true)
    listDevices(patient.id)
      .then((result) => {
        if (!cancelled) setDevices(result)
      })
      .finally(() => {
        if (!cancelled) setLoadingDevices(false)
      })
    listPatientSessions(patient.id).then((page) => {
      if (!cancelled) setSessions(page.items)
    })
    return () => {
      cancelled = true
    }
  }, [patient.id])

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-emerald-950 dark:text-emerald-100 sm:text-2xl">
          {patient.display_name}
        </h1>
        <p className="mt-1 text-sm text-ms-secondary">
          Paciente #{patient.id}
          {patient.external_ref ? ` — ${patient.external_ref}` : ''}
        </p>
      </div>

      <DevicesCard
        patientId={patient.id}
        devices={devices}
        loading={loadingDevices}
        onCreated={(device) => setDevices((prev) => [...prev, device])}
      />

      <CalibrationCard
        patientId={patient.id}
        devices={devices}
        sessions={sessions}
        onSessionCreated={(session) => setSessions((prev) => [session, ...prev])}
        onSessionEnded={(ended) =>
          setSessions((prev) => prev.map((s) => (s.id === ended.id ? ended : s)))
        }
      />
    </div>
  )
}

// --- página principal ------------------------------------------------------

export function PatientsPage() {
  const [patients, setPatients] = useState<BackendPatient[]>([])
  const [loadingPatients, setLoadingPatients] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    listPatients()
      .then((result) => {
        if (cancelled) return
        setPatients(result)
        if (result.length > 0) setSelectedId((current) => current ?? result[0].id)
      })
      .finally(() => {
        if (!cancelled) setLoadingPatients(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedPatient = patients.find((p) => p.id === selectedId) ?? null

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[320px_1fr]">
      <PatientListPanel
        patients={patients}
        selectedId={selectedId}
        loading={loadingPatients}
        onSelect={setSelectedId}
        onCreated={(patient) => {
          setPatients((prev) => [...prev, patient])
          setSelectedId(patient.id)
        }}
      />
      {selectedPatient ? (
        <PatientDetailPanel patient={selectedPatient} />
      ) : (
        <div className={cn(msCardPad, 'flex items-center justify-center text-sm text-ms-muted')}>
          {loadingPatients ? 'Carregando pacientes…' : 'Cadastre um paciente para começar.'}
        </div>
      )}
    </div>
  )
}
