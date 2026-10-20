import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { User } from 'lucide-react'
import { Button, LinkButton } from '../shared/Button'
import { getPatientSession } from '../../lib/patientSession'
import { usePatientSync } from '../../hooks/usePatientSync'

type PatientProfileDialogProps = {
  open: boolean
  onClose: () => void
}

export function PatientProfileDialog({ open, onClose }: PatientProfileDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const session = getPatientSession()
  const { formatLastSync, backendReachable } = usePatientSync()

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  const connectedLabel = session?.connectedAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(session.connectedAt),
      )
    : '—'

  return (
    <dialog
      ref={dialogRef}
      className="ms-modal-panel max-h-[min(90dvh,32rem)] w-full overflow-y-auto backdrop:bg-black/50"
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="patient-profile-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-white">
            <User className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h2 id="patient-profile-title" className="text-lg font-semibold text-ms-primary">
              Perfil do paciente
            </h2>
            <p className="text-sm text-ms-secondary">{session?.patientName ?? 'Paciente'}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onClose} aria-label="Fechar">
          ✕
        </Button>
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex justify-between gap-4 border-b border-ms-border-subtle pb-3">
          <dt className="text-ms-muted">ID</dt>
          <dd className="text-right font-medium text-ms-primary">{session?.patientId ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-ms-border-subtle pb-3">
          <dt className="text-ms-muted">Login nesta sessão</dt>
          <dd className="text-right font-medium text-ms-primary">{connectedLabel}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-ms-border-subtle pb-3">
          <dt className="text-ms-muted">Último sync</dt>
          <dd className="text-right font-medium text-ms-primary">{formatLastSync()}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ms-muted">Backend</dt>
          <dd className="text-right font-semibold text-ms-primary">
            {backendReachable ? (
              <span className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                Acessível
              </span>
            ) : (
              <span className="text-ms-muted">Não verificado</span>
            )}
          </dd>
        </div>
      </dl>
      {/* O sensor físico não aparece aqui de propósito: nada que roda no
          navegador tem como saber se ele está ligado — só se o backend
          responde. Qualidade de sinal de verdade só existe DURANTE uma
          sessão ao vivo, na própria tela de comunicação. */}
      <p className="mt-2 text-[11px] leading-snug text-ms-muted">
        "Backend acessível" não significa que o sensor está ligado — a qualidade do sinal
        aparece na tela de Comunicação enquanto a sessão ao vivo estiver rodando.
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <LinkButton to="/patient/dashboard/palavras" variant="secondary" fullWidth onClick={onClose}>
          Editar frases da grade
        </LinkButton>
        <Button type="button" variant="primary" fullWidth onClick={onClose}>
          Fechar
        </Button>
      </div>
      <p className="mt-4 text-center text-xs text-ms-muted">
        Dúvidas? Acesse{' '}
        <Link to="/patient/dashboard/suporte" className="font-medium text-green-700 underline-offset-2 hover:underline dark:text-ms-accent-muted" onClick={onClose}>
          Central de Suporte
        </Link>
      </p>
    </dialog>
  )
}
