import { WordGradeEditor } from '../../components/shared/WordGradeEditor'
import { useDashboard } from './dashboard-context'

export function PhrasesPage() {
  const { selectedPatient } = useDashboard()

  if (!selectedPatient) {
    return (
      <div className="min-w-0">
        <p className="rounded-2xl border border-ms-border bg-ms-surface p-8 text-center text-sm text-ms-secondary">
          Selecione um paciente no topo da página pra ver e editar a grade dele.
        </p>
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-emerald-950 dark:text-emerald-100">
          Frases da grade
        </h1>
        <p className="mt-1 text-sm text-ms-secondary">
          A grade de <strong className="text-ms-primary">{selectedPatient.display_name}</strong>{' '}
          que ele vê na varredura. A ordem define quanto tempo ele espera até a frase ser
          destacada; a severidade decide o que vira alerta. Clínico e familiar vinculado podem
          editar.
        </p>
      </div>

      <WordGradeEditor patient={selectedPatient} />
    </div>
  )
}
