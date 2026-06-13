import * as React from "react"
import { use, useMemo, useEffectEvent } from "react"
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

type CarouselProps = {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: "horizontal" | "vertical"
  setApi?: (api: CarouselApi) => void
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = use(CarouselContext)

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />")
  }

  return context
}

type CarouselComponentProps = React.HTMLAttributes<HTMLDivElement> &
  CarouselProps & {
    ref?: React.Ref<HTMLDivElement>
  }

const Carousel = (
  {
    orientation = "horizontal",
    opts,
    setApi,
    plugins,
    className,
    children,
    ref,
    ...props
  }: CarouselComponentProps
) => {
    const [carouselRef, api] = useEmblaCarousel(
      {
        ...opts,
        axis: orientation === "horizontal" ? "x" : "y",
      },
      plugins
    )
    const [canScrollPrev, setCanScrollPrev] = React.useState(false)
    const [canScrollNext, setCanScrollNext] = React.useState(false)

    const onSelect = useEffectEvent((api: CarouselApi) => {
      if (!api) {
        return
      }

      setCanScrollPrev(api.canScrollPrev())
      setCanScrollNext(api.canScrollNext())
    })

    const scrollPrev = React.useCallback(() => {
      api?.scrollPrev()
    }, [api])

    const scrollNext = React.useCallback(() => {
      api?.scrollNext()
    }, [api])

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          scrollPrev()
        } else if (event.key === "ArrowRight") {
          event.preventDefault()
          scrollNext()
        }
      },
      [scrollPrev, scrollNext]
    )

    const emitApi = useEffectEvent((api: CarouselApi) => {
      setApi?.(api)
    })

    // Expose the embla instance to the parent via the public `setApi` prop —
    // this is shadcn/ui's documented Carousel contract, letting callers drive
    // the carousel imperatively. The data flows from an external system (embla),
    // not parent-owned state, so no-pass-data-to-parent is a false positive.
    React.useEffect(() => {
      if (!api) {
        return
      }

      // oxlint-disable-next-line react-doctor/no-pass-data-to-parent
      emitApi(api)
    }, [api])

    React.useEffect(() => {
      if (!api) {
        return
      }

      const handleSelect = () => onSelect(api)
      handleSelect()
      api.on("reInit", handleSelect)
      api.on("select", handleSelect)

      return () => {
        api?.off("reInit", handleSelect)
        api?.off("select", handleSelect)
      }
    }, [api])

    const contextValue = useMemo<CarouselContextProps>(
      () => ({
        carouselRef,
        api,
        opts,
        orientation:
          orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }),
      [
        carouselRef,
        api,
        opts,
        orientation,
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      ]
    )

    return (
      <CarouselContext.Provider value={contextValue}>
        <section
          ref={ref}
          onKeyDownCapture={handleKeyDown}
          className={cn("relative", className)}
          aria-roledescription="carousel"
          {...props}
        >
          {children}
        </section>
      </CarouselContext.Provider>
    )
}
Carousel.displayName = "Carousel"

type CarouselContentProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>
}

const CarouselContent = ({ className, ref, ...props }: CarouselContentProps) => {
  const { carouselRef, orientation } = useCarousel()

  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div
        ref={ref}
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className
        )}
        {...props}
      />
    </div>
  )
}
CarouselContent.displayName = "CarouselContent"

type CarouselItemProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>
}

const CarouselItem = ({ className, ref, ...props }: CarouselItemProps) => {
  const { orientation } = useCarousel()

  return (
    // `role="group"` + `aria-roledescription="slide"` is the WAI-ARIA APG
    // carousel-slide pattern. No native HTML element conveys "carousel slide",
    // and the rule's suggested `<address>` is semantically wrong (it's for
    // contact information), so prefer-tag-over-role is a false positive here.
    <div
      ref={ref}
      // oxlint-disable-next-line react-doctor/prefer-tag-over-role
      role="group"
      aria-roledescription="slide"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className
      )}
      {...props}
    />
  )
}
CarouselItem.displayName = "CarouselItem"

type CarouselButtonProps = React.ComponentProps<typeof Button> & {
  ref?: React.Ref<HTMLButtonElement>
}

const CarouselPrevious = ({ className, variant = "outline", size = "icon", ref, ...props }: CarouselButtonProps) => {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel()

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        "absolute  size-8 rounded-full",
        orientation === "horizontal"
          ? "-left-12 top-1/2 -translate-y-1/2"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ArrowLeft className="size-4" />
      <span className="sr-only">Previous slide</span>
    </Button>
  )
}
CarouselPrevious.displayName = "CarouselPrevious"

const CarouselNext = ({ className, variant = "outline", size = "icon", ref, ...props }: CarouselButtonProps) => {
  const { orientation, scrollNext, canScrollNext } = useCarousel()

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal"
          ? "-right-12 top-1/2 -translate-y-1/2"
          : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ArrowRight className="size-4" />
      <span className="sr-only">Next slide</span>
    </Button>
  )
}
CarouselNext.displayName = "CarouselNext"

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
}
