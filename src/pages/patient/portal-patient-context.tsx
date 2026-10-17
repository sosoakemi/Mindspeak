import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { usePatientSelection, type PatientSelection } from '../../hooks/usePatientSelection'

// O portal familiar guarda na sessão o id do USUÁRIO logado, que não é o
// id do paciente — são tabelas diferentes no backend. Para saber de quem
// mostrar os dados é preciso perguntar: GET /patients devolve, para um
// cuidador, só os pacientes atribuídos a ele.
//
// Um cuidador pode responder por mais de uma pessoa (um filho e um pai,
// por exemplo). Antes a tela pegava o primeiro da lista em silêncio, o
// que mostraria o histórico da pessoa errada sem nenhum aviso. Agora a
// escolha é explícita e fica lembrada entre visitas — ver
// hooks/usePatientSelection, que carrega essa lógica (compartilhada com
// o portal clínico, ver dashboard-context.tsx).
const SELECTED_KEY = 'mindspeak_portal_patient'

type Ctx = {
  patient: PatientSelection['selectedPatient']
  patients: PatientSelection['patients']
  selectPatient: PatientSelection['selectPatient']
  loading: boolean
  error: string | null
}

const PortalPatientCtx = createContext<Ctx | null>(null)

export function PortalPatientProvider({ children }: { children: ReactNode }) {
  const { patients, selectedPatient, selectPatient, loading, error } =
    usePatientSelection(SELECTED_KEY)

  const value = useMemo<Ctx>(
    () => ({ patient: selectedPatient, patients, selectPatient, loading, error }),
    [selectedPatient, patients, selectPatient, loading, error],
  )

  return <PortalPatientCtx.Provider value={value}>{children}</PortalPatientCtx.Provider>
}

export function usePortalPatient() {
  const value = useContext(PortalPatientCtx)
  if (!value) throw new Error('usePortalPatient precisa estar dentro de PortalPatientProvider')
  return value
}
