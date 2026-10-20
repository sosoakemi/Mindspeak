export const PATIENT_SESSION_STORAGE_KEY = 'mindspeak_patient_session'

export type PatientSessionPayload = {
  patientId: string
  patientName: string
  /** ISO string */
  connectedAt: string
  /** ISO string — última sincronização bem-sucedida */
  lastSyncAt?: string
  /** O "sync" só abre e fecha um WebSocket pro backend (ver
   * hooks/usePatientSync.ts) — confirma que o BACKEND está alcançável
   * daqui, nada sobre o sensor físico estar ligado ou plugado em algum
   * computador. Nome antigo (`sensorConnected`) afirmava isso sem checar
   * nada — achado em teste real: aparecia "Sincronizado"/"Sensor
   * conectado" com o sensor literalmente desligado da tomada. */
  backendReachable?: boolean
}

export const PATIENT_SESSION_CHANGED_EVENT = 'mindspeak-patient-session-changed'

function notifySessionChanged() {
  window.dispatchEvent(new CustomEvent(PATIENT_SESSION_CHANGED_EVENT))
}

export function savePatientSession(data: PatientSessionPayload) {
  try {
    localStorage.setItem(PATIENT_SESSION_STORAGE_KEY, JSON.stringify(data))
    notifySessionChanged()
  } catch {
    // ignore quota / private mode
  }
}

export function patchPatientSession(patch: Partial<PatientSessionPayload>) {
  const current = getPatientSession()
  if (!current) return
  savePatientSession({ ...current, ...patch })
}

export function getPatientSession(): PatientSessionPayload | null {
  try {
    const raw = localStorage.getItem(PATIENT_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Record<string, unknown>
    if (typeof o.patientId !== 'string' || typeof o.patientName !== 'string' || typeof o.connectedAt !== 'string') {
      return null
    }
    return {
      patientId: o.patientId,
      patientName: o.patientName,
      connectedAt: o.connectedAt,
      lastSyncAt: typeof o.lastSyncAt === 'string' ? o.lastSyncAt : undefined,
      backendReachable: typeof o.backendReachable === 'boolean' ? o.backendReachable : undefined,
    }
  } catch {
    return null
  }
}

export function clearPatientSession() {
  try {
    localStorage.removeItem(PATIENT_SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}
