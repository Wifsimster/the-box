import { useState } from "react"
import { format, type Locale } from "date-fns"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value: Date
  onChange: (date: Date) => void
  minDate?: Date
  maxDate?: Date
  formatStr?: string
  locale?: Locale
  className?: string
  disabled?: boolean
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  formatStr = "PPP",
  locale,
  className,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  const handlePrevDay = () => {
    const prev = new Date(value)
    prev.setDate(prev.getDate() - 1)
    if (!minDate || prev >= minDate) {
      onChange(prev)
    }
  }

  const handleNextDay = () => {
    const next = new Date(value)
    next.setDate(next.getDate() + 1)
    if (!maxDate || next <= maxDate) {
      onChange(next)
    }
  }

  const isPrevDisabled = minDate ? value <= minDate : false
  const isNextDisabled = maxDate ? value >= maxDate : false

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevDay}
        disabled={disabled || isPrevDisabled}
        // 44px (Apple HIG / WCAG 2.5.5) on a phone, where these day/month
        // steppers are the leaderboard's most-tapped control; back to the
        // compact 36px from `sm` up.
        className="size-11 sm:size-9"
      >
        <ChevronLeft className="size-4" />
        <span className="sr-only">Previous day</span>
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              // `min-w-0 flex-1` below `sm` so the trigger gives way to the
              // enlarged steppers instead of pushing the row past a 320px
              // screen; the 200px floor returns once there is room for it.
              "min-h-11 min-w-0 flex-1 justify-start gap-2 text-left font-normal sm:min-h-10 sm:min-w-[200px] sm:flex-none",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="size-4 text-neon-purple" />
            {value ? format(value, formatStr, { locale }) : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => {
              if (date) {
                onChange(date)
                setOpen(false)
              }
            }}
            disabled={(date) => {
              if (maxDate && date > maxDate) return true
              if (minDate && date < minDate) return true
              return false
            }}
            defaultMonth={value}
            locale={locale}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNextDay}
        disabled={disabled || isNextDisabled}
        // 44px (Apple HIG / WCAG 2.5.5) on a phone, where these day/month
        // steppers are the leaderboard's most-tapped control; back to the
        // compact 36px from `sm` up.
        className="size-11 sm:size-9"
      >
        <ChevronRight className="size-4" />
        <span className="sr-only">Next day</span>
      </Button>
    </div>
  )
}
