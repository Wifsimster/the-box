import { useReducer, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Upload, Trash2, Loader2 } from 'lucide-react'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { userApi } from '@/lib/api/user'
import { cn } from '@/lib/utils'

interface AvatarUploadProps {
  currentAvatarUrl?: string | null
  userName?: string | null
  userInitials: string
  onAvatarChange: (newAvatarUrl: string | null) => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

interface AvatarUploadState {
  open: boolean
  isUploading: boolean
  isDeleting: boolean
  error: string | null
  preview: string | null
  selectedFile: File | null
}

type AvatarUploadAction =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'reset' }
  | { type: 'error'; message: string }
  | { type: 'fileSelected'; file: File; preview: string }
  | { type: 'previewReady'; preview: string }
  | { type: 'uploadStarted' }
  | { type: 'uploadFinished' }
  | { type: 'deleteStarted' }
  | { type: 'deleteFinished' }

const initialAvatarUploadState: AvatarUploadState = {
  open: false,
  isUploading: false,
  isDeleting: false,
  error: null,
  preview: null,
  selectedFile: null,
}

// State cleared whenever the dialog closes or the user cancels a selection.
const clearedAvatarUploadState: Omit<AvatarUploadState, 'open'> = {
  isUploading: false,
  isDeleting: false,
  error: null,
  preview: null,
  selectedFile: null,
}

function avatarUploadReducer(
  state: AvatarUploadState,
  action: AvatarUploadAction,
): AvatarUploadState {
  switch (action.type) {
    case 'opened':
      return { ...state, open: true }
    case 'closed':
      return { ...clearedAvatarUploadState, open: false }
    case 'reset':
      return { ...clearedAvatarUploadState, open: state.open }
    case 'error':
      return {
        ...state,
        error: action.message,
        isUploading: false,
        isDeleting: false,
      }
    case 'fileSelected':
      return {
        ...state,
        error: null,
        selectedFile: action.file,
        preview: action.preview,
      }
    case 'previewReady':
      return { ...state, preview: action.preview }
    case 'uploadStarted':
      return { ...state, isUploading: true, error: null }
    case 'uploadFinished':
      return { ...state, isUploading: false }
    case 'deleteStarted':
      return { ...state, isDeleting: true, error: null }
    case 'deleteFinished':
      return { ...state, isDeleting: false }
    default:
      return state
  }
}

export function AvatarUpload({
  currentAvatarUrl,
  userName,
  userInitials,
  onAvatarChange,
}: AvatarUploadProps) {
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(
    avatarUploadReducer,
    initialAvatarUploadState,
  )
  const { open, isUploading, isDeleting, error, preview, selectedFile } = state
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    dispatch({ type: 'reset' })
  }, [])

  const handleOpenChange = (isOpen: boolean) => {
    dispatch(isOpen ? { type: 'opened' } : { type: 'closed' })
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      dispatch({ type: 'error', message: t('profile.avatar.invalidType') })
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      dispatch({ type: 'error', message: t('profile.avatar.fileTooLarge') })
      return
    }

    // Create preview, then record the selection once it's ready.
    const reader = new FileReader()
    reader.onload = (e) => {
      dispatch({
        type: 'fileSelected',
        file,
        preview: e.target?.result as string,
      })
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    dispatch({ type: 'uploadStarted' })

    try {
      const updatedUser = await userApi.uploadAvatar(selectedFile)
      onAvatarChange(updatedUser.avatarUrl ?? null)
      dispatch({ type: 'closed' })
    } catch (err) {
      dispatch({
        type: 'error',
        message: err instanceof Error ? err.message : t('profile.avatar.uploadError'),
      })
    } finally {
      dispatch({ type: 'uploadFinished' })
    }
  }

  const handleDelete = async () => {
    dispatch({ type: 'deleteStarted' })

    try {
      await userApi.deleteAvatar()
      onAvatarChange(null)
      dispatch({ type: 'closed' })
    } catch (err) {
      dispatch({
        type: 'error',
        message: err instanceof Error ? err.message : t('profile.avatar.deleteError'),
      })
    } finally {
      dispatch({ type: 'deleteFinished' })
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const displayAvatar = preview || currentAvatarUrl

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogTrigger asChild>
        <button
          type="button"
          className="relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full"
          aria-label={t('profile.avatar.change')}
        >
          <Avatar className="size-32 border-4 border-primary/20 shadow-xl transition-all duration-200 group-hover:border-primary/40">
            <AvatarImage
              src={displayAvatar || undefined}
              alt={userName || 'User'}
            />
            <AvatarFallback className="text-3xl font-bold bg-linear-to-br from-primary/20 to-primary/5 text-primary">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Camera className="size-8 text-white" />
          </div>
        </button>
      </ResponsiveDialogTrigger>

      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('profile.avatar.title')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('profile.avatar.description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {/* Preview Avatar */}
          <Avatar className="size-32 border-4 border-primary/20 shadow-xl">
            <AvatarImage
              src={displayAvatar || undefined}
              alt={userName || 'User'}
            />
            <AvatarFallback className="text-3xl font-bold bg-linear-to-br from-primary/20 to-primary/5 text-primary">
              {userInitials}
            </AvatarFallback>
          </Avatar>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileSelect}
            className="hidden"
            aria-label={t('profile.avatar.selectFile')}
          />

          {/* Upload button */}
          <Button
            type="button"
            variant="outline"
            onClick={triggerFileInput}
            disabled={isUploading || isDeleting}
            className="w-full"
          >
            <Upload className="size-4 mr-2" />
            {t('profile.avatar.selectImage')}
          </Button>

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {/* File size hint */}
          <p className="text-xs text-muted-foreground text-center">
            {t('profile.avatar.sizeHint')}
          </p>
        </div>

        <ResponsiveDialogFooter className={cn(selectedFile ? 'sm:justify-between' : '')}>
          {currentAvatarUrl && !selectedFile && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || isUploading}
              className="w-full sm:w-auto"
            >
              {isDeleting ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="size-4 mr-2" />
              )}
              {t('profile.avatar.remove')}
            </Button>
          )}

          {selectedFile && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={resetState}
                disabled={isUploading}
                className="w-full sm:w-auto"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full sm:w-auto"
              >
                {isUploading ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="size-4 mr-2" />
                )}
                {t('profile.avatar.upload')}
              </Button>
            </>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
