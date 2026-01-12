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
        className="h-9 w-9"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous day</span>
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "min-w-[200px] justify-start gap-2 text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-4 w-4 text-neon-purple" />
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
        className="h-9 w-9"
      >
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next day</span>
      </Button>
    </div>
  )
}
