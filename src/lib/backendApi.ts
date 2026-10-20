import { getAccessToken } from './authSession'
import { getApiBaseUrl } from './backendConfig'

export class BackendApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type BackendWord = {
  id: number
  text: string
  /** urgência definida pelo clínico; acima de 'informativo' vira alerta */
  severity: WordSeverity
  /** ordem na varredura da grade do paciente */
  position: number
}

export type BackendSession = {
  id: number
  organization_id: number
  patient_id: number
  device_id: number
  external_session_id: string
  status: 'active' | 'completed' | 'cancelled'
  started_at: string
  ended_at: string | null
}

export type BackendSelection = {
  id: number
  session_id: number
  word_id: number
  utterance: string
  confidence: number
  selected_at: string
}

export type BackendUserRole = 'patient' | 'clinician' | 'caregiver' | 'admin'

export type BackendUser = {
  id: number
  email: string
  full_name: string
  role: BackendUserRole
  organization_id: number | null
}

export type BackendTokenResponse = {
  access_token: string
  token_type: string
  user: BackendUser
}

export type BackendPatient = {
  id: number
  organization_id: number
  display_name: string
  external_ref: string | null
  // 'feminina' | 'masculina' | null — null = sem preferência (cai no
  // fallback local de cada navegador). Fica no paciente, não no
  // navegador: clínico e familiar ficam em aparelhos diferentes e
  // precisam concordar na MESMA voz pra sessão ao vivo de verdade.
  voice_preference: AiVoiceName | null
}

export type BackendDevice = {
  id: number
  organization_id: number
  device_uid: string
  name: string
  patient_id: number | null
}

export type CalibrationLabel = 'foco' | 'repouso'

export type CalibrationCaptureStartResponse = {
  patient_id: number
  session_id: string
  label: CalibrationLabel
}

export type CalibrationCaptureStopResponse = {
  patient_id: number
  session_id: string
  label: CalibrationLabel
  window_count: number
  total_window_count: number
  artifact_path: string
}

export type CalibrationStatus = {
  patient_id: number
  total_windows: number
  foco_windows: number
  repouso_windows: number
  // Mesmo piso que o backend aplica em train_patient_classifier — comparar
  // contra isto em vez de um número fixo na tela, pra não desalinhar se o
  // piso mudar do lado do servidor.
  min_windows_per_class: number
}

export type TrainResponse = {
  patient_id: number
  accuracy: number
  version: number
  artifact_path: string
  classifier: string
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    if (typeof body?.detail === 'string') return body.detail
  } catch {
    // resposta sem corpo JSON — usa a mensagem genérica abaixo.
  }
  return `HTTP ${response.status}`
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new BackendApiError(response.status, await extractErrorMessage(response))
  }
  return (await response.json()) as T
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new BackendApiError(response.status, await extractErrorMessage(response))
  }
  return (await response.json()) as T
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new BackendApiError(response.status, await extractErrorMessage(response))
  }
  return (await response.json()) as T
}

async function postJson<T>(path: string, body: unknown, useAuth = false): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(useAuth ? authHeaders() : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new BackendApiError(response.status, await extractErrorMessage(response))
  }
  return (await response.json()) as T
}

export function getSessionByExternalId(externalSessionId: string): Promise<BackendSession> {
  return getJson(`/sessions/by-external/${encodeURIComponent(externalSessionId)}`)
}

export function getSessionWords(sessionId: number): Promise<BackendWord[]> {
  return getJson(`/sessions/${sessionId}/words`)
}

export function getSessionSelections(
  sessionId: number,
): Promise<{ items: BackendSelection[]; next_cursor: string | null }> {
  return getJson(`/sessions/${sessionId}/selections`)
}

// Encerra a sessão: marca como concluída no banco e libera o motor de
// decisão da memória do servidor. Sem isto a sessão fica 'active' pra
// sempre e o motor nunca sai do dicionário em memória do backend.
export function endSession(sessionId: number): Promise<BackendSession> {
  return postJson(`/sessions/${sessionId}/end`, {}, true)
}

// Atalho de operador/teste: avança a varredura na hora, sem esperar o
// timer. Não substitui a decisão do motor — o paciente continua sendo
// selecionado pelo sinal do sensor; isto só pula o destaque adiante.
export function skipToNextWord(sessionId: number): Promise<{ status: string }> {
  return postJson(`/sessions/${sessionId}/skip`, {}, true)
}

// Confirmação manual de contingência (tecla "A" em sessão ao vivo): anuncia
// a palavra destacada pra quem estiver vendo esta sessão — qualquer tela
// conectada ao /ws/status, não só quem apertou. NUNCA grava no histórico
// clínico: não é o sensor decidindo, é um override manual assumido.
export function triggerFallbackConfirm(
  sessionId: number,
): Promise<{ status: string; word_id?: string; text?: string }> {
  return postJson(`/sessions/${sessionId}/fallback-confirm`, {}, true)
}

export function registerCaregiver(payload: {
  full_name: string
  email: string
  password: string
}): Promise<BackendTokenResponse> {
  return postJson('/auth/register/caregiver', payload)
}

export function registerClinician(payload: {
  full_name: string
  email: string
  password: string
  organization_name: string
}): Promise<BackendTokenResponse> {
  return postJson('/auth/register/clinician', payload)
}

export function login(payload: {
  email: string
  password: string
}): Promise<BackendTokenResponse> {
  return postJson('/auth/login', payload)
}

export function assignCaregiver(patientId: number, caregiverEmail: string): Promise<BackendUser> {
  return postJson(`/patients/${patientId}/caregivers`, { caregiver_email: caregiverEmail }, true)
}

export function createPatient(payload: {
  display_name: string
  external_ref?: string
}): Promise<BackendPatient> {
  return postJson('/patients', payload, true)
}

export function listPatients(): Promise<BackendPatient[]> {
  return getJson('/patients')
}

export function createDevice(
  patientId: number,
  payload: { device_uid: string; name: string },
): Promise<BackendDevice> {
  return postJson(`/patients/${patientId}/devices`, payload, true)
}

export function listDevices(patientId: number): Promise<BackendDevice[]> {
  return getJson(`/patients/${patientId}/devices`)
}

export function createSession(payload: {
  patient_id: number
  device_id: number
  external_session_id: string
}): Promise<BackendSession> {
  return postJson('/sessions', payload, true)
}

export function listPatientSessions(
  patientId: number,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ items: BackendSession[]; next_cursor: string | null }> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.cursor) params.set('cursor', options.cursor)
  const query = params.toString()
  return getJson(`/patients/${patientId}/sessions${query ? `?${query}` : ''}`)
}

export type SignalInterruption = {
  kind: 'sinal_ruim' | 'esense_degenerado'
  started_at: string
  ended_at: string
  duration_seconds: number
  missed_frames: number
}

// Reconstruído das leituras já gravadas pelo backend, não de um evento
// dedicado — ver list_session_signal_interruptions no backend. Só
// episódios com leitura boa depois entram na lista: um trecho que nunca
// se resolveu antes da sessão acabar não tem duração que dê pra medir.
export function listSessionSignalInterruptions(sessionId: number): Promise<SignalInterruption[]> {
  return getJson(`/sessions/${sessionId}/signal-interruptions`)
}

export function startCalibrationCapture(
  patientId: number,
  payload: { session_id: string; label: CalibrationLabel },
): Promise<CalibrationCaptureStartResponse> {
  return postJson(`/patients/${patientId}/calibration/capture/start`, payload, true)
}

export function stopCalibrationCapture(
  patientId: number,
  sessionId: string,
): Promise<CalibrationCaptureStopResponse> {
  return postJson(
    `/patients/${patientId}/calibration/capture/stop`,
    { session_id: sessionId },
    true,
  )
}

export function getCalibrationStatus(patientId: number): Promise<CalibrationStatus> {
  return getJson(`/patients/${patientId}/calibration/status`)
}

export function trainPatientModel(patientId: number): Promise<TrainResponse> {
  return postJson(`/patients/${patientId}/train`, {}, true)
}

// --- voz por IA (ElevenLabs) ------------------------------------------------

export type AiVoiceName = 'feminina' | 'masculina'

export type AiVoice = {
  name: AiVoiceName
  label: string
}

/** Vozes por IA disponíveis. Vem VAZIO quando a ElevenLabs não está
 * configurada no backend — nesse caso o app só oferece as vozes locais. */
export function listAiVoices(): Promise<AiVoice[]> {
  return getJson('/tts/voices')
}

/** Pede o áudio (MP3) da frase ao backend, que chama a ElevenLabs. Devolve
 * o blob pra quem chamou tocar. Lança BackendApiError se falhar — o
 * chamador (speakTextAI) trata isso caindo pra voz local. */
export async function synthesizeAiSpeech(
  text: string,
  voice: AiVoiceName,
): Promise<Blob> {
  const response = await fetch(`${getApiBaseUrl()}/tts/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text, voice }),
  })
  if (!response.ok) {
    throw new BackendApiError(response.status, await extractErrorMessage(response))
  }
  return response.blob()
}


// --- acompanhamento (dashboard clínico e portal do paciente) -------------

export type WordSeverity = 'critico' | 'moderado' | 'informativo'

export type PatientStats = {
  total_selections: number
  sessions: number
  /** null quando não houve seleção no período — não é zero, é "sem medida" */
  avg_confidence: number | null
  /** null com menos de duas seleções: não há intervalo a medir */
  avg_seconds_between_selections: number | null
  /** null quando nenhuma leitura do sensor chegou no período */
  avg_signal_quality: number | null
  period_start: string
  period_end: string
}

export type PatientAlert = {
  id: number
  session_id: number
  word_id: number
  utterance: string
  severity: WordSeverity
  confidence: number
  selected_at: string
  acknowledged_at: string | null
}

export type TimelineEntry = {
  id: number
  session_id: number
  utterance: string
  severity: WordSeverity
  confidence: number
  selected_at: string
}

export type ReadingPoint = {
  seq: number
  attention: number
  meditation: number
  signal_quality: number
  delta: number
  theta: number
  low_alpha: number
  high_alpha: number
  low_beta: number
  high_beta: number
  low_gamma: number
  mid_gamma: number
  at: string
}

// O período vai explícito porque "hoje" depende do fuso de quem olha a
// tela, e o servidor não tem como saber qual é.
export function getPatientStats(
  patientId: number,
  period: { start: Date; end: Date },
): Promise<PatientStats> {
  const params = new URLSearchParams({
    start: period.start.toISOString(),
    end: period.end.toISOString(),
  })
  return getJson(`/patients/${patientId}/stats?${params}`)
}

export function listPatientAlerts(
  patientId: number,
  options: { unacknowledgedOnly?: boolean; limit?: number } = {},
): Promise<{ items: PatientAlert[]; next_cursor: string | null; unacknowledged_count: number }> {
  const params = new URLSearchParams()
  if (options.unacknowledgedOnly) params.set('unacknowledged_only', 'true')
  if (options.limit) params.set('limit', String(options.limit))
  const query = params.toString()
  return getJson(`/patients/${patientId}/alerts${query ? `?${query}` : ''}`)
}

export function acknowledgeAlerts(
  patientId: number,
  payload: { selectionIds?: number[]; all?: boolean },
): Promise<{ acknowledged: number }> {
  return postJson(
    `/patients/${patientId}/alerts/acknowledge`,
    { selection_ids: payload.selectionIds ?? [], all: payload.all ?? false },
    true,
  )
}

export function getPatientTimeline(
  patientId: number,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ items: TimelineEntry[]; next_cursor: string | null }> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.cursor) params.set('cursor', options.cursor)
  const query = params.toString()
  return getJson(`/patients/${patientId}/timeline${query ? `?${query}` : ''}`)
}

export function getPatientReadings(patientId: number, limit = 120): Promise<ReadingPoint[]> {
  return getJson(`/patients/${patientId}/readings?limit=${limit}`)
}

// A grade é do PACIENTE, não da organização inteira (migração
// a1b2c3d4e5f6) — dois pacientes da mesma clínica já tinham histórico de
// seleção nas mesmas palavras compartilhadas antes disso, e editar a
// grade de um mudava a do outro junto. Clínico (mesma organização) e
// familiar vinculado podem ler e editar — authorize_patient_access cobre
// os dois papéis no backend.
export function listPatientWords(patientId: number): Promise<BackendWord[]> {
  return getJson(`/patients/${patientId}/words`)
}

export function createWord(
  patientId: number,
  text: string,
  severity: WordSeverity,
): Promise<BackendWord> {
  return postJson(`/patients/${patientId}/words`, { text, severity }, true)
}

export function reorderWords(patientId: number, orderedIds: number[]): Promise<BackendWord[]> {
  return putJson(`/patients/${patientId}/words/order`, { ordered_ids: orderedIds })
}

export async function deleteWord(patientId: number, wordId: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/patients/${patientId}/words/${wordId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new BackendApiError(response.status, await extractErrorMessage(response))
  }
}

export function updateWordSeverity(
  patientId: number,
  wordId: number,
  severity: WordSeverity,
): Promise<BackendWord> {
  return patchJson(`/patients/${patientId}/words/${wordId}`, { severity })
}

// Voz de IA usada quando a sessão ao vivo fala uma frase confirmada —
// clínico ou familiar vinculado podem mudar (mesma autorização das
// frases acima). null = volta a cair no fallback local de voz de cada
// navegador.
export function updatePatientVoice(
  patientId: number,
  voicePreference: AiVoiceName | null,
): Promise<BackendPatient> {
  return patchJson(`/patients/${patientId}/voice`, { voice_preference: voicePreference })
}

export type DecisionConfig = {
  scan_interval_seconds: number
  sustained_focus_windows: number
  focus_probability_threshold: number
  strong_blink_threshold: number
  confirmation_detections: number
  poor_signal_threshold: number
  uncertain_margin: number
  selection_cooldown_seconds: number
  highlight_settle_seconds: number
  focus_smoothing_alpha: number
  blink_contamination_threshold: number
}

export function getDecisionConfig(): Promise<DecisionConfig> {
  return getJson('/config/decision')
}

// --- acesso do familiar ---------------------------------------------------

export function listPatientCaregivers(patientId: number): Promise<BackendUser[]> {
  return getJson(`/patients/${patientId}/caregivers`)
}

export type CaregiverPasswordReset = {
  user_id: number
  email: string
  full_name: string
  /** devolvida UMA vez; o banco guarda só o hash */
  temporary_password: string
}

// Não há recuperação por e-mail (o backend não tem envio), então quem
// esquece a senha depende disto para voltar ao portal.
export function resetCaregiverPassword(
  patientId: number,
  caregiverUserId: number,
): Promise<CaregiverPasswordReset> {
  return postJson(
    `/patients/${patientId}/caregivers/${caregiverUserId}/reset-password`,
    {},
    true,
  )
}
