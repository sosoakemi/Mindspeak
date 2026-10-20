import { useEffect, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2, Volume2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  createWord,
  deleteWord,
  listPatientWords,
  reorderWords,
  updateWordSeverity,
  type AiVoiceName,
  type BackendPatient,
  type BackendWord,
  type WordSeverity,
} from '../../lib/backendApi'
import { Button } from './Button'
import { VoicePreferenceControl } from './VoicePreferenceControl'
import { severityMeta } from '../../lib/severity'
import { isSpeechSupported, listPortugueseVoices, speakTextAI } from '../../lib/speech'

function SortableWordRow({
  word,
  onSeverityChange,
  onRemove,
  onSpeak,
  busy,
}: {
  word: BackendWord
  onSeverityChange: (id: number, severity: WordSeverity) => void
  onRemove: (id: number) => void
  onSpeak: (text: string) => void
  busy: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: word.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const meta = severityMeta[word.severity]

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-ms-border bg-ms-surface p-4 shadow-sm md:flex-row md:items-center md:gap-4',
        meta.rowClass,
        isDragging && 'z-10 opacity-90 ring-2 ring-green-300',
      )}
    >
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="secondary"
        size="sm"
        className="h-11 w-11 shrink-0 p-0"
        aria-label={`Arrastar ${word.text} para reordenar`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" aria-hidden />
      </Button>
      <div className="grid flex-1 gap-3 md:grid-cols-[2fr_1fr_auto] md:items-center">
        <p className="text-sm font-semibold text-ms-primary">{word.text}</p>
        <div>
          <label className="sr-only" htmlFor={`severity-${word.id}`}>
            Severidade de {word.text}
          </label>
          <select
            id={`severity-${word.id}`}
            value={word.severity}
            disabled={busy}
            onChange={(e) => onSeverityChange(word.id, e.target.value as WordSeverity)}
            className="w-full rounded-xl border border-ms-border bg-ms-subtle px-3 py-2 text-sm outline-none ring-green-600/20 focus:bg-ms-surface focus:ring-2 disabled:opacity-60"
          >
            <option value="critico">Crítico</option>
            <option value="moderado">Moderado</option>
            <option value="informativo">Informativo</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Volume2 className="h-4 w-4" aria-hidden />}
            onClick={() => onSpeak(word.text)}
          >
            Ouvir
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={busy}
            icon={<Trash2 className="h-4 w-4" aria-hidden />}
            onClick={() => onRemove(word.id)}
          >
            Remover
          </Button>
        </div>
      </div>
    </li>
  )
}

/**
 * Edição completa da grade de um paciente: adicionar, reordenar, mudar
 * severidade, remover, e a voz de IA da sessão ao vivo. Compartilhado
 * entre o portal clínico (PhrasesPage) e o portal familiar
 * (PatientPhrasesWorkspacePage) — os dois podem editar a mesma grade,
 * que agora é por paciente (Word.patient_id), não mais da organização
 * inteira.
 */
export function WordGradeEditor({ patient }: { patient: BackendPatient }) {
  const patientId = patient.id

  const [words, setWords] = useState<BackendWord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newText, setNewText] = useState('')

  const [voiceURI, setVoiceURI] = useState<string | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const speechSupported = isSpeechSupported()

  // Espelha patient.voice_preference localmente: nem todo chamador
  // recarrega o paciente sozinho depois de um PATCH aqui.
  const [voicePreference, setVoicePreference] = useState<AiVoiceName | null>(
    patient.voice_preference,
  )
  useEffect(() => {
    setVoicePreference(patient.voice_preference)
  }, [patient.id, patient.voice_preference])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listPatientWords(patientId)
      .then((list) => {
        if (!cancelled) setWords(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar as frases.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patientId])

  useEffect(() => {
    if (!speechSupported) return
    const loadVoices = () => setVoices(listPortugueseVoices())
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [speechSupported])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A operação falhou.')
    } finally {
      setBusy(false)
    }
  }

  // Reordena na tela primeiro e só então grava. Se o backend recusar, o
  // catch recarrega a lista real — a ordem na tela nunca fica divergindo
  // em silêncio da ordem que a grade do paciente vai usar.
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = words.findIndex((w) => w.id === active.id)
    const newIndex = words.findIndex((w) => w.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const optimistic = arrayMove(words, oldIndex, newIndex)
    setWords(optimistic)
    void run(async () => {
      try {
        setWords(await reorderWords(patientId, optimistic.map((w) => w.id)))
      } catch (err) {
        setWords(await listPatientWords(patientId))
        throw err
      }
    })
  }

  const onSeverityChange = (id: number, severity: WordSeverity) => {
    void run(async () => {
      const updated = await updateWordSeverity(patientId, id, severity)
      setWords((prev) => prev.map((w) => (w.id === id ? updated : w)))
    })
  }

  const onRemove = (id: number) => {
    void run(async () => {
      await deleteWord(patientId, id)
      setWords((prev) => prev.filter((w) => w.id !== id))
    })
  }

  const onAdd = () => {
    const text = newText.trim()
    if (!text) return
    void run(async () => {
      const created = await createWord(patientId, text, 'informativo')
      setWords((prev) => [...prev, created])
      setNewText('')
    })
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-ms-border bg-ms-surface p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="new-phrase" className="text-xs font-semibold uppercase tracking-wide text-ms-muted">
              Nova frase
            </label>
            <input
              id="new-phrase"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onAdd()
                }
              }}
              placeholder="Ex.: ESTOU COM FRIO"
              className="mt-2 w-full rounded-xl border border-ms-border bg-ms-subtle px-3 py-2 text-sm outline-none ring-green-600/20 focus:bg-ms-surface focus:ring-2"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={busy || newText.trim() === ''}
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={onAdd}
          >
            Adicionar
          </Button>
        </div>

        <div>
          <label htmlFor="voice" className="text-xs font-semibold uppercase tracking-wide text-ms-muted">
            Pré-visualização local (botão "Ouvir" nesta tela)
          </label>
          <select
            id="voice"
            value={voiceURI ?? ''}
            onChange={(e) => setVoiceURI(e.target.value || null)}
            disabled={!speechSupported || voices.length === 0}
            className="mt-2 w-full rounded-xl border border-ms-border bg-ms-subtle px-3 py-2 text-sm outline-none ring-green-600/20 focus:bg-ms-surface focus:ring-2 disabled:opacity-60 sm:max-w-md"
          >
            <option value="">Automática (melhor voz em português)</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          {!speechSupported ? (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
              Este navegador não suporta síntese de voz — "Ouvir" não vai funcionar aqui.
            </p>
          ) : null}
          <p className="mt-1 text-[11px] leading-snug text-ms-muted">
            Só afeta o botão "Ouvir" desta tela, neste navegador — não é a voz da sessão ao vivo
            (ver abaixo).
          </p>
        </div>

        <VoicePreferenceControl
          patientId={patient.id}
          value={voicePreference}
          onChange={setVoicePreference}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-ms-primary">
          Frases configuradas{words.length > 0 ? ` (${words.length})` : ''}
        </h2>

        {loading ? (
          <p className="rounded-2xl border border-ms-border bg-ms-surface p-8 text-center text-sm text-ms-secondary">
            Carregando frases…
          </p>
        ) : words.length === 0 ? (
          <p className="rounded-2xl border border-ms-border bg-ms-surface p-8 text-center text-sm text-ms-secondary">
            Nenhuma frase cadastrada. Sem vocabulário, a sessão ao vivo não tem o que varrer.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={words.map((w) => w.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {words.map((word) => (
                  <SortableWordRow
                    key={word.id}
                    word={word}
                    busy={busy}
                    onSeverityChange={onSeverityChange}
                    onRemove={onRemove}
                    onSpeak={(text) => void speakTextAI(text, { voiceURI })}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  )
}
