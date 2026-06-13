import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export interface PasswordProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  showToggle?: boolean
  ref?: React.Ref<HTMLInputElement>
}

const Password = ({ className, showToggle = true, ref, ...props }: PasswordProps) => {
    const [showPassword, setShowPassword] = React.useState(false)
    const { t } = useTranslation()

    return (
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          data-slot="password"
          className={cn(
            "flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors duration-200",
            showToggle && "pr-10",
            className
          )}
          ref={ref}
          {...props}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? t("common.hidePassword") : t("common.showPassword")}
            aria-pressed={showPassword}
            className="absolute right-3 inset-y-0 my-auto flex h-fit items-center text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        )}
      </div>
    )
}

Password.displayName = "Password"

export { Password }
