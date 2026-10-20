import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '../../lib/cn'
import { listPatientAlerts, type PatientAlert } from '../../lib/backendApi'
import { severityMeta, formatDateTime } from '../../lib/severity'
import { PatientIconButton } from './PatientIconButton'

// A cada quantos segundos o portal familiar reconsulta os alertas em
// segundo plano. Não é WebSocket (alertas não são um evento "ao vivo" no
// sentido da sessão de comunicação — podem nascer de qualquer sessão,
// mesmo depois de encerrada), mas também não pode depender só de abrir a
// tela de novo: um responsável pode deixar o portal aberto o dia inteiro.
const POLL_INTERVAL_MS = 30_000

/**
 * Sino de notificações do portal familiar — mesma fonte de dado que a
 * Central de Alertas do portal clínico (GET /patients/{id}/alerts), só
 * que *somente leitura*: o backend já recusa o cuidador dando baixa
 * (authorize_patient_access permite ler, acknowledge_alerts exige
 * clinician/admin — ver app/api/rest/dashboard.py). Quem resolve o
 * alerta é sempre a equipe clínica; a família só precisa SABER que uma
 * frase crítica ou moderada foi dita.
 */
export function FamilyAlertsBell({ patientId }: { patientId: number | null }) {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<PatientAlert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (patientId === null) {
      setAlerts([])
      setUnreadCount(0)
      return
    }
    let cancelled = false

    function load() {
      setLoading(true)
      setError(null)
      listPatientAlerts(patientId as number, { limit: 10, unacknowledgedOnly: true })
        .then((page) => {
          if (cancelled) return
          setAlerts(page.items)
          setUnreadCount(page.unacknowledged_count)
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar notificações.')
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [patientId])

  const hasUnread = unreadCount > 0

  return (
    <div className="relative">
      <PatientIconButton
        aria-label={hasUnread ? `Notificações (${unreadCount} não vistas)` : 'Notificações'}
        aria-haspopup="dialog"
        aria-expanded={open}
        pressed={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="relative inline-flex">
          <Bell className="h-5 w-5 text-ms-secondary" aria-hidden />
          {hasUnread ? (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </span>
      </PatientIconButton>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30"
            aria-label="Fechar notificações"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Notificações"
            className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-ms-border bg-ms-surface shadow-lg"
          >
            <div className="border-b border-ms-border-subtle px-4 py-3">
              <p className="text-sm font-semibold text-ms-primary">Notificações</p>
              <p className="text-xs text-ms-secondary">
                Frases críticas ou moderadas ditas recentemente. A equipe clínica cuida do
                acompanhamento.
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading && alerts.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ms-secondary">Carregando…</p>
              ) : error ? (
                <p className="px-4 py-6 text-center text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
              ) : alerts.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ms-secondary">
                  Nenhuma notificação por enquanto.
                </p>
              ) : (
                <ul className="divide-y divide-ms-border-subtle">
                  {alerts.map((alert) => {
                    const meta = severityMeta[alert.severity]
                    const Icon = meta.icon
                    return (
                      <li key={alert.id} className={cn('flex items-start gap-3 px-4 py-3', meta.rowClass)}>
                        <span
                          className={cn(
                            'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1',
                            meta.badgeClass,
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ms-primary">{alert.utterance}</p>
                          <p className="text-xs text-ms-muted">
                            {meta.label} · {formatDateTime(alert.selected_at)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
