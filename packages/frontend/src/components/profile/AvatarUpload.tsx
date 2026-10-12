import { lazy, Suspense, useEffect, useReducer, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Point } from 'react-easy-crop'
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
import { UserApiError, userApi } from '@/lib/api/user'
import { AVATAR_MIN_ZOOM, renderAvatarCrop, type PixelArea } from '@/lib/avatarCrop'
import { cn } from '@/lib/utils'

// react-easy-crop only ships once a player has picked a file.
const AvatarCropStep = lazy(() => import('./AvatarCropStep'))

interface AvatarUploadProps {
  currentAvatarUrl?: string | null
  userName?: string | null
  userInitials: string
  onAvatarChange: (newAvatarUrl: string | null) => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const INITIAL_CROP: Point = { x: 0, y: 0 }

interface AvatarUploadState {
  open: boolean
  isUploading: boolean
  isDeleting: boolean
  error: string | null
  /** Object URL of the picked file, shown in the crop step. */
  source: string | null
  crop: Point
  zoom: number
  /** Latest crop, in natural image pixels, reported by the cropper. */
  cropArea: PixelArea | null
}

type AvatarUploadAction =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'reset' }
  | { type: 'error'; message: string }
  | { type: 'fileSelected'; source: string }
  | { type: 'cropChanged'; crop: Point }
  | { type: 'zoomChanged'; zoom: number }
  | { type: 'cropAreaChanged'; area: PixelArea }
  | { type: 'cropReset' }
  | { type: 'uploadStarted' }
  | { type: 'uploadFinished' }
  | { type: 'deleteStarted' }
  | { type: 'deleteFinished' }

const initialAvatarUploadState: AvatarUploadState = {
  open: false,
  isUploading: false,
  isDeleting: false,
  error: null,
  source: null,
  crop: INITIAL_CROP,
  zoom: AVATAR_MIN_ZOOM,
  cropArea: null,
}

// State cleared whenever the dialog closes or the user cancels a selection.
const clearedAvatarUploadState: Omit<AvatarUploadState, 'open'> = {
  isUploading: false,
  isDeleting: false,
  error: null,
  source: null,
  crop: INITIAL_CROP,
  zoom: AVATAR_MIN_ZOOM,
  cropArea: null,
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
        ...clearedAvatarUploadState,
        open: state.open,
        source: action.source,
      }
    case 'cropChanged':
      return { ...state, crop: action.crop }
    case 'zoomChanged':
      return { ...state, zoom: action.zoom }
    case 'cropAreaChanged':
      return { ...state, cropArea: action.area }
    case 'cropReset':
      return { ...state, crop: INITIAL_CROP, zoom: AVATAR_MIN_ZOOM }
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

const UPLOAD_ERROR_KEYS: Record<string, string> = {
  INVALID_IMAGE: 'profile.avatar.unreadableImage',
  INVALID_FILE_TYPE: 'profile.avatar.invalidType',
  FILE_TOO_LARGE: 'profile.avatar.fileTooLarge',
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
  const { open, isUploading, isDeleting, error, source, crop, zoom, cropArea } = state
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Release the object URL once it is no longer displayed.
  useEffect(() => {
    if (!source) return
    return () => URL.revokeObjectURL(source)
  }, [source])

  const resetState = useCallback(() => {
    dispatch({ type: 'reset' })
  }, [])

  const handleOpenChange = (isOpen: boolean) => {
    dispatch(isOpen ? { type: 'opened' } : { type: 'closed' })
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Allow picking the same file again after a cancel.
    event.target.value = ''
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

    dispatch({ type: 'fileSelected', source: URL.createObjectURL(file) })
  }

  const handleImageError = useCallback(() => {
    dispatch({ type: 'reset' })
    dispatch({ type: 'error', message: t('profile.avatar.unreadableImage') })
  }, [t])

  const handleUpload = async () => {
    if (!source || !cropArea) return

    dispatch({ type: 'uploadStarted' })

    try {
      const file = await renderAvatarCrop(source, cropArea)
      const updatedUser = await userApi.uploadAvatar(file)
      onAvatarChange(updatedUser.avatarUrl ?? null)
      dispatch({ type: 'closed' })
    } catch (err) {
      const key = err instanceof UserApiError ? UPLOAD_ERROR_KEYS[err.code] : undefined
      dispatch({
        type: 'error',
        message: t(key ?? 'profile.avatar.uploadError'),
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

  const isCropping = source !== null

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogTrigger asChild>
        <button
          type="button"
          className="relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full"
          aria-label={t('profile.avatar.change')}
        >
          <Avatar className="size-24 sm:size-32 border-4 border-primary/20 shadow-xl transition-colors duration-200 group-hover:border-primary/40">
            <AvatarImage
              src={currentAvatarUrl || undefined}
              alt={userName || 'User'}
            />
            <AvatarFallback className="text-2xl sm:text-3xl font-bold bg-linear-to-br from-primary/20 to-primary/5 text-primary">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <span
            className="absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md transition-transform motion-safe:group-hover:scale-110"
            aria-hidden="true"
          >
            <Camera className="size-4" />
          </span>
        </button>
      </ResponsiveDialogTrigger>

      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('profile.avatar.title')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {isCropping ? t('profile.avatar.cropDescription') : t('profile.avatar.description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col items-center gap-4 py-2 sm:py-4">
          {isCropping ? (
            <Suspense
              fallback={
                <div className="flex aspect-square w-full max-w-[min(20rem,42dvh)] items-center justify-center rounded-lg bg-muted">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">{t('common.loading')}</span>
                </div>
              }
            >
              <AvatarCropStep
                image={source}
                crop={crop}
                zoom={zoom}
                disabled={isUploading}
                onCropChange={(next) => dispatch({ type: 'cropChanged', crop: next })}
                onZoomChange={(next) => dispatch({ type: 'zoomChanged', zoom: next })}
                onCropAreaChange={(area) => dispatch({ type: 'cropAreaChanged', area })}
                onReset={() => dispatch({ type: 'cropReset' })}
                onChooseAnother={triggerFileInput}
                onImageError={handleImageError}
              />
            </Suspense>
          ) : (
            <>
              <Avatar className="size-28 sm:size-32 border-4 border-primary/20 shadow-xl">
                <AvatarImage
                  src={currentAvatarUrl || undefined}
                  alt={userName || 'User'}
                />
                <AvatarFallback className="text-3xl font-bold bg-linear-to-br from-primary/20 to-primary/5 text-primary">
                  {userInitials}
                </AvatarFallback>
              </Avatar>

              <Button
                type="button"
                variant="outline"
                onClick={triggerFileInput}
                disabled={isUploading || isDeleting}
                className="w-full"
              >
                <Upload aria-hidden="true" />
                {t('profile.avatar.selectImage')}
              </Button>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileSelect}
            className="hidden"
            aria-label={t('profile.avatar.selectFile')}
          />

          {error && (
            <p role="alert" className="text-sm text-destructive text-center">{error}</p>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {t('profile.avatar.sizeHint')}
          </p>
        </div>

        <ResponsiveDialogFooter className={cn(isCropping ? 'sm:justify-between' : '')}>
          {currentAvatarUrl && !isCropping && (
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

          {isCropping && (
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
                disabled={isUploading || !cropArea}
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
