import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

type AvatarImageProps = React.ComponentPropsWithoutRef<
    typeof AvatarPrimitive.Image
> & {
    ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Image>>
}

const AvatarImage = ({ className, ref, ...props }: AvatarImageProps) => (
    <AvatarPrimitive.Image
        ref={ref}
        data-slot="avatar-image"
        className={cn("aspect-square size-full", className)}
        {...props}
    />
)
AvatarImage.displayName = AvatarPrimitive.Image.displayName

export { AvatarImage }
