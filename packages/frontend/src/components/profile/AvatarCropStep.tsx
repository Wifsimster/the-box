import Cropper, { type Area, type Point } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'
import { ImageUp, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  AVATAR_ZOOM_STEP,
  clampAvatarZoom,
  type PixelArea,
} from '@/lib/avatarCrop'

interface AvatarCropStepProps {
  image: string
  crop: Point
  zoom: number
  disabled: boolean
  onCropChange: (crop: Point) => void
  onZoomChange: (zoom: number) => void
  onCropAreaChange: (area: PixelArea) => void
  onReset: () => void
  onChooseAnother: () => void
  onImageError: () => void
}

/** Pixels the image moves per arrow-key press (Shift: a fifth of that). */
const KEYBOARD_STEP = 10

/**
 * Square crop area with a round mask: drag (or arrow keys) to pan, slider,
 * wheel or pinch to zoom. Loaded lazily so react-easy-crop only ships when a
 * player actually picks a file.
 */
export default function AvatarCropStep({
  image,
  crop,
  zoom,
  disabled,
  onCropChange,
  onZoomChange,
  onCropAreaChange,
  onReset,
  onChooseAnother,
  onImageError,
}: AvatarCropStepProps) {
  const { t } = useTranslation()
  const zoomPercent = Math.round(zoom * 100)

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* touch-action and overscroll keep a drag inside the crop area from
          scrolling the bottom sheet on phones. */}
      <div className="relative aspect-square w-full max-w-[min(20rem,42dvh)] touch-none overscroll-contain overflow-hidden rounded-lg bg-muted">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          minZoom={AVATAR_MIN_ZOOM}
          maxZoom={AVATAR_MAX_ZOOM}
          aspect={1}
          cropShape="round"
          showGrid={false}
          objectFit="cover"
          keyboardStep={KEYBOARD_STEP}
          onCropChange={disabled ? () => {} : onCropChange}
          onZoomChange={disabled ? undefined : (value) => onZoomChange(clampAvatarZoom(value))}
          onCropComplete={(_area: Area, areaPixels: Area) => onCropAreaChange(areaPixels)}
          mediaProps={{ onError: onImageError }}
          // No className in cropperProps: it is spread last and would drop the
          // library's own crop-area class (and with it the round mask).
          classes={{
            cropAreaClassName: 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          }}
          cropperProps={{
            role: 'group',
            'aria-label': t('profile.avatar.cropArea'),
            'aria-roledescription': t('profile.avatar.cropAreaRole'),
          }}
        />
      </div>

      <div className="flex w-full max-w-xs items-center gap-3">
        <ZoomOut className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="avatar-zoom" className="sr-only">
          {t('profile.avatar.zoom')}
        </label>
        <input
          id="avatar-zoom"
          type="range"
          min={AVATAR_MIN_ZOOM}
          max={AVATAR_MAX_ZOOM}
          step={AVATAR_ZOOM_STEP}
          value={zoom}
          disabled={disabled}
          aria-valuetext={t('profile.avatar.zoomValue', { value: zoomPercent })}
          onChange={(event) => onZoomChange(clampAvatarZoom(Number(event.target.value)))}
          className="h-11 w-full min-w-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={disabled}>
          <RotateCcw aria-hidden="true" />
          {t('profile.avatar.reset')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onChooseAnother} disabled={disabled}>
          <ImageUp aria-hidden="true" />
          {t('profile.avatar.chooseAnother')}
        </Button>
      </div>
    </div>
  )
}
