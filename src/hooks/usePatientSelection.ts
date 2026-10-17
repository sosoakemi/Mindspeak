import { useEffect, useMemo, useState } from 'react'
import { listPatients, type BackendPatient } from '../lib/backendApi'

// Lógica compartilhada por dashboard-context.tsx (clínico) e
// portal-patient-context.tsx (familiar): carregar a lista de pacientes
// que o usuário logado pode ver, lembrar qual está selecionado entre
// visitas (localStorage, por chave própria de cada portal — os dois
// nunca devem compartilhar a MESMA chave, senão escolher um paciente no
// portal clínico mudaria silenciosamente o que o portal familiar mostra
// na próxima visita), e cair no primeiro da lista quando não há escolha
// salva ou ela aponta pra alguém que saiu da lista (vínculo removido) —
// nunca deixar a tela vazia sem explicação.
//
// Extraído depois dos dois contextos terem convergido pra exatamente a
// mesma lógica de seleção, cada um com seu próprio bug corrigido em
// momentos diferentes — risco real de corrigir um e esquecer o outro.

function readStoredId(storageKey: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) ? parsed : null
  } catch {
    return null
  }
}

function storeId(storageKey: string, id: number | null) {
  try {
    if (id === null) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, String(id))
  } catch {
    // modo privado / cota cheia: a escolha só não sobrevive ao reload.
  }
}

export type PatientSelection = {
  patients: BackendPatient[]
  selectedPatient: BackendPatient | null
  selectPatient: (id: number) => void
  loading: boolean
  error: string | null
}

export function usePatientSelection(storageKey: string): PatientSelection {
  const [patients, setPatients] = useState<BackendPatient[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(() => readStoredId(storageKey))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPatients()
      .then((list) => {
        if (cancelled) return
        setPatients(list)
        setSelectedId((current) => {
          if (current !== null && list.some((p) => p.id === current)) return current
          return list[0]?.id ?? null
        })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar pacientes.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // storageKey não entra nas deps de propósito: é fixo pela vida do
    // componente (cada portal usa a sua própria chamada do hook), trocar
    // em runtime não é um caso suportado.
  }, [])

  useEffect(() => {
    storeId(storageKey, selectedId)
  }, [selectedId])

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedId) ?? null,
    [patients, selectedId],
  )

  return { patients, selectedPatient, selectPatient: setSelectedId, loading, error }
}
