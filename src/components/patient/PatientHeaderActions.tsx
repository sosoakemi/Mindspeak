import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Settings, User } from 'lucide-react'
import { ThemeToggle } from '../shared/ThemeToggle'
import { PatientIconButton } from './PatientIconButton'
import { PatientProfileDialog } from './PatientProfileDialog'
import { FamilyAlertsBell } from './FamilyAlertsBell'

type PatientHeaderActionsProps = {
  // id do paciente (backend) pro sino de notificações — null oculta o
  // sino sem quebrar nada. Precisa vir por prop, não de
  // usePortalPatient() direto aqui dentro: este componente também é
  // usado por PatientPage.tsx (/patient/demo), uma tela OFFLINE sem
  // PortalPatientProvider por perto — chamar o hook de contexto ali
  // derrubaria a tela de demonstração.
  patientId?: number | null
}

/** Ações do header: notificações (se patientId vier), tema, perfil (modal) e configurações (rota). */
export function PatientHeaderActions({ patientId = null }: PatientHeaderActionsProps) {
  const nav = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)

  const onSettings = () => {
    nav('/patient/dashboard/configuracoes')
  }

  const settingsActive = location.pathname.endsWith('/configuracoes')

  return (
    <>
      <div className="flex flex-1 items-center justify-end gap-2">
        {patientId !== null ? <FamilyAlertsBell patientId={patientId} /> : null}
        <ThemeToggle size="compact" />
        <PatientIconButton
          aria-label="Abrir perfil do paciente"
          aria-haspopup="dialog"
          aria-expanded={profileOpen}
          pressed={profileOpen}
          onClick={() => setProfileOpen(true)}
        >
          <User className="h-5 w-5 text-ms-secondary" aria-hidden />
        </PatientIconButton>
        <PatientIconButton
          aria-label="Configurações"
          aria-current={settingsActive ? 'page' : undefined}
          pressed={settingsActive}
          onClick={onSettings}
        >
          <Settings className="h-5 w-5 text-ms-secondary" aria-hidden />
        </PatientIconButton>
      </div>
      <PatientProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  )
}
