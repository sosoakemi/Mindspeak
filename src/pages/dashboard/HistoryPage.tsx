import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Radio, SignalLow, SignalZero } from 'lucide-react'
import {
  getPatientTimeline,
  listPatientSessions,
  listSessionSignalInterruptions,
  type BackendSession,
  type SignalInterruption,
  type TimelineEntry,
} from '../../lib/backendApi'
import { useDashboard } from './dashboard-context'
import { Button } from '../../components/shared/Button'
import { formatDateTime, severityMeta } from '../../lib/severity'
import { msCardPad } from '../../lib/msStyles'
import { cn } from '../../lib/cn'

const PAGE_SIZE = 30
const SESSIONS_PAGE_SIZE = 10

const INTERRUPTION_LABEL: Record<SignalInterruption['kind'], string> = {
  sinal_ruim: 'Sinal ruim (eletrodo com mau contato)',
  esense_degenerado: 'Sensor recalculando atenção/meditação',
}

// Agrupa por dia para a linha do tempo não virar uma lista corrida de
// horários sem referência de data.
function dayLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
  } catch {
    return 'Data desconhecida'
  }
}

export function HistoryPage() {
  const { selectedPatient, patientsLoading } = useDashboard()
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patientId = selectedPatient?.id ?? null

  useEffect(() => {
    if (patientId === null) {
      setEntries([])
      setCursor(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getPatientTimeline(patientId, { limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return
        setEntries(page.items)
        setCursor(page.next_cursor)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar o histórico.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patientId])

  const loadMore = useCallback(async () => {
    if (patientId === null || cursor === null) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await getPatientTimeline(patientId, { limit: PAGE_SIZE, cursor })
      setEntries((prev) => [...prev, ...page.items])
      setCursor(page.next_cursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar mais itens.')
    } finally {
      setLoadingMore(false)
    }
  }, [patientId, cursor])

  const groups: { day: string; items: TimelineEntry[] }[] = []
  for (const entry of entries) {
    const day = dayLabel(entry.selected_at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(entry)
    else groups.push({ day, items: [entry] })
  }

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-emerald-950 dark:text-emerald-100 sm:text-2xl">
          Histórico
        </h1>
        <p className="mt-1 text-sm text-ms-secondary">
          {selectedPatient
            ? `Tudo que ${selectedPatient.display_name} falou, da fala mais recente para a mais antiga.`
            : patientsLoading
              ? 'Carregando…'
              : 'Nenhum paciente cadastrado.'}
        </p>
      </div>

      {error ? (
        <p
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className={msCardPad}>
        {loading ? (
          <p className="py-8 text-center text-sm text-ms-secondary">Carregando histórico…</p>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-ms-primary">Nada registrado ainda.</p>
            <p className="mt-1 text-sm text-ms-secondary">
              O histórico se enche conforme o paciente seleciona palavras numa sessão ao vivo.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.day}>
                <h2 className="text-sm font-semibold capitalize text-ms-primary">{group.day}</h2>
                <ol className="relative mt-5 space-y-6 border-l border-ms-border pl-6 sm:pl-8">
                  {group.items.map((entry) => {
                    const meta = severityMeta[entry.severity]
                    const Icon = meta.icon
                    return (
                      <li key={entry.id} className="relative min-w-0">
                        <span
                          className={cn(
                            'absolute -left-[31px] flex h-9 w-9 items-center justify-center rounded-full ring-2 sm:-left-[39px] sm:h-10 sm:w-10',
                            meta.badgeClass,
                          )}
                        >
                          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                        </span>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ms-muted">
                          {formatDateTime(entry.selected_at)}
                        </p>
                        <p className="mt-1 break-words text-base font-semibold text-ms-primary">
                          {entry.utterance}
                        </p>
                        <p className="mt-1 text-sm text-ms-secondary">
                          {meta.label} · {Math.round(entry.confidence * 100)}% de confiança · sessão{' '}
                          {entry.session_id}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}

            {cursor !== null ? (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={loadingMore}
                  onClick={() => void loadMore()}
                >
                  Carregar mais
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <SessionsSection patientId={patientId} patientSelected={selectedPatient !== null} />
    </div>
  )
}

const SESSION_STATUS_LABEL: Record<BackendSession['status'], string> = {
  active: 'Ativa',
  completed: 'Encerrada',
  cancelled: 'Cancelada',
}

type InterruptionCacheEntry =
  | { status: 'loading' }
  | { status: 'loaded'; items: SignalInterruption[] }
  | { status: 'error'; message: string }

// Sessões de uma única vez, com cache por sessão: expandir uma não deve
// recarregar nada já aberto, e expandir várias ao mesmo tempo não deve
// disparar corrida nenhuma entre elas.
function SessionRow({ session }: { session: BackendSession }) {
  const [cache, setCache] = useState<InterruptionCacheEntry | null>(null)

  const loadInterruptions = useCallback(() => {
    if (cache !== null) return
    setCache({ status: 'loading' })
    listSessionSignalInterruptions(session.id)
      .then((items) => setCache({ status: 'loaded', items }))
      .catch((err: unknown) =>
        setCache({
          status: 'error',
          message: err instanceof Error ? err.message : 'Falha ao carregar interrupções.',
        }),
      )
  }, [cache, session.id])

  return (
    <details
      className="group rounded-xl border border-ms-border-subtle bg-ms-surface"
      onToggle={(e) => {
        if (e.currentTarget.open) loadInterruptions()
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Radio
            className={cn(
              'h-4 w-4 shrink-0',
              session.status === 'active' ? 'text-emerald-600' : 'text-ms-muted',
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ms-primary">
              {session.external_session_id}
            </p>
            <p className="text-xs text-ms-muted">
              {formatDateTime(session.started_at)}
              {session.ended_at ? ` – ${formatDateTime(session.ended_at)}` : ' — em andamento'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-ms-subtle px-2.5 py-1 text-[11px] font-semibold text-ms-secondary">
            {SESSION_STATUS_LABEL[session.status]}
          </span>
          <ChevronDown
            className="h-4 w-4 text-ms-muted transition-transform group-open:rotate-180"
            aria-hidden
          />
        </div>
      </summary>

      <div className="border-t border-ms-border-subtle px-4 py-3">
        {cache === null || cache.status === 'loading' ? (
          <p className="text-sm text-ms-secondary">Carregando interrupções de sinal…</p>
        ) : cache.status === 'error' ? (
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {cache.message}
          </p>
        ) : cache.items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-ms-secondary">
            <SignalLow className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            Nenhuma interrupção de sinal registrada nesta sessão.
          </p>
        ) : (
          <ul className="space-y-2">
            {cache.items.map((episode, index) => (
              <li
                key={`${episode.started_at}-${index}`}
                className="flex items-start gap-3 rounded-lg bg-ms-subtle/70 px-3 py-2"
              >
                <SignalZero className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ms-primary">
                    {INTERRUPTION_LABEL[episode.kind]}
                  </p>
                  <p className="text-xs text-ms-muted">
                    {formatDateTime(episode.started_at)} · {episode.duration_seconds.toFixed(1)}s ·{' '}
                    {episode.missed_frames} leitura(s)
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-ms-muted">
          Só aparecem episódios que já se resolveram (com leitura boa depois) — um trecho ainda em
          curso no fim da sessão não tem como ter a duração medida.
        </p>
      </div>
    </details>
  )
}

function SessionsSection({
  patientId,
  patientSelected,
}: {
  patientId: number | null
  patientSelected: boolean
}) {
  const [sessions, setSessions] = useState<BackendSession[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (patientId === null) {
      setSessions([])
      setCursor(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    listPatientSessions(patientId, { limit: SESSIONS_PAGE_SIZE })
      .then((page) => {
        if (cancelled) return
        setSessions(page.items)
        setCursor(page.next_cursor)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar as sessões.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patientId])

  const loadMore = useCallback(async () => {
    if (patientId === null || cursor === null) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await listPatientSessions(patientId, { limit: SESSIONS_PAGE_SIZE, cursor })
      setSessions((prev) => [...prev, ...page.items])
      setCursor(page.next_cursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar mais sessões.')
    } finally {
      setLoadingMore(false)
    }
  }, [patientId, cursor])

  return (
    <section className={msCardPad}>
      <div>
        <h2 className="text-sm font-semibold text-ms-primary">Sessões</h2>
        <p className="mt-1 text-xs text-ms-muted">
          Abra uma sessão para ver se o sinal teve alguma interrupção — eletrodo com mau contato
          ou o sensor ainda recalculando atenção/meditação.
        </p>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="py-4 text-center text-sm text-ms-secondary">Carregando sessões…</p>
        ) : sessions.length === 0 ? (
          <p className="py-4 text-center text-sm text-ms-secondary">
            {patientSelected ? 'Nenhuma sessão registrada ainda.' : 'Nenhum paciente selecionado.'}
          </p>
        ) : (
          sessions.map((session) => <SessionRow key={session.id} session={session} />)
        )}
      </div>

      {cursor !== null ? (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={loadingMore}
            onClick={() => void loadMore()}
          >
            Carregar mais sessões
          </Button>
        </div>
      ) : null}
    </section>
  )
}
