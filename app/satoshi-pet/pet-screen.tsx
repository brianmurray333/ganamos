"use client"

/**
 * The Satoshi Pet's 128x64 OLED, in the browser: the firmware's own sprites
 * (pet-sprites.ts) and an Arial-metric 1-bit font, drawn at the device's
 * resolution and scaled up inside a render of the device.
 *
 * Modes:
 *   home        the pet idling with its stats; now and then a NEW JOB! alert
 *   feed        the food menu, then the pet eating
 *   flappy      Flappy Pet, playable (same physics as the firmware)
 *   satcatcher  Sat Catcher, playable (same rules as the firmware)
 * Tap / click / Space is the pet's button.
 */
import { useEffect, useRef, useState } from "react"
import {
  COIN_FRAMES,
  DOG_DEFAULT_SEQUENCE,
  DOG_EAT_SEQUENCE,
  DOG_FRAMES,
  FOODS,
  GAME_CHARACTER,
  HEART,
  PIXEL_FONTS,
  ROCK,
  type Sprite,
} from "./pet-sprites"

export type PetScreenMode = "home" | "feed" | "flappy" | "satcatcher"

const W = 128
const H = 64

// ---------------------------------------------------------------------------
// Drawing onto a 128x64 canvas (everything is 1-bit: sprites and glyphs)
// ---------------------------------------------------------------------------

const spriteCache = new Map<string, HTMLCanvasElement>()

function spriteCanvas(s: Sprite, flip = false): HTMLCanvasElement {
  const key = `${s.w}x${s.h}:${flip ? "f" : ""}:${s.hex}`
  const hit = spriteCache.get(key)
  if (hit) return hit
  const c = document.createElement("canvas")
  c.width = s.w
  c.height = s.h
  const ctx = c.getContext("2d")!
  const img = ctx.createImageData(s.w, s.h)
  const rowBytes = Math.ceil(s.w / 8)
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const byte = parseInt(s.hex.substr((y * rowBytes + (x >> 3)) * 2, 2), 16)
      if ((byte >> (x & 7)) & 1) {
        const dx = flip ? s.w - 1 - x : x
        const i = (y * s.w + dx) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  spriteCache.set(key, c)
  return c
}

class Oled {
  ctx: CanvasRenderingContext2D
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { willReadFrequently: true })!
    this.ctx.imageSmoothingEnabled = false
  }
  clear() {
    this.ctx.fillStyle = "#000"
    this.ctx.fillRect(0, 0, W, H)
    this.ctx.fillStyle = "#fff"
  }
  rect(x: number, y: number, w: number, h: number) {
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }
  line(x0: number, y0: number, x1: number, y1: number) {
    if (y0 === y1) this.rect(Math.min(x0, x1), y0, Math.abs(x1 - x0) + 1, 1)
    else this.rect(x0, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1)
  }
  sprite(s: Sprite, x: number, y: number, flip = false) {
    this.ctx.drawImage(spriteCanvas(s, flip), Math.round(x), Math.round(y))
  }
  /** Firmware drawString: y is the top of the text; Arial-metric 1-bit glyphs */
  text(t: string, x: number, y: number, size: 10 | 16 | 24 = 10, align: "left" | "center" | "right" = "left") {
    const font = PIXEL_FONTS[String(size) as "10" | "16" | "24"]
    let width = 0
    for (const ch of t) width += (font.glyphs[ch] ?? font.glyphs["?"]).adv
    let cx = Math.round(align === "center" ? x - width / 2 : align === "right" ? x - width : x)
    for (const ch of t) {
      const g = font.glyphs[ch] ?? font.glyphs["?"]
      if (ch !== " ") this.sprite(g, cx, y - 1)
      cx += g.adv
    }
  }
  /** Snap anti-aliased text edges to on/off, like the real 1-bit panel */
  threshold() {
    const img = this.ctx.getImageData(0, 0, W, H)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const on = d[i] > 110
      d[i] = d[i + 1] = d[i + 2] = on ? 255 : 0
      d[i + 3] = 255
    }
    this.ctx.putImageData(img, 0, 0)
  }
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

type Scene = {
  frame(o: Oled, now: number): void
  press?(now: number): void
  /** Demo screens can pause when not visible; games keep their own state */
  interactive?: boolean
}

function homeScene(): Scene {
  const start = performance.now()
  return {
    frame(o, now) {
      const t = now - start
      const cycle = t % 9000
      o.clear()
      if (cycle > 6000) {
        // NEW JOB! alert, as renderNewJobNotification draws it
        o.text("NEW JOB!", 64, 2, 16, "center")
        o.text("2.1k sats", 64, 22, 10, "center")
        o.text("Pick up park litter", 64, 38, 10, "center")
        const f = Math.floor((cycle - 6000) / 150) % 4
        o.sprite(COIN_FRAMES[f], 20, 52)
        o.sprite(COIN_FRAMES[(f + 2) % 4], 100, 52)
        return
      }
      o.text("Mochi", 0, 0)
      o.text("C: 3.9k", 0, 13)
      o.text("H: 92", 0, 26)
      o.text("F: 80", 0, 39)
      o.text("B: 60.6k", 0, 52)
      // battery
      o.rect(113, 2, 12, 6)
      o.ctx.fillStyle = "#000"
      o.rect(114, 3, 10, 4)
      o.ctx.fillStyle = "#fff"
      o.rect(115, 4, 8, 2)
      o.rect(125, 4, 1, 2)
      const name = DOG_DEFAULT_SEQUENCE[Math.floor(t / 400) % DOG_DEFAULT_SEQUENCE.length]
      o.sprite(DOG_FRAMES[name], 60, 13)
    },
  }
}

function feedScene(): Scene {
  const start = performance.now()
  return {
    frame(o, now) {
      const t = (now - start) % 8000
      o.clear()
      if (t < 4200) {
        // Food menu: the cursor walks down the list
        const sel = Math.min(2, Math.floor(t / 1400))
        FOODS.forEach((f, i) => o.text((i === sel ? "> " : "  ") + f.name, 2, 1 + i * 15))
        o.text("  <- Back", 2, 46)
        const food = FOODS[sel]
        o.sprite(food.sprite, 72, 2)
        o.text(`${food.cost}c +${food.fullness}%`, 96, 52, 10, "center")
      } else {
        // Eating: the firmware's eat animation, fullness going up
        const et = t - 4200
        const name = DOG_EAT_SEQUENCE[Math.floor(et / 400) % DOG_EAT_SEQUENCE.length]
        o.sprite(DOG_FRAMES[name], 60, 13)
        o.text("Yum!", 0, 13)
        const full = Math.min(100, 60 + Math.floor(et / 90))
        o.text(`F: ${full}`, 0, 39)
        o.text("-1000c", 0, 52)
      }
    },
  }
}

function readBest(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0
  } catch {
    return 0
  }
}
function saveBest(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    /* private mode */
  }
}

/** Flappy Pet, ported from handleLightningGame/flappyRun in pet_blob.cpp */
function flappyScene(): Scene {
  const PET_X = 25, PET_H = 16, PET_W = 16
  const GRAVITY = 0.25, FLAP = -3.5, MAX_FALL = 5
  const WALL_W = 8, SPACING = 120, SPEED0 = 0.9, SPEED_UP = 0.025
  type Wall = { x: number; h: number; top: number; passed: boolean }
  let state: "ready" | "play" | "over" = "ready"
  let y = 32, v = 0, score = 0, speed = SPEED0, last = 0, overAt = 0
  let best = readBest("sp-flappy-best")
  let walls: Wall[] = []
  const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo))
  const reset = () => {
    y = 32; v = 0; score = 0; speed = SPEED0
    walls = [0, 1, 2, 3].map((i) => ({
      x: 128 + i * SPACING,
      h: i === 0 ? 12 : i === 1 ? rnd(12, 18) : i === 2 ? rnd(15, 22) : rnd(18, 28),
      top: 0,
      passed: false,
    }))
  }
  reset()
  return {
    interactive: true,
    press(now) {
      if (state === "ready") { reset(); state = "play"; last = now; v = FLAP }
      else if (state === "play") v = FLAP
      else if (now - overAt > 600) state = "ready"
    },
    frame(o, now) {
      o.clear()
      if (state === "ready") {
        o.text("Flappy Pet", 64, 12, 16, "center")
        o.text("Tap to flap!", 64, 36, 10, "center")
        if (best) o.text(`Best: ${best}`, 64, 50, 10, "center")
        o.sprite(GAME_CHARACTER, 8, 40 + Math.round(Math.sin(now / 250) * 3))
        return
      }
      if (state === "play") {
        let dt = (now - last) / 16.6667
        last = now
        dt = Math.max(0.25, Math.min(2, dt))
        v = Math.max(-MAX_FALL, Math.min(MAX_FALL, v + GRAVITY * dt))
        y = Math.max(-8, Math.min(64 - PET_H + 8, y + v * dt))
        for (const w of walls) {
          w.x -= speed * dt
          if (!w.passed && w.x + WALL_W < PET_X) { w.passed = true; score++; speed += SPEED_UP }
          if (w.x + WALL_W < 0) {
            w.x = Math.max(...walls.map((o2) => o2.x)) + SPACING
            const maxH = Math.min(30, 18 + Math.floor(score / 2))
            const minH = Math.max(10, 12 - Math.floor(score / 8))
            if (score < 15) { w.h = rnd(minH, maxH + 1); w.top = 0 }
            else if (score < 30) {
              if (rnd(0, 2) === 0) { w.h = 0; w.top = rnd(12, 24) } else { w.h = rnd(minH, maxH + 1); w.top = 0 }
            } else {
              const gap = rnd(40, 48), avail = 64 - gap
              const bMax = Math.min(18, Math.floor(avail / 2))
              w.h = rnd(8, bMax + 1); w.top = rnd(6, bMax + 1)
            }
            w.passed = false
          }
        }
        const pl = PET_X, pr = PET_X + PET_W, pt = Math.floor(y), pb = Math.floor(y) + PET_H
        for (const w of walls) {
          const wl = Math.floor(w.x), wr = wl + WALL_W
          if (pr > wl && pl < wr && ((w.h > 0 && pb > 64 - w.h) || (w.top > 0 && pt < w.top))) {
            state = "over"; overAt = now
            if (score > best) { best = score; saveBest("sp-flappy-best", best) }
          }
        }
      }
      for (const w of walls) {
        const wx = Math.floor(w.x)
        if (wx >= -WALL_W && wx < 128) {
          if (w.h > 0) o.rect(wx, 64 - w.h, WALL_W, w.h)
          if (w.top > 0) o.rect(wx, 0, WALL_W, w.top)
        }
      }
      const dy = Math.max(0, Math.min(64 - PET_H, Math.floor(y)))
      o.sprite(GAME_CHARACTER, PET_X, dy)
      o.text(`Score: ${score}`, 0, 0)
      if (state === "over") {
        o.ctx.fillStyle = "#000"
        o.rect(14, 14, 100, 38)
        o.ctx.fillStyle = "#fff"
        o.text("Game Over!", 64, 16, 16, "center")
        o.text(`Score: ${score}   Best: ${best}`, 64, 36, 10, "center")
      }
    },
  }
}

/** Sat Catcher, ported from satCatcherRun in pet_blob.cpp (30 ms frames) */
function satCatcherScene(): Scene {
  const GROUND = 62, PET_W = 16, PET_H = 16, PET_Y = GROUND - PET_H, ITEM = 8, FRAME = 30
  type Item = { x: number; y: number; on: boolean; rock: boolean }
  let state: "ready" | "play" | "over" = "ready"
  let items: Item[] = []
  let x = 56, dir = 1, score = 0, lives = 3, hurt = 0, nextSpawn = 0, acc = 0, last = 0, clock = 0, overAt = 0
  let best = readBest("sp-satcatcher-best")
  const reset = (now: number) => {
    items = Array.from({ length: 6 }, () => ({ x: 0, y: 0, on: false, rock: false }))
    x = 56; dir = 1; score = 0; lives = 3; hurt = 0; clock = 0; nextSpawn = 600; acc = 0; last = now
  }
  const step = () => {
    clock += FRAME
    const petSpeed = Math.min(2.8, 1.5 + score * 0.04)
    const fall = Math.min(2.2, 0.8 + score * 0.04)
    const spawnMs = Math.max(320, 950 - score * 18)
    const rockChance = Math.min(45, 22 + score)
    x += dir * petSpeed
    if (x <= 0) { x = 0; dir = 1 }
    if (x >= 128 - PET_W) { x = 128 - PET_W; dir = -1 }
    if (clock >= nextSpawn) {
      const it = items.find((i) => !i.on)
      if (it) {
        it.on = true
        it.rock = Math.floor(Math.random() * 100) < rockChance
        it.x = Math.floor(Math.random() * (128 - ITEM))
        it.y = 12 - ITEM
      }
      nextSpawn = clock + spawnMs
    }
    for (const it of items) {
      if (!it.on) continue
      it.y += fall * (it.rock ? 1.15 : 1)
      const overlap = it.x + ITEM > x + 2 && it.x < x + PET_W - 2 && it.y + ITEM > PET_Y + 3 && it.y < PET_Y + PET_H
      if (overlap) {
        it.on = false
        if (it.rock) { if (clock >= hurt) { lives--; hurt = clock + 900 } }
        else score++
      } else if (it.y > GROUND) it.on = false
    }
  }
  reset(0)
  return {
    interactive: true,
    press(now) {
      if (state === "ready") { reset(now); state = "play" }
      else if (state === "play") dir = -dir
      else if (now - overAt > 600) state = "ready"
    },
    frame(o, now) {
      o.clear()
      if (state === "ready") {
        o.text("Sat Catcher", 64, 4, 16, "center")
        o.text("Tap to turn around", 64, 26, 10, "center")
        o.text(best ? `Best: ${best}` : "Catch sats, dodge rocks", 64, 39, 10, "center")
        o.sprite(COIN_FRAMES[Math.floor(now / 120) % 4], 60, 53)
        return
      }
      if (state === "play") {
        acc += Math.min(200, now - last)
        last = now
        while (acc >= FRAME && lives > 0) { step(); acc -= FRAME }
        if (lives <= 0) {
          state = "over"; overAt = now
          if (score > best) { best = score; saveBest("sp-satcatcher-best", best) }
        }
      }
      o.sprite(COIN_FRAMES[0], 0, 1)
      o.text(String(score), 11, -1)
      for (let l = 0; l < lives; l++) o.sprite(HEART, 120 - l * 9, 2)
      o.line(0, GROUND + 1, 127, GROUND + 1)
      items.forEach((it, i) => {
        if (!it.on) return
        if (it.rock) o.sprite(ROCK, it.x, it.y)
        else o.sprite(COIN_FRAMES[(Math.floor(now / 120) + i) % 4], it.x, it.y)
      })
      const visible = clock >= hurt || Math.floor(now / 90) % 2 === 0
      if (visible) o.sprite(GAME_CHARACTER, x, PET_Y, dir < 0)
      if (state === "over") {
        o.ctx.fillStyle = "#000"
        o.rect(14, 14, 100, 38)
        o.ctx.fillStyle = "#fff"
        o.text("Game Over!", 64, 16, 16, "center")
        o.text(`${score} sats   Best: ${best}`, 64, 36, 10, "center")
      }
    },
  }
}

function makeScene(mode: PetScreenMode): Scene {
  switch (mode) {
    case "feed": return feedScene()
    case "flappy": return flappyScene()
    case "satcatcher": return satCatcherScene()
    default: return homeScene()
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PetScreen({ mode, label, className = "" }: { mode: PetScreenMode; label: string; className?: string }) {
  const screenRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const screen = screenRef.current
    if (!screen) return
    const off = document.createElement("canvas")
    off.width = W
    off.height = H
    const oled = new Oled(off)
    const out = screen.getContext("2d")!
    const scene = makeScene(mode)
    sceneRef.current = scene

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let visible = true
    let raf = 0
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.05 })
    io.observe(screen)

    let drawn = false
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (!visible) return
      // Reduced motion: demo screens show one still frame; games still play on input
      if (reduced && !scene.interactive && drawn) return
      drawn = true
      scene.frame(oled, now)
      out.imageSmoothingEnabled = false
      out.clearRect(0, 0, screen.width, screen.height)
      out.drawImage(off, 0, 0, screen.width, screen.height)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [mode])

  const press = () => sceneRef.current?.press?.(performance.now())

  const interactive = mode === "flappy" || mode === "satcatcher"
  return (
    <div className={className}>
      {/* The device, straight on (rendered from the case STLs); the screen sits in its window */}
      <div className="relative w-full aspect-[2/1]">
        <img
          src="/satoshi-pet/pet-frame.webp"
          alt=""
          aria-hidden="true"
          width={1400}
          height={700}
          className="absolute inset-0 h-full w-full select-none"
          draggable={false}
        />
        {/* The OLED's black glass: fills the window so the pixels sit inset from the bezel */}
        <div aria-hidden="true" className="absolute z-10 left-[40.12%] top-[29.08%] w-[28.39%] h-[28.39%] rounded-[2px] bg-black" />
        <canvas
          ref={screenRef}
          width={W * 4}
          height={H * 4}
          role={interactive ? "button" : "img"}
          aria-label={label}
          tabIndex={interactive ? 0 : -1}
          onPointerDown={(e) => {
            if (!interactive) return
            e.preventDefault()
            press()
          }}
          onKeyDown={(e) => {
            if (!interactive) return
            if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") {
              e.preventDefault()
              press()
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`absolute z-10 left-[41.82%] top-[30.78%] w-[24.99%] h-[24.99%] bg-black [image-rendering:pixelated] select-none
            [filter:drop-shadow(0_0_3px_rgba(200,220,255,0.5))]
            ${interactive ? "touch-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#F7931A]" : ""}`}
        />
        {interactive && (
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onPointerDown={(e) => {
              e.preventDefault()
              press()
            }}
            className="absolute inset-0 cursor-pointer bg-transparent"
          />
        )}
      </div>
      {/* Always takes its line, so the device doesn't shift when a game comes on */}
      <p className={`mt-1 text-center text-xs text-white/45 ${interactive ? "" : "invisible"}`} aria-hidden={!interactive}>
        {focused ? "Space or tap to play" : "Tap the pet to play"}
      </p>
    </div>
  )
}
