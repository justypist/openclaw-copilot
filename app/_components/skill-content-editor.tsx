'use client'

import type { ReactNode, RefObject } from 'react'

import SelectionRewriteDialog from './selection-rewrite-dialog'

interface SkillContentEditorProps {
  title: string
  description: string
  value: string
  placeholder: string
  rows?: number
  textareaRef: RefObject<HTMLTextAreaElement | null>
  selection: {
    text: string
  } | null
  isSelectionRewriteDialogOpen: boolean
  selectionRewriteInstruction: string
  selectionRewritePreview: string | null
  selectionRewriteError: string
  isRewritingSelection: boolean
  selectionRewriteTitle: string
  selectionRewriteDescription: string
  selectionRewritePlaceholder: string
  selectionRewriteSubmitLabel: string
  selectionRewriteConfirmLabel: string
  selectionRewriteTriggerLabel: string
  onChange: (value: string) => void
  onSelectionChange: () => void
  onSelectionRewriteInstructionChange: (value: string) => void
  onSelectionRewritePreviewChange: (value: string) => void
  onOpenSelectionRewriteDialog: () => void
  onCloseSelectionRewriteDialog: () => void
  onRewriteSelection: () => void
  onApplyRewritePreview: () => void
  children?: ReactNode
}

export default function SkillContentEditor({
  title,
  description,
  value,
  placeholder,
  rows = 18,
  textareaRef,
  selection,
  isSelectionRewriteDialogOpen,
  selectionRewriteInstruction,
  selectionRewritePreview,
  selectionRewriteError,
  isRewritingSelection,
  selectionRewriteTitle,
  selectionRewriteDescription,
  selectionRewritePlaceholder,
  selectionRewriteSubmitLabel,
  selectionRewriteConfirmLabel,
  selectionRewriteTriggerLabel,
  onChange,
  onSelectionChange,
  onSelectionRewriteInstructionChange,
  onSelectionRewritePreviewChange,
  onOpenSelectionRewriteDialog,
  onCloseSelectionRewriteDialog,
  onRewriteSelection,
  onApplyRewritePreview,
  children,
}: SkillContentEditorProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium tracking-[-0.02em]">{title}</h3>
        <p className="text-sm text-neutral-600">{description}</p>
      </div>

      <div className="relative mt-5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onSelect={onSelectionChange}
          onKeyUp={onSelectionChange}
          onMouseUp={onSelectionChange}
          placeholder={placeholder}
          rows={rows}
          className="app-scrollbar min-h-80 w-full resize-y border border-black px-3 py-2 pr-14 font-mono text-xs leading-6 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
        />
        <SelectionRewriteDialog
          selection={selection}
          isOpen={isSelectionRewriteDialogOpen}
          instruction={selectionRewriteInstruction}
          replacementPreview={selectionRewritePreview}
          error={selectionRewriteError}
          isSubmitting={isRewritingSelection}
          title={selectionRewriteTitle}
          description={selectionRewriteDescription}
          placeholder={selectionRewritePlaceholder}
          submitLabel={selectionRewriteSubmitLabel}
          confirmLabel={selectionRewriteConfirmLabel}
          triggerLabel={selectionRewriteTriggerLabel}
          onInstructionChange={onSelectionRewriteInstructionChange}
          onReplacementPreviewChange={onSelectionRewritePreviewChange}
          onOpen={onOpenSelectionRewriteDialog}
          onClose={onCloseSelectionRewriteDialog}
          onSubmit={onRewriteSelection}
          onConfirmReplace={onApplyRewritePreview}
        />
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </>
  )
}
