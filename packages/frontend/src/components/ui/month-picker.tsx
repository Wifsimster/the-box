import { useState } from "react"
import { format, setMonth, setYear, type Locale } from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "./button"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { cn } from "@/lib/utils"

interface MonthPickerProps {
  value: Date
  onChange: (date: Date) => void
  minDate?: Date
  maxDate?: Date
  locale?: Locale
  className?: string
  disabled?: boolean
}

const MONTHS = [
  { value: 0, labelKey: "Jan" },
  { value: 1, labelKey: "Feb" },
  { value: 2, labelKey: "Mar" },
  { value: 3, labelKey: "Apr" },
  { value: 4, labelKey: "May" },
  { value: 5, labelKey: "Jun" },
  { value: 6, labelKey: "Jul" },
  { value: 7, labelKey: "Aug" },
  { value: 8, labelKey: "Sep" },
  { value: 9, labelKey: "Oct" },
  { value: 10, labelKey: "Nov" },
  { value: 11, labelKey: "Dec" },
]

export function MonthPicker({
  value,
  onChange,
  minDate,
  maxDate,
  locale,
  className,
  disabled = false,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(value.getFullYear())

  const handlePrevMonth = () => {
    const prev = new Date(value)
    prev.setMonth(prev.getMonth() - 1)
    if (!minDate || prev >= new Date(minDate.getFullYear(), minDate.getMonth(), 1)) {
      onChange(prev)
    }
  }

  const handleNextMonth = () => {
    const next = new Date(value)
    next.setMonth(next.getMonth() + 1)
    const maxMonthDate = maxDate ? new Date(maxDate.getFullYear(), maxDate.getMonth(), 1) : null
    if (!maxMonthDate || next <= maxMonthDate) {
      onChange(next)
    }
  }

  const isPrevDisabled = minDate
    ? value.getFullYear() <= minDate.getFullYear() && value.getMonth() <= minDate.getMonth()
    : false
  const isNextDisabled = maxDate
    ? value.getFullYear() >= maxDate.getFullYear() && value.getMonth() >= maxDate.getMonth()
    : false

  const isMonthDisabled = (monthIndex: number) => {
    const monthDate = new Date(viewYear, monthIndex, 1)
    if (maxDate) {
      const maxMonthDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)
      if (monthDate > maxMonthDate) return true
    }
    if (minDate) {
      const minMonthDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
      if (monthDate < minMonthDate) return true
    }
    return false
  }

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(viewYear, monthIndex, 1)
    onChange(newDate)
    setOpen(false)
  }

  const handlePrevYear = () => {
    setViewYear(viewYear - 1)
  }

  const handleNextYear = () => {
    if (!maxDate || viewYear < maxDate.getFullYear()) {
      setViewYear(viewYear + 1)
    }
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevMonth}
        disabled={disabled || isPrevDisabled}
        className="h-9 w-9"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous month</span>
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
            <CalendarDays className="h-4 w-4 text-neon-purple" />
            {value ? format(value, "MMMM yyyy", { locale }) : <span>Pick a month</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="center">
          <div className="flex flex-col gap-4">
            {/* Year selector */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevYear}
                className="h-7 w-7"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold">{viewYear}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextYear}
                disabled={maxDate && viewYear >= maxDate.getFullYear()}
                className="h-7 w-7"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((month) => {
                const isSelected =
                  value.getMonth() === month.value && value.getFullYear() === viewYear
                const isDisabled = isMonthDisabled(month.value)

                return (
                  <Button
                    key={month.value}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    disabled={isDisabled}
                    onClick={() => handleMonthSelect(month.value)}
                    className={cn(
                      "h-9",
                      isSelected && "bg-primary text-primary-foreground"
                    )}
                  >
                    {format(new Date(2000, month.value, 1), "MMM", { locale })}
                  </Button>
                )
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNextMonth}
        disabled={disabled || isNextDisabled}
        className="h-9 w-9"
      >
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next month</span>
      </Button>
    </div>
  )
}
