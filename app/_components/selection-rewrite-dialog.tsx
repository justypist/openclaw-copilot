'use client'

interface SelectionRewriteDialogProps {
  selection: {
    text: string
  } | null
  instruction: string
  error: string
  isSubmitting: boolean
  title: string
  description: string
  placeholder: string
  submitLabel: string
  onInstructionChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

export default function SelectionRewriteDialog({
  selection,
  instruction,
  error,
  isSubmitting,
  title,
  description,
  placeholder,
  submitLabel,
  onInstructionChange,
  onClose,
  onSubmit,
}: SelectionRewriteDialogProps) {
  if (!selection) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="app-scrollbar max-h-full w-full max-w-3xl overflow-y-auto border border-black bg-white p-4 shadow-[8px_8px_0_0_#000] sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium tracking-[-0.02em]">{title}</h3>
            <p className="mt-2 text-sm text-neutral-600">{description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-black px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100"
          >
            关闭
          </button>
        </div>

        <div className="mt-5 border border-black bg-neutral-50 p-3">
          <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            <span>selected</span>
            <span>{selection.text.length} chars</span>
          </div>
          <pre className="app-scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-black">
            {selection.text}
          </pre>
        </div>

        <label className="mt-5 grid gap-2 text-sm">
          <span className="font-medium">修改意见</span>
          <textarea
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            placeholder={placeholder}
            rows={5}
            autoFocus
            className="app-scrollbar min-h-28 w-full resize-y border border-black px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
          />
        </label>

        {error ? (
          <div className="mt-4 border border-black bg-neutral-50 px-3 py-2 text-sm text-black">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
          >
            {isSubmitting ? 'Rewriting...' : submitLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
