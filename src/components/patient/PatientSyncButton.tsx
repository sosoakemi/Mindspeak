import { CheckCircle2, Wifi, WifiOff } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../shared/Button'
import { usePatientSync } from '../../hooks/usePatientSync'

type PatientSyncButtonProps = {
  fullWidth?: boolean
  className?: string
}

export function PatientSyncButton({ fullWidth = true, className }: PatientSyncButtonProps) {
  const { sync, isSyncing, status, errorMessage, backendReachable } = usePatientSync()

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        type="button"
        variant="primary"
        fullWidth={fullWidth}
        isLoading={isSyncing}
        icon={
          status === 'success' ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          ) : backendReachable ? (
            <Wifi className="h-4 w-4" aria-hidden />
          ) : (
            <WifiOff className="h-4 w-4" aria-hidden />
          )
        }
        onClick={() => void sync()}
        aria-describedby={errorMessage ? 'sync-error' : undefined}
      >
        {isSyncing ? 'Sincronizando…' : status === 'success' ? 'Sincronizado' : 'Sincronizar'}
      </Button>
      {/* "Sincronizado" só confirma que o backend está alcançável — nunca
          que o sensor físico está ligado. Sem esta linha, quem vê o check
          verde pode achar que o sensor já está pronto, mesmo desligado da
          tomada (aconteceu de verdade em teste). */}
      <p className="text-[11px] leading-snug text-ms-muted">
        Confirma que o backend está acessível — não que o sensor físico está ligado.
      </p>
      {errorMessage ? (
        <p id="sync-error" className="text-xs text-red-600 dark:text-red-400" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
