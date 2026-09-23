"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"

// Logical canvas dimensions. The canvas is scaled responsively via CSS.
const W = 800
const H = 600
const GRAVITY = 0.42
const BALL_R = 22
const RIM_HALF = 46
const RIM_R = 6
const FLOOR_Y = H - 28
const POWER = 0.135
const MAX_SPEED = 22
const GAME_SECONDS = 60

type GameState = "start" | "playing" | "over"

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  prevY: number
  flying: boolean
  bounces: number
  touchedRim: boolean
  scoredThisShot: boolean
}

interface Hoop {
  x: number
  y: number
  baseY: number
  vy: number
  vx: number
  moveY: boolean
  moveX: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

interface Popup {
  x: number
  y: number
  life: number
  text: string
  color: string
}

const START_X = 150
const START_Y = FLOOR_Y - BALL_R

function makeBall(): Ball {
  return {
    x: START_X,
    y: START_Y,
    vx: 0,
    vy: 0,
    prevY: START_Y,
    flying: false,
    bounces: 0,
    touchedRim: false,
    scoredThisShot: false,
  }
}

function makeHoop(level: number): Hoop {
  const baseY = 210
  return {
    x: 620,
    y: baseY,
    baseY,
    vy: 1.1 + level * 0.35,
    vx: 0.9 + level * 0.3,
    moveY: level >= 1,
    moveX: level >= 2,
  }
}

export default function BasketballGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const ballRef = useRef<Ball>(makeBall())
  const hoopRef = useRef<Hoop>(makeHoop(0))
  const particlesRef = useRef<Particle[]>([])
  const popupsRef = useRef<Popup[]>([])
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; cx: number; cy: number }>({
    active: false,
    sx: 0,
    sy: 0,
    cx: 0,
    cy: 0,
  })
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const madeRef = useRef(0)
  const stateRef = useRef<GameState>("start")
  const timeEndRef = useRef(0)

  const [gameState, setGameState] = useState<GameState>("start")
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS)

  const spawnConfetti = useCallback((x: number, y: number, swish: boolean) => {
    const colors = swish
      ? ["#fbbf24", "#f59e0b", "#fde68a", "#ffffff"]
      : ["#f97316", "#fb923c", "#ffffff"]
    const n = swish ? 26 : 16
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 2 + Math.random() * 5
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2,
        life: 1,
        color: colors[(Math.random() * colors.length) | 0],
      })
    }
  }, [])

  const newShot = useCallback(() => {
    const b = makeBall()
    b.x = START_X + (Math.random() * 120 - 40)
    b.prevY = b.y
    ballRef.current = b
  }, [])

  const startGame = useCallback(() => {
    scoreRef.current = 0
    comboRef.current = 0
    madeRef.current = 0
    setScore(0)
    setCombo(0)
    hoopRef.current = makeHoop(0)
    particlesRef.current = []
    popupsRef.current = []
    newShot()
    timeEndRef.current = performance.now() + GAME_SECONDS * 1000
    setTimeLeft(GAME_SECONDS)
    stateRef.current = "playing"
    setGameState("playing")
  }, [newShot])

  // Convert a pointer event to logical canvas coordinates.
  const toLocal = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (stateRef.current !== "playing") return
      const b = ballRef.current
      if (b.flying) return
      const p = toLocal(e.clientX, e.clientY)
      dragRef.current = { active: true, sx: p.x, sy: p.y, cx: p.x, cy: p.y }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [toLocal],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current.active) return
      const p = toLocal(e.clientX, e.clientY)
      dragRef.current.cx = p.x
      dragRef.current.cy = p.y
    },
    [toLocal],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = dragRef.current
      if (!d.active) return
      d.active = false
      const b = ballRef.current
      if (b.flying || stateRef.current !== "playing") return
      const p = toLocal(e.clientX, e.clientY)
      let vx = (d.sx - p.x) * POWER
      let vy = (d.sy - p.y) * POWER
      const sp = Math.hypot(vx, vy)
      if (sp < 2) return // ignore tiny taps
      if (sp > MAX_SPEED) {
        vx = (vx / sp) * MAX_SPEED
        vy = (vy / sp) * MAX_SPEED
      }
      b.vx = vx
      b.vy = vy
      b.flying = true
    },
    [toLocal],
  )

  // Main game loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const drawBall = (x: number, y: number) => {
      const grad = ctx.createRadialGradient(x - 7, y - 7, 4, x, y, BALL_R)
      grad.addColorStop(0, "#fdba74")
      grad.addColorStop(1, "#ea580c")
      ctx.beginPath()
      ctx.arc(x, y, BALL_R, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()
      // seams
      ctx.strokeStyle = "rgba(60,20,0,0.55)"
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(x, y, BALL_R, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - BALL_R, y)
      ctx.lineTo(x + BALL_R, y)
      ctx.moveTo(x, y - BALL_R)
      ctx.lineTo(x, y + BALL_R)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x - BALL_R, y, BALL_R * 0.9, -Math.PI / 3, Math.PI / 3)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x + BALL_R, y, BALL_R * 0.9, Math.PI - Math.PI / 3, Math.PI + Math.PI / 3)
      ctx.stroke()
    }

    const drawHoop = (h: Hoop) => {
      const boardX = h.x + RIM_HALF + 10
      const boardTop = h.y - 96
      const boardH = 112
      // pole
      ctx.fillStyle = "#4b5563"
      ctx.fillRect(boardX + 14, boardTop + 10, 10, FLOOR_Y - boardTop - 10)
      // backboard
      ctx.fillStyle = "rgba(255,255,255,0.92)"
      ctx.fillRect(boardX, boardTop, 12, boardH)
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 3
      ctx.strokeRect(boardX - 1, h.y - 44, 12, 40)
      // rim
      ctx.strokeStyle = "#f97316"
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(h.x - RIM_HALF, h.y)
      ctx.lineTo(h.x + RIM_HALF, h.y)
      ctx.stroke()
      // net
      ctx.strokeStyle = "rgba(255,255,255,0.8)"
      ctx.lineWidth = 1.3
      const netH = 46
      const segs = 7
      for (let i = 0; i <= segs; i++) {
        const t = i / segs
        const topX = h.x - RIM_HALF + t * RIM_HALF * 2
        const botX = h.x - RIM_HALF * 0.5 + t * RIM_HALF
        ctx.beginPath()
        ctx.moveTo(topX, h.y)
        ctx.lineTo(botX, h.y + netH)
        ctx.stroke()
      }
      for (let r = 1; r <= 3; r++) {
        const yy = h.y + (netH * r) / 3.5
        const spread = RIM_HALF * (1 - r * 0.16)
        ctx.beginPath()
        ctx.moveTo(h.x - spread, yy)
        ctx.lineTo(h.x + spread, yy)
        ctx.stroke()
      }
    }

    const loop = () => {
      const state = stateRef.current
      const b = ballRef.current
      const h = hoopRef.current
      const d = dragRef.current

      // ---- background ----
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, "#1e3a8a")
      bg.addColorStop(0.55, "#3b82f6")
      bg.addColorStop(1, "#f59e0b")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // crowd dots
      ctx.fillStyle = "rgba(255,255,255,0.06)"
      for (let i = 0; i < 40; i++) {
        ctx.fillRect((i * 53) % W, 30 + ((i * 37) % 90), 6, 6)
      }

      // floor
      const fg = ctx.createLinearGradient(0, FLOOR_Y, 0, H)
      fg.addColorStop(0, "#b45309")
      fg.addColorStop(1, "#78350f")
      ctx.fillStyle = fg
      ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y)
      ctx.strokeStyle = "rgba(255,255,255,0.25)"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, FLOOR_Y)
      ctx.lineTo(W, FLOOR_Y)
      ctx.stroke()

      // ---- update ----
      if (state === "playing") {
        // move hoop for difficulty
        const level = Math.min(3, Math.floor(madeRef.current / 4))
        h.moveY = level >= 1
        h.moveX = level >= 2
        if (h.moveY) {
          h.y += h.vy
          if (h.y < 150 || h.y > 300) h.vy *= -1
        }
        if (h.moveX) {
          h.x += h.vx
          if (h.x < 520 || h.x > 690) h.vx *= -1
        }

        if (b.flying) {
          b.prevY = b.y
          b.vy += GRAVITY
          b.x += b.vx
          b.y += b.vy

          // left wall
          if (b.x - BALL_R < 0) {
            b.x = BALL_R
            b.vx = -b.vx * 0.6
          }
          // ceiling
          if (b.y - BALL_R < 0) {
            b.y = BALL_R
            b.vy = -b.vy * 0.6
          }
          // floor
          if (b.y + BALL_R > FLOOR_Y) {
            b.y = FLOOR_Y - BALL_R
            b.vy = -b.vy * 0.5
            b.vx *= 0.7
            b.bounces++
          }

          // rim collisions (two end points)
          for (const rx of [h.x - RIM_HALF, h.x + RIM_HALF]) {
            const dx = b.x - rx
            const dy = b.y - h.y
            const dist = Math.hypot(dx, dy)
            const min = BALL_R + RIM_R
            if (dist < min && dist > 0.001) {
              const nx = dx / dist
              const ny = dy / dist
              const overlap = min - dist
              b.x += nx * overlap
              b.y += ny * overlap
              const dot = b.vx * nx + b.vy * ny
              b.vx = (b.vx - 2 * dot * nx) * 0.72
              b.vy = (b.vy - 2 * dot * ny) * 0.72
              b.touchedRim = true
            }
          }

          // backboard (left face)
          const boardX = h.x + RIM_HALF + 10
          const boardTop = h.y - 96
          const boardBot = boardTop + 112
          if (
            b.x + BALL_R > boardX &&
            b.x < boardX + 6 &&
            b.y > boardTop &&
            b.y < boardBot &&
            b.vx > 0
          ) {
            b.x = boardX - BALL_R
            b.vx = -b.vx * 0.55
            b.touchedRim = true
          }

          // score detection: ball center crosses rim plane downward, between rims
          if (
            !b.scoredThisShot &&
            b.vy > 0 &&
            b.prevY < h.y &&
            b.y >= h.y &&
            b.x > h.x - RIM_HALF + 6 &&
            b.x < h.x + RIM_HALF - 6
          ) {
            b.scoredThisShot = true
            madeRef.current++
            const swish = !b.touchedRim
            comboRef.current++
            const base = 2
            const comboBonus = comboRef.current - 1
            const gained = base + (swish ? 1 : 0) + comboBonus
            scoreRef.current += gained
            setScore(scoreRef.current)
            setCombo(comboRef.current)
            spawnConfetti(h.x, h.y + 20, swish)
            popupsRef.current.push({
              x: h.x,
              y: h.y - 20,
              life: 1,
              text: swish ? `SWISH +${gained}` : `+${gained}`,
              color: swish ? "#fbbf24" : "#ffffff",
            })
          }

          // reset conditions
          if (b.y - BALL_R > H || b.x - BALL_R > W || b.bounces >= 3) {
            if (!b.scoredThisShot) {
              comboRef.current = 0
              setCombo(0)
            }
            newShot()
          }
        }

        // timer
        const remaining = Math.max(0, timeEndRef.current - performance.now())
        const secs = Math.ceil(remaining / 1000)
        setTimeLeft((prev) => (prev !== secs ? secs : prev))
        if (remaining <= 0) {
          stateRef.current = "over"
          setBest((prev) => Math.max(prev, scoreRef.current))
          setGameState("over")
        }
      }

      // ---- particles ----
      const parts = particlesRef.current
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.vy += 0.18
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.02
        if (p.life <= 0) {
          parts.splice(i, 1)
          continue
        }
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x, p.y, 5, 5)
      }
      ctx.globalAlpha = 1

      // ---- draw hoop + ball ----
      drawHoop(h)

      // aim trajectory preview
      if (d.active && !b.flying && state === "playing") {
        let vx = (d.sx - d.cx) * POWER
        let vy = (d.sy - d.cy) * POWER
        const sp = Math.hypot(vx, vy)
        if (sp > MAX_SPEED) {
          vx = (vx / sp) * MAX_SPEED
          vy = (vy / sp) * MAX_SPEED
        }
        let px = b.x
        let py = b.y
        let pvx = vx
        let pvy = vy
        ctx.fillStyle = "rgba(255,255,255,0.7)"
        for (let i = 0; i < 30; i++) {
          pvy += GRAVITY
          px += pvx
          py += pvy
          if (i % 2 === 0) {
            ctx.globalAlpha = 1 - i / 30
            ctx.beginPath()
            ctx.arc(px, py, 4, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.globalAlpha = 1
        // power indicator on ball
        ctx.strokeStyle = "rgba(255,255,255,0.9)"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(b.x + vx * 3, b.y + vy * 3)
        ctx.stroke()
      }

      drawBall(b.x, b.y)

      // ---- popups ----
      const pops = popupsRef.current
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]
        p.y -= 0.8
        p.life -= 0.02
        if (p.life <= 0) {
          pops.splice(i, 1)
          continue
        }
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.font = "bold 26px system-ui, sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(p.text, p.x, p.y)
      }
      ctx.globalAlpha = 1
      ctx.textAlign = "left"

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [newShot, spawnConfetti])

  return (
    <div className="relative w-full max-w-3xl select-none">
      <div className="mb-3 flex items-center justify-between gap-2 text-white">
        <div className="rounded-xl bg-black/30 px-4 py-2 backdrop-blur">
          <div className="text-xs uppercase tracking-wider text-white/60">Score</div>
          <div className="text-2xl font-bold tabular-nums">{score}</div>
        </div>
        <div className="rounded-xl bg-black/30 px-4 py-2 text-center backdrop-blur">
          <div className="text-xs uppercase tracking-wider text-white/60">Combo</div>
          <div className={`text-2xl font-bold tabular-nums ${combo > 1 ? "text-amber-400" : ""}`}>
            {combo > 1 ? `x${combo}` : "-"}
          </div>
        </div>
        <div className="rounded-xl bg-black/30 px-4 py-2 text-right backdrop-blur">
          <div className="text-xs uppercase tracking-wider text-white/60">Time</div>
          <div className={`text-2xl font-bold tabular-nums ${timeLeft <= 10 ? "text-red-400" : ""}`}>
            {timeLeft}s
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="block w-full touch-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Basketball shooting game. Drag the ball back and release to shoot into the hoop."
        />

        {gameState === "start" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/55 px-6 text-center backdrop-blur-sm">
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              Basketball <span className="text-amber-400">Stars</span>
            </h1>
            <p className="max-w-sm text-balance text-white/80">
              Drag the ball back like a slingshot and release to shoot. Sink baskets before the clock
              runs out. Chain shots for combo bonuses and go for the swish!
            </p>
            <button
              onClick={startGame}
              className="rounded-full bg-amber-500 px-8 py-3 text-lg font-bold text-black shadow-lg transition hover:scale-105 hover:bg-amber-400 active:scale-95"
            >
              Play
            </button>
          </div>
        )}

        {gameState === "over" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center backdrop-blur-sm">
            <h2 className="text-3xl font-black text-white sm:text-4xl">Time&apos;s Up!</h2>
            <div className="flex gap-8">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/60">Score</div>
                <div className="text-4xl font-black text-amber-400">{score}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-white/60">Best</div>
                <div className="text-4xl font-black text-white">{Math.max(best, score)}</div>
              </div>
            </div>
            <button
              onClick={startGame}
              className="rounded-full bg-amber-500 px-8 py-3 text-lg font-bold text-black shadow-lg transition hover:scale-105 hover:bg-amber-400 active:scale-95"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-sm text-white/50">
        Drag back from the ball and release to shoot. The hoop starts moving as you score more.
      </p>
    </div>
  )
}
