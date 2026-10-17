import { KeyRound, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { Reveal } from '../Reveal'

// Reflete o fluxo real das telas (src/pages/access/AccessSelectionPage.tsx
// e src/pages/auth/**) — não um roteiro de design antigo. Revisado em
// 17/10/2026: a versão anterior descrevia campos que nunca existiram no
// formulário real (ex.: "ID Profissional (CRM/COREN)" no login, "Cargo" e
// "Registro Profissional (CRM/CRP)" no cadastro, "cadastro do paciente"
// como 2ª etapa do cadastro familiar) — confundiria quem seguisse este
// guia pra valer.
const portals = [
  {
    id: 'clinico',
    title: 'Portal Clínico',
    audience: 'Profissionais de saúde',
    icon: ShieldCheck,
    steps: [
      'Na página inicial, clique em "Login" e escolha "Portal Clínico".',
      'Informe seu e-mail e senha e clique em "Próximo passo" para entrar.',
      'Sem conta ainda? Clique em "Criar conta" para se cadastrar.',
    ],
    signup: {
      title: 'Cadastro clínico',
      fields: ['Nome completo', 'Instituição', 'E-mail profissional', 'Senha'],
      note: 'Depois de preencher os dados, confirme os termos de uso para concluir o cadastro.',
    },
  },
  {
    id: 'familiar',
    title: 'Portal Familiar',
    audience: 'Responsáveis e familiares',
    icon: Users,
    steps: [
      'Na página inicial, clique em "Login" e escolha "Portal Familiar".',
      'Informe e-mail e senha e clique em "Próximo passo" para entrar.',
      'Sem conta ainda? Clique em "Criar conta" para se cadastrar.',
    ],
    signup: {
      title: 'Cadastro familiar',
      fields: ['Nome completo', 'E-mail', 'Senha'],
      note: 'Depois de preencher os dados, confirme os termos de uso para concluir o cadastro. O vínculo com o paciente é feito pelo profissional clínico responsável, pelo Portal Clínico.',
    },
  },
]

export default function AccessGuide() {
  return (
    <section id="acesso" className="bg-white px-6 py-16 lg:px-8 lg:py-24 dark:bg-[#020617]">
      <div className="mx-auto max-w-5xl">
        <Reveal className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-500">
            Primeiro acesso
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl dark:text-white">
            Como acessar o sistema
          </h2>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
            Escolha o portal certo na tela de login: clínico para profissionais
            de saúde, familiar para responsáveis e pacientes.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {portals.map((portal, index) => {
            const Icon = portal.icon
            return (
              <Reveal key={portal.id} delay={index * 100}>
                <article className="h-full rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-[#111827]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-bold text-navy-900 dark:text-white">
                        {portal.title}
                      </h3>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {portal.audience}
                      </p>
                    </div>
                  </div>

                  <ol className="mt-6 space-y-3">
                    {portal.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-[11px] font-semibold text-teal-600 dark:bg-teal-500/10 dark:text-teal-300">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>

                  <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0a1628]">
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-teal-500" strokeWidth={1.75} />
                      <p className="text-sm font-semibold text-navy-900 dark:text-white">
                        {portal.signup.title}
                      </p>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {portal.signup.fields.map((field) => (
                        <li key={field} className="text-xs text-slate-500 dark:text-slate-400">
                          • {field}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-start gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                      <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      <p className="text-xs text-slate-500 dark:text-slate-400">{portal.signup.note}</p>
                    </div>
                  </div>
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
