import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import "react-day-picker/style.css"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn(defaultClassNames.root, "bg-card"),
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium text-foreground",
        nav: "flex items-center gap-1",
        button_previous: cn(
          "absolute left-1 top-0",
          "inline-flex items-center justify-center rounded-md text-sm font-medium",
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          "hover:bg-muted text-foreground"
        ),
        button_next: cn(
          "absolute right-1 top-0",
          "inline-flex items-center justify-center rounded-md text-sm font-medium",
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          "hover:bg-muted text-foreground"
        ),
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: cn(
          "relative p-0 text-center text-sm",
          "focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-accent/50",
          "[&:has([aria-selected].day-outside)]:bg-accent/30",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md"
        ),
        day_button: cn(
          "inline-flex items-center justify-center rounded-md text-sm font-medium",
          "h-9 w-9 p-0 font-normal",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "aria-selected:opacity-100"
        ),
        range_start: "day-range-start rounded-l-md",
        range_end: "day-range-end rounded-r-md",
        selected: cn(
          "bg-gradient-to-r from-neon-purple to-neon-pink text-white",
          "hover:from-neon-purple hover:to-neon-pink hover:text-white",
          "focus:from-neon-purple focus:to-neon-pink focus:text-white",
          "rounded-md"
        ),
        today: "bg-accent text-accent-foreground rounded-md",
        outside: "text-muted-foreground/50 aria-selected:text-muted-foreground/70",
        disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight
          return <Icon className="h-4 w-4" />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
