'use client'

interface SelectionRewriteDialogProps {
  selection: {
    text: string
  } | null
  isOpen: boolean
  instruction: string
  replacementPreview: string | null
  error: string
  isSubmitting: boolean
  title: string
  description: string
  placeholder: string
  submitLabel: string
  confirmLabel: string
  triggerLabel: string
  onInstructionChange: (value: string) => void
  onReplacementPreviewChange: (value: string) => void
  onOpen: () => void
  onClose: () => void
  onSubmit: () => void
  onConfirmReplace: () => void
}

export default function SelectionRewriteDialog({
  selection,
  isOpen,
  instruction,
  replacementPreview,
  error,
  isSubmitting,
  title,
  description,
  placeholder,
  submitLabel,
  confirmLabel,
  triggerLabel,
  onInstructionChange,
  onReplacementPreviewChange,
  onOpen,
  onClose,
  onSubmit,
  onConfirmReplace,
}: SelectionRewriteDialogProps) {
  if (!selection) {
    return null
  }

  function handleClose() {
    if (isSubmitting) {
      return
    }

    onClose()
  }

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpen}
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center border border-black bg-white text-black shadow-[4px_4px_0_0_#000] transition-colors hover:bg-neutral-100"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3v6" strokeLinecap="round" />
            <path d="M12 15v6" strokeLinecap="round" />
            <path d="M4.93 4.93l4.24 4.24" strokeLinecap="round" />
            <path d="M14.83 14.83l4.24 4.24" strokeLinecap="round" />
            <path d="M3 12h6" strokeLinecap="round" />
            <path d="M15 12h6" strokeLinecap="round" />
            <path d="M4.93 19.07l4.24-4.24" strokeLinecap="round" />
            <path d="M14.83 9.17l4.24-4.24" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={handleClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            aria-busy={isSubmitting}
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
                onClick={handleClose}
                disabled={isSubmitting}
                className="shrink-0 border border-black px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
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
                disabled={isSubmitting}
                className="app-scrollbar min-h-28 w-full resize-y border border-black px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
              />
            </label>

            {replacementPreview !== null ? (
              <label className="mt-5 grid gap-2 text-sm">
                <span className="font-medium">优化预览</span>
                <textarea
                  value={replacementPreview}
                  onChange={(event) => onReplacementPreviewChange(event.target.value)}
                  rows={10}
                  disabled={isSubmitting}
                  className="app-scrollbar min-h-44 w-full resize-y border border-black px-3 py-2 font-mono text-xs leading-6 outline-none transition-colors focus:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
                />
                <span className="text-xs text-neutral-500">确认前可继续手动编辑这段替换内容。</span>
              </label>
            ) : null}

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
              {replacementPreview !== null ? (
                <button
                  type="button"
                  onClick={onConfirmReplace}
                  disabled={isSubmitting}
                  className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                >
                  {confirmLabel}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
