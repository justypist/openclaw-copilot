'use client'

import { useState, type RefObject } from 'react'

import type { SkillFileDraft } from '@/lib/skills'

import SkillContentEditor from './skill-content-editor'

interface SkillContentSelection {
  text: string
}

interface SkillDraftFilesEditorProps {
  files: SkillFileDraft[]
  selectedFilePath: string
  title: string
  description: string
  placeholder: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  selection: SkillContentSelection | null
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
  onFilesChange: (files: SkillFileDraft[], selectedFilePath: string) => void
  onSelectionChange: () => void
  onSelectionRewriteInstructionChange: (value: string) => void
  onSelectionRewritePreviewChange: (value: string) => void
  onOpenSelectionRewriteDialog: () => void
  onCloseSelectionRewriteDialog: () => void
  onRewriteSelection: () => void
  onApplyRewritePreview: () => void
}

function sortSkillFiles(files: SkillFileDraft[]): SkillFileDraft[] {
  return [...files].sort((left, right) => {
    if (left.path === 'SKILL.md') {
      return -1
    }

    if (right.path === 'SKILL.md') {
      return 1
    }

    return left.path.localeCompare(right.path)
  })
}

function formatFileSize(content: string): string {
  const size = new TextEncoder().encode(content).byteLength

  if (size < 1024) {
    return `${size} B`
  }

  return `${(size / 1024).toFixed(1)} KB`
}

function getValidatedSkillFilePath(value: string, existingPaths: string[], currentPath?: string):
  | {
      ok: true
      path: string
    }
  | {
      ok: false
      error: string
    } {
  const path = value.trim().replace(/\\/g, '/')

  if (!path || path === '.' || path.startsWith('/')) {
    return { ok: false, error: '请输入合法的相对文件路径。' }
  }

  if (path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    return { ok: false, error: '文件路径不能包含空段、. 或 ..。' }
  }

  if (path !== currentPath && existingPaths.includes(path)) {
    return { ok: false, error: `文件已存在：${path}` }
  }

  return { ok: true, path }
}

function getSelectedFile(files: SkillFileDraft[], selectedFilePath: string): SkillFileDraft {
  return files.find((file) => file.path === selectedFilePath) ?? files[0] ?? { path: 'SKILL.md', content: '' }
}

export default function SkillDraftFilesEditor({
  files,
  selectedFilePath,
  title,
  description,
  placeholder,
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
  onFilesChange,
  onSelectionChange,
  onSelectionRewriteInstructionChange,
  onSelectionRewritePreviewChange,
  onOpenSelectionRewriteDialog,
  onCloseSelectionRewriteDialog,
  onRewriteSelection,
  onApplyRewritePreview,
}: SkillDraftFilesEditorProps) {
  const [isAddingFile, setIsAddingFile] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const [renamingFilePath, setRenamingFilePath] = useState('')
  const [renameFilePath, setRenameFilePath] = useState('')
  const [confirmingDeleteFilePath, setConfirmingDeleteFilePath] = useState('')
  const [fileDraftError, setFileDraftError] = useState('')
  const sortedFiles = sortSkillFiles(files.length > 0 ? files : [{ path: 'SKILL.md', content: '' }])
  const selectedFile = getSelectedFile(sortedFiles, selectedFilePath)

  function updateFiles(nextFiles: SkillFileDraft[], nextSelectedFilePath: string) {
    onFilesChange(sortSkillFiles(nextFiles), nextSelectedFilePath)
  }

  function handleSelectFile(path: string) {
    setConfirmingDeleteFilePath('')
    onFilesChange(sortedFiles, path)
  }

  function handleContentChange(value: string) {
    const nextFiles = sortedFiles.map((file) => (
      file.path === selectedFile.path
        ? { ...file, content: value }
        : file
    ))

    updateFiles(nextFiles, selectedFile.path)
  }

  function handleStartAddFile() {
    setFileDraftError('')
    setIsAddingFile(true)
    setNewFilePath('')
  }

  function handleCancelAddFile() {
    setIsAddingFile(false)
    setNewFilePath('')
    setFileDraftError('')
  }

  function handleAddFileFromInput() {
    const pathResult = getValidatedSkillFilePath(newFilePath, sortedFiles.map((file) => file.path))

    if (!pathResult.ok) {
      setFileDraftError(pathResult.error)
      return
    }

    updateFiles([...sortedFiles, { path: pathResult.path, content: '' }], pathResult.path)
    setIsAddingFile(false)
    setNewFilePath('')
    setFileDraftError('')
  }

  function handleStartRenameFile(path: string) {
    setRenamingFilePath(path)
    setRenameFilePath(path)
    setConfirmingDeleteFilePath('')
    setFileDraftError('')
  }

  function handleCancelRenameFile() {
    setRenamingFilePath('')
    setRenameFilePath('')
    setFileDraftError('')
  }

  function handleRenameFileFromInput() {
    const targetFile = sortedFiles.find((file) => file.path === renamingFilePath)

    if (!targetFile) {
      handleCancelRenameFile()
      return
    }

    const pathResult = getValidatedSkillFilePath(renameFilePath, sortedFiles.map((file) => file.path), targetFile.path)

    if (!pathResult.ok) {
      setFileDraftError(pathResult.error)
      return
    }

    const nextFiles = sortedFiles.map((file) => (
      file.path === targetFile.path
        ? { ...file, path: pathResult.path }
        : file
    ))
    const nextSelectedFilePath = selectedFile.path === targetFile.path ? pathResult.path : selectedFile.path

    updateFiles(nextFiles, nextSelectedFilePath)
    setRenamingFilePath('')
    setRenameFilePath('')
    setFileDraftError('')
  }

  function handleConfirmDeleteFile(path: string) {
    if (confirmingDeleteFilePath !== path) {
      setConfirmingDeleteFilePath(path)
      return
    }

    const nextFiles = sortedFiles.filter((file) => file.path !== path)

    if (nextFiles.length === 0) {
      setFileDraftError('至少需要保留一个文件。')
      return
    }

    const nextSelectedFilePath = selectedFile.path === path ? (nextFiles.find((file) => file.path === 'SKILL.md') ?? nextFiles[0]).path : selectedFile.path

    updateFiles(nextFiles, nextSelectedFilePath)
    setConfirmingDeleteFilePath('')
    setFileDraftError('')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
      <div className="border border-black bg-neutral-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium">Files</h4>
            <p className="mt-1 text-xs text-neutral-600">编辑最终 skill 目录中的多个文本文件。</p>
          </div>
          <span className="text-xs text-neutral-500">{sortedFiles.length} files</span>
        </div>

        <div className="mt-3 grid gap-2">
          {isAddingFile ? (
            <input
              type="text"
              value={newFilePath}
              onChange={(event) => setNewFilePath(event.target.value)}
              onBlur={handleAddFileFromInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddFileFromInput()
                }

                if (event.key === 'Escape') {
                  handleCancelAddFile()
                }
              }}
              placeholder="docs/reference.md"
              autoFocus
              className="min-h-[58px] border border-black bg-white p-2 font-mono text-xs outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
            />
          ) : (
            <button
              type="button"
              onClick={handleStartAddFile}
              className="grid min-h-[58px] gap-1 border border-dashed border-black bg-white p-2 text-left text-xs transition-colors hover:bg-neutral-100"
            >
              <span className="font-mono">+ 新增文件</span>
              <span className="text-neutral-500">输入路径后回车或失焦创建</span>
            </button>
          )}

          {sortedFiles.map((file) => {
            const isSelected = file.path === selectedFile.path
            const isConfirmingDelete = confirmingDeleteFilePath === file.path
            const isRenaming = renamingFilePath === file.path

            return (
              <div
                key={file.path}
                className={[
                  'group flex items-stretch gap-2 border p-2 text-xs transition-colors',
                  isSelected ? 'border-black bg-black text-white' : 'border-black bg-white text-black hover:bg-neutral-100',
                ].join(' ')}
              >
                {isRenaming ? (
                  <input
                    type="text"
                    value={renameFilePath}
                    onChange={(event) => setRenameFilePath(event.target.value)}
                    onBlur={handleRenameFileFromInput}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleRenameFileFromInput()
                      }

                      if (event.key === 'Escape') {
                        handleCancelRenameFile()
                      }
                    }}
                    autoFocus
                    className="min-w-0 flex-1 border border-black bg-white px-2 py-1.5 font-mono text-xs text-black outline-none transition-colors focus:bg-neutral-50"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSelectFile(file.path)}
                      className="grid min-w-0 flex-1 gap-1 text-left"
                    >
                      <span className="break-all font-mono">{file.path}</span>
                      <span className={isSelected ? 'text-neutral-300' : 'text-neutral-500'}>{formatFileSize(file.content)}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleStartRenameFile(file.path)
                        }}
                        className={[
                          'border px-2 py-1 transition-colors opacity-0 group-hover:opacity-100',
                          isSelected ? 'border-white text-white hover:bg-neutral-800' : 'border-black text-black hover:bg-neutral-200',
                        ].join(' ')}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleConfirmDeleteFile(file.path)
                        }}
                        className={[
                          'border px-2 py-1 transition-colors',
                          isConfirmingDelete
                            ? 'border-red-600 bg-red-600 text-white opacity-100 hover:bg-red-700'
                            : isSelected
                              ? 'border-white text-white opacity-0 hover:bg-neutral-800 group-hover:opacity-100'
                              : 'border-black text-black opacity-0 hover:bg-neutral-200 group-hover:opacity-100',
                        ].join(' ')}
                      >
                        {isConfirmingDelete ? '确认删除？' : '删除'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {fileDraftError ? <div className="mt-3 border border-black bg-white px-2 py-1.5 text-xs text-black">{fileDraftError}</div> : null}
      </div>

      <div className="border border-black bg-white p-4 sm:p-5">
        <SkillContentEditor
          title={`${title}: ${selectedFile.path}`}
          description={description}
          value={selectedFile.content}
          placeholder={placeholder || `${selectedFile.path} 内容会显示在这里。`}
          textareaRef={textareaRef}
          selection={selection}
          isSelectionRewriteDialogOpen={isSelectionRewriteDialogOpen}
          selectionRewriteInstruction={selectionRewriteInstruction}
          selectionRewritePreview={selectionRewritePreview}
          selectionRewriteError={selectionRewriteError}
          isRewritingSelection={isRewritingSelection}
          selectionRewriteTitle={selectionRewriteTitle}
          selectionRewriteDescription={selectionRewriteDescription}
          selectionRewritePlaceholder={selectionRewritePlaceholder}
          selectionRewriteSubmitLabel={selectionRewriteSubmitLabel}
          selectionRewriteConfirmLabel={selectionRewriteConfirmLabel}
          selectionRewriteTriggerLabel={selectionRewriteTriggerLabel}
          onChange={handleContentChange}
          onSelectionChange={onSelectionChange}
          onSelectionRewriteInstructionChange={onSelectionRewriteInstructionChange}
          onSelectionRewritePreviewChange={onSelectionRewritePreviewChange}
          onOpenSelectionRewriteDialog={onOpenSelectionRewriteDialog}
          onCloseSelectionRewriteDialog={onCloseSelectionRewriteDialog}
          onRewriteSelection={onRewriteSelection}
          onApplyRewritePreview={onApplyRewritePreview}
        />
      </div>
    </div>
  )
}
