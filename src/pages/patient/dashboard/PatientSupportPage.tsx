import { ChevronDown, LifeBuoy } from 'lucide-react'
import { getPatientSession } from '../../../lib/patientSession'
import { usePatientSync } from '../../../hooks/usePatientSync'
import { msCardPad } from '../../../lib/msStyles'

const FAQ = [
  {
    q: 'Como funciona o sistema?',
    a: 'O MindSpeak lê sinais do seu cérebro com um sensor na testa e destaca palavras na tela. Mantendo o foco na palavra desejada, o sistema confirma e pode falar por você.',
  },
  {
    q: 'O que fazer se o sensor não conectar?',
    a: 'Confira se o cabo USB do sensor está bem conectado ao computador e se o adaptador está com a luz acesa. O profissional responsável pode verificar a porta serial no backend. Se persistir, peça ajuda ao seu profissional.',
  },
  {
    q: 'Como melhorar a precisão?',
    a: 'Reduza ruído visual, mantenha-se confortável e pratique olhar com calma para a palavra certa até ouvir o feedback de confirmação.',
  },
  {
    q: 'Como alterar minhas frases?',
    a: 'No menu lateral, abra “Frases da grade” para editar, reordenar e salvar as oito frases usadas na comunicação.',
  },
] as const

// Esta página tinha um formulário de "solicitação de suporte" que não
// enviava nada: esperava 1,6s, sorteava uma falha em 5% dos casos e dizia
// "Sua mensagem foi registrada. A equipe clínica entrará em contato". Não
// há canal de suporte no backend, então quem escrevesse ficaria esperando
// um retorno que nunca viria. Trocado por orientação real: falar com o
// profissional responsável, levando os dados do dispositivo logo abaixo.
export function PatientSupportPage() {
  const { formatLastSync, backendReachable } = usePatientSync()
  const session = getPatientSession()

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ms-primary sm:text-2xl">Central de Suporte</h1>
        <p className="mt-1 text-sm text-ms-secondary">Recursos e informações para o uso seguro do MindSpeak.</p>
      </div>

      <section className={msCardPad}>
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ms-subtle">
            <LifeBuoy className="h-5 w-5 text-ms-accent" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ms-primary">Precisa de ajuda?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ms-secondary">
              Fale com o profissional de saúde responsável pelo acompanhamento.
              Ao descrever o problema, informe os dados do dispositivo que estão
              no final desta página — eles ajudam a identificar a causa mais
              rápido.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ms-secondary">
              Antes disso, vale conferir o FAQ abaixo: ele cobre as dúvidas mais
              comuns, inclusive sensor que não conecta.
            </p>
          </div>
        </div>
      </section>

      <section className={msCardPad}>
        <h2 className="text-lg font-semibold text-ms-primary">FAQ</h2>
        <div className="mt-4 divide-y divide-ms-border-subtle">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-ms-primary marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  {item.q}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-ms-muted transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ms-secondary">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={msCardPad}>
        <h2 className="text-lg font-semibold text-ms-primary">Informações do dispositivo</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-ms-border-subtle pb-3">
            <dt className="text-ms-muted">Paciente</dt>
            <dd className="text-right font-medium text-ms-primary">{session?.patientName ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ms-border-subtle pb-3">
            <dt className="text-ms-muted">Sensor</dt>
            <dd className="text-right font-medium text-ms-primary">TGAM NeuroSky</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ms-border-subtle pb-3">
            <dt className="text-ms-muted">Backend</dt>
            <dd className="text-right font-medium text-ms-primary">
              {backendReachable ? 'Acessível' : 'Não verificado'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ms-muted">Último sync</dt>
            <dd className="text-right font-medium text-ms-primary">{formatLastSync()}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ms-muted">
          "Backend" aqui é só o servidor que recebe os dados — não informa se o sensor está
          fisicamente ligado ao computador. Quem confirma isso é o profissional responsável,
          olhando o computador onde o sensor está conectado.
        </p>
      </section>
    </div>
  )
}
