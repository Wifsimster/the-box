import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

type AvatarFallbackProps = React.ComponentPropsWithoutRef<
    typeof AvatarPrimitive.Fallback
> & {
    ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Fallback>>
}

const AvatarFallback = ({ className, ref, ...props }: AvatarFallbackProps) => (
    <AvatarPrimitive.Fallback
        ref={ref}
        data-slot="avatar-fallback"
        className={cn(
            "flex size-full items-center justify-center rounded-full bg-muted",
            className
        )}
        {...props}
    />
)
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { AvatarFallback }
