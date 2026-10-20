import { Info } from 'lucide-react'
import { WordGradeEditor } from '../../../components/shared/WordGradeEditor'
import { usePortalPatient } from '../portal-patient-context'

// Antes esta tela era só leitura: as palavras pertenciam à ORGANIZAÇÃO
// (Word.organization_id), então um familiar editando aqui mudaria a
// grade de todos os pacientes da clínica de uma vez. Agora as palavras
// são por paciente (Word.patient_id) e a mesma edição completa do portal
// clínico (ver WordGradeEditor, compartilhado com PhrasesPage.tsx) vale
// aqui — o familiar pode adicionar, remover, reordenar, mudar a
// severidade e a voz da sessão ao vivo.
export function PatientPhrasesWorkspacePage() {
  const { patient, loading, error } = usePortalPatient()

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ms-primary sm:text-2xl">
          Frases da grade
        </h1>
        <p className="mt-1 text-sm text-ms-secondary">
          As frases que aparecem na varredura, na ordem em que são destacadas.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-ms-subtle p-4 ring-1 ring-ms-border-subtle">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-ms-muted" aria-hidden />
        <p className="text-sm leading-relaxed text-ms-secondary">
          Você pode adicionar, remover, reordenar e mudar a urgência das frases, e também a voz
          da sessão ao vivo. As mudanças valem pra sessão de verdade, em qualquer aparelho — a
          mesma grade que a equipe clínica vê e também pode ajustar.
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

      {loading ? (
        <p className="rounded-2xl border border-ms-border bg-ms-surface p-8 text-center text-sm text-ms-secondary">
          Carregando…
        </p>
      ) : patient ? (
        <WordGradeEditor patient={patient} />
      ) : null}
    </div>
  )
}
