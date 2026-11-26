"use client"

/**
 * "How it works" as one pinned scene: the device stays put while the copy
 * steps through Earn → Play → Care as you scroll, and the pet's screen
 * changes with it. Play is live: tap the pet to play Flappy Pet or Sat Catcher.
 */
import { useEffect, useRef, useState } from "react"
import { Bird, Coins, type LucideIcon } from "lucide-react"
import { PetScreen, type PetScreenMode } from "./pet-screen"

type Game = "flappy" | "satcatcher"

const STEPS = [
  {
    eyebrow: "Earn",
    title: "Jobs keep it alive",
    body: "Kids earn sats doing jobs posted in Ganamos. Every sat lands on the pet, and pays for its food.",
  },
  {
    eyebrow: "Play",
    title: "Games keep it happy",
    body: "Playing makes the pet happy. Play solo, or with friends for real sats: winner takes the pot.",
  },
  {
    eyebrow: "Care",
    title: "Food keeps it fed",
    body: "Feed it a few times a day with the coins it earned. Forget, and it gets sad.",
  },
] as const

const GAMES: { id: Game; name: string; Icon: LucideIcon }[] = [
  { id: "flappy", name: "Flappy Pet", Icon: Bird },
  { id: "satcatcher", name: "Sat Catcher", Icon: Coins },
]

export function PetStory() {
  const sectionRef = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  const [game, setGame] = useState<Game>("flappy")

  // Which step is showing: how far the pinned section has scrolled
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = sectionRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const scrollable = r.height - window.innerHeight
      const p = scrollable > 0 ? Math.min(0.9999, Math.max(0, -r.top / scrollable)) : 0
      setStep(Math.floor(p * STEPS.length))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const goTo = (i: number) => {
    const el = sectionRef.current
    if (!el) return
    const scrollable = el.offsetHeight - window.innerHeight
    const top = el.getBoundingClientRect().top + window.scrollY
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.scrollTo({ top: top + (scrollable * (i + 0.5)) / STEPS.length, behavior: reduce ? "auto" : "smooth" })
  }

  const mode: PetScreenMode = step === 0 ? "home" : step === 1 ? game : "feed"
  const label =
    step === 0
      ? "The pet's home screen, then a new job alert"
      : step === 1
        ? game === "flappy" ? "Play Flappy Pet: tap to flap" : "Play Sat Catcher: tap to turn around"
        : "The food menu, then the pet eating"

  return (
    <section ref={sectionRef} aria-label="How Satoshi Pet works" className="relative h-[320svh] md:-mt-16">
      <div className="sticky top-0 flex h-[100svh] flex-col gap-8 overflow-hidden pt-[clamp(4.25rem,11svh,9rem)] max-md:gap-4 md:gap-12">
        {/* The heading rides along with the pinned scene, so there's no gap above it */}
        <h2 className="mx-auto max-w-3xl px-4 text-center text-2xl font-bold tracking-tight text-balance sm:text-4xl">
          Make Bitcoin physical, fun and rewarding for your kids
        </h2>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-3 px-4 md:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] md:gap-10">
          {/* Copy: one step at a time, sliding through as you scroll */}
          <div className="relative">
            <div className="relative h-[11rem] sm:h-[13rem] md:h-[16rem]">
              {STEPS.map((s, i) => {
                const active = i === step
                return (
                  <div
                    key={s.title}
                    aria-hidden={!active}
                    className={`absolute inset-0 flex flex-col justify-center text-center transition-all duration-500 ease-out motion-reduce:transition-none md:text-left ${
                      active ? "translate-y-0 opacity-100" : `pointer-events-none opacity-0 ${i < step ? "-translate-y-8" : "translate-y-8"}`
                    }`}
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#F7931A]">{s.eyebrow}</p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl">{s.title}</h3>
                    <p className="mx-auto mt-3 max-w-md text-white/65 md:mx-0">{s.body}</p>
                    {i === 1 && (
                      <div className="mt-5 flex justify-center gap-2 md:justify-start" role="tablist" aria-label="Games">
                        {GAMES.map(({ id, name, Icon }) => (
                          <button
                            key={id}
                            type="button"
                            role="tab"
                            tabIndex={active ? 0 : -1}
                            aria-selected={game === id}
                            onClick={() => setGame(id)}
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                              game === id ? "bg-[#F7931A] text-[#1d1100]" : "bg-white/5 text-white/70 ring-1 ring-white/15 hover:bg-white/10"
                            }`}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Where you are: Earn / Play / Care */}
            <div className="mt-1 flex justify-center gap-3 md:mt-4 md:justify-start" aria-label="Steps">
              {STEPS.map((s, i) => (
                <button
                  key={s.eyebrow}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={s.eyebrow}
                  aria-current={i === step ? "step" : undefined}
                  className="group flex items-center gap-2 py-2"
                >
                  <span className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-8 bg-[#F7931A]" : "w-3 bg-white/25 group-hover:bg-white/45"}`} />
                </button>
              ))}
            </div>
          </div>

          {/* The device stays; its screen follows the step */}
          <PetScreen mode={mode} label={label} className="mx-auto w-full max-w-3xl max-md:max-w-[min(100%,calc((100svh-24rem)*2))]" />
        </div>
      </div>
    </section>
  )
}
