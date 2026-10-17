import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  acknowledgeAlerts,
  listPatientAlerts,
  type BackendPatient,
  type PatientAlert,
} from '../../lib/backendApi'
import { usePatientSelection } from '../../hooks/usePatientSelection'

// As telas clínicas falam sempre de UM paciente, mas até agora não havia
// essa noção em lugar nenhum: cada tela mostrava um paciente fictício
// fixo. O paciente escolhido vive aqui e é lembrado entre visitas — ver
// hooks/usePatientSelection, que carrega essa lógica (compartilhada com
// o portal familiar, ver portal-patient-context.tsx). Cada portal usa
// sua PRÓPRIA chave de localStorage — nunca a mesma — senão escolher um
// paciente aqui mudaria silenciosamente o que o portal familiar mostra.
const SELECTED_PATIENT_KEY = 'mindspeak_dashboard_patient'

type Ctx = {
  patients: BackendPatient[]
  selectedPatient: BackendPatient | null
  selectPatient: (id: number) => void
  patientsLoading: boolean
  patientsError: string | null

  alerts: PatientAlert[]
  unreadCount: number
  alertsLoading: boolean
  alertsError: string | null
  markRead: (selectionId: number) => Promise<void>
  markAllRead: () => Promise<void>
  reloadAlerts: () => void
}

const DashboardCtx = createContext<Ctx | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const {
    patients,
    selectedPatient,
    selectPatient,
    loading: patientsLoading,
    error: patientsError,
  } = usePatientSelection(SELECTED_PATIENT_KEY)
  const selectedId = selectedPatient?.id ?? null

  const [alerts, setAlerts] = useState<PatientAlert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [alertsNonce, setAlertsNonce] = useState(0)

  useEffect(() => {
    if (selectedId === null) {
      setAlerts([])
      setUnreadCount(0)
      return
    }
    let cancelled = false
    setAlertsLoading(true)
    setAlertsError(null)
    listPatientAlerts(selectedId, { limit: 100 })
      .then((page) => {
        if (cancelled) return
        setAlerts(page.items)
        setUnreadCount(page.unacknowledged_count)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAlertsError(error instanceof Error ? error.message : 'Falha ao carregar alertas.')
        }
      })
      .finally(() => {
        if (!cancelled) setAlertsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, alertsNonce])

  const reloadAlerts = useCallback(() => setAlertsNonce((n) => n + 1), [])

  const markRead = useCallback(
    async (selectionId: number) => {
      if (selectedId === null) return
      await acknowledgeAlerts(selectedId, { selectionIds: [selectionId] })
      reloadAlerts()
    },
    [selectedId, reloadAlerts],
  )

  const markAllRead = useCallback(async () => {
    if (selectedId === null) return
    await acknowledgeAlerts(selectedId, { all: true })
    reloadAlerts()
  }, [selectedId, reloadAlerts])

  const value = useMemo<Ctx>(
    () => ({
      patients,
      selectedPatient,
      selectPatient,
      patientsLoading,
      patientsError,
      alerts,
      unreadCount,
      alertsLoading,
      alertsError,
      markRead,
      markAllRead,
      reloadAlerts,
    }),
    [
      patients,
      selectedPatient,
      selectPatient,
      patientsLoading,
      patientsError,
      alerts,
      unreadCount,
      alertsLoading,
      alertsError,
      markRead,
      markAllRead,
      reloadAlerts,
    ],
  )

  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>
}

export function useDashboard() {
  const value = useContext(DashboardCtx)
  if (!value) throw new Error('useDashboard precisa estar dentro de DashboardProvider')
  return value
}
