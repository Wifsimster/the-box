import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Upload, Trash2, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function AvatarUpload({
  currentAvatarUrl,
  userName,
  userInitials,
  onAvatarChange,
}: AvatarUploadProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setError(null)
    setPreview(null)
    setSelectedFile(null)
    setIsUploading(false)
    setIsDeleting(false)
  }, [])

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      resetState()
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('profile.avatar.invalidType'))
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(t('profile.avatar.fileTooLarge'))
      return
    }

    setSelectedFile(file)

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setError(null)

    try {
      const updatedUser = await userApi.uploadAvatar(selectedFile)
      onAvatarChange(updatedUser.avatarUrl ?? null)
      setOpen(false)
      resetState()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.avatar.uploadError'))
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      await userApi.deleteAvatar()
      onAvatarChange(null)
      setOpen(false)
      resetState()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.avatar.deleteError'))
    } finally {
      setIsDeleting(false)
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const displayAvatar = preview || currentAvatarUrl

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full"
          aria-label={t('profile.avatar.change')}
        >
          <Avatar className="h-32 w-32 border-4 border-primary/20 shadow-xl transition-all duration-200 group-hover:border-primary/40">
            <AvatarImage
              src={displayAvatar || undefined}
              alt={userName || 'User'}
            />
            <AvatarFallback className="text-3xl font-bold bg-linear-to-br from-primary/20 to-primary/5 text-primary">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Camera className="h-8 w-8 text-white" />
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('profile.avatar.title')}</DialogTitle>
          <DialogDescription>
            {t('profile.avatar.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {/* Preview Avatar */}
          <Avatar className="h-32 w-32 border-4 border-primary/20 shadow-xl">
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
            <Upload className="h-4 w-4 mr-2" />
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

        <DialogFooter className={cn('gap-2', selectedFile ? 'sm:justify-between' : '')}>
          {currentAvatarUrl && !selectedFile && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || isUploading}
              className="w-full sm:w-auto"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {t('profile.avatar.upload')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
