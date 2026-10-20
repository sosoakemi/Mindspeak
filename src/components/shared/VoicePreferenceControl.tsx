import { useState } from 'react'
import { updatePatientVoice, type AiVoiceName } from '../../lib/backendApi'

/**
 * Voz de IA usada quando a sessão ao vivo fala uma frase confirmada.
 * Compartilhado entre o portal clínico (PhrasesPage) e o portal familiar
 * (PatientPhrasesWorkspacePage) — a mesma escolha precisa valer pros
 * dois, já que ficam em aparelhos diferentes e a sessão real fala numa
 * voz só (ver patients.voice_preference no backend).
 *
 * Diferente da voz LOCAL de cada navegador (Web Speech API, usada só
 * pelo botão "Ouvir" de pré-visualização nesta tela): aquela nunca é a
 * mesma entre dois aparelhos, então não faz sentido como escolha
 * compartilhada — só a voz de IA (ElevenLabs) é portátil.
 */
export function VoicePreferenceControl({
  patientId,
  value,
  onChange,
}: {
  patientId: number
  value: AiVoiceName | null
  onChange: (next: AiVoiceName | null) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (next: string) => {
    const nextValue = (next || null) as AiVoiceName | null
    setSaving(true)
    setError(null)
    updatePatientVoice(patientId, nextValue)
      .then((updated) => onChange(updated.voice_preference))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Falha ao salvar a voz.')
      })
      .finally(() => setSaving(false))
  }

  return (
    <div>
      <label
        htmlFor="voice-preference"
        className="text-xs font-semibold uppercase tracking-wide text-ms-muted"
      >
        Voz da sessão ao vivo
      </label>
      <select
        id="voice-preference"
        value={value ?? ''}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-ms-border bg-ms-subtle px-3 py-2 text-sm outline-none ring-green-600/20 focus:bg-ms-surface focus:ring-2 disabled:opacity-60 sm:max-w-md"
      >
        <option value="">Automática (voz local de cada aparelho)</option>
        <option value="feminina">Feminina (IA)</option>
        <option value="masculina">Masculina (IA)</option>
      </select>
      <p className="mt-1 text-[11px] leading-snug text-ms-muted">
        Vale pra sessão ao vivo de verdade, em qualquer aparelho conectado — clínico e familiar
        veem e podem mudar a mesma escolha.
      </p>
      {error ? (
        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
