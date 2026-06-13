import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"
import { AvatarImage } from "./avatar-image"
import { AvatarFallback } from "./avatar-fallback"

type AvatarProps = React.ComponentPropsWithoutRef<
    typeof AvatarPrimitive.Root
> & {
    ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Root>>
}

const Avatar = ({ className, ref, ...props }: AvatarProps) => (
    <AvatarPrimitive.Root
        ref={ref}
        data-slot="avatar"
        className={cn(
            "relative flex size-10 shrink-0 overflow-hidden rounded-full",
            className
        )}
        {...props}
    />
)
Avatar.displayName = AvatarPrimitive.Root.displayName

export { Avatar, AvatarImage, AvatarFallback }
