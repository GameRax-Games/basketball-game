"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"

// ----- World constants -----
const W = 900
const H = 500
const GROUND_Y = H - 60
const GRAVITY = 0.9
const FRICTION = 0.86
const AIR_FRICTION = 0.99
const PLAYER_SPEED = 4.4
const PLAYER_ACCEL = 0.9
const JUMP_V = -16
const KICK_RANGE = 62
const KICK_POWER = 15
const MATCH_SECONDS = 90

const GOAL_W = 70
const GOAL_H = 170

type Mode = "cpu" | "two"
type Phase = "menu" | "countdown" | "playing" | "goal" | "over"

interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  facing: number // 1 right, -1 left
  kickTimer: number
  color: string
  accent: string
  score: number
}

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  spin: number
}

const R_PLAYER = 34 // head radius-ish (body circle)
const R_BALL = 15

function makePlayer(x: number, color: string, accent: string, facing: number): Player {
  return { x, y: GROUND_Y, vx: 0, vy: 0, onGround: true, facing, kickTimer: 0, color, accent, score: 0 }
}

function resetPositions(p1: Player, p2: Player, ball: Ball) {
  p1.x = W * 0.28
  p1.y = GROUND_Y
  p1.vx = 0
  p1.vy = 0
  p1.facing = 1
  p2.x = W * 0.72
  p2.y = GROUND_Y
  p2.vx = 0
  p2.vy = 0
  p2.facing = -1
  ball.x = W / 2
  ball.y = GROUND_Y - 160
  ball.vx = 0
  ball.vy = 0
  ball.spin = 0
}

export default function SoccerGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const keys = useRef<Record<string, boolean>>({})

  const p1Ref = useRef<Player>(makePlayer(W * 0.28, "#ef4444", "#fca5a5", 1))
  const p2Ref = useRef<Player>(makePlayer(W * 0.72, "#3b82f6", "#93c5fd", -1))
  const ballRef = useRef<Ball>({ x: W / 2, y: GROUND_Y - 160, vx: 0, vy: 0, spin: 0 })

  const [mode, setMode] = useState<Mode>("cpu")
  const [phase, setPhase] = useState<Phase>("menu")
  const [scoreL, setScoreL] = useState(0)
  const [scoreR, setScoreR] = useState(0)
  const [timeLeft, setTimeLeft] = useState(MATCH_SECONDS)
  const [goalText, setGoalText] = useState("")

  const phaseRef = useRef<Phase>("menu")
  const modeRef = useRef<Mode>("cpu")
  const timeRef = useRef<number>(MATCH_SECONDS)
  const lastTickRef = useRef<number>(0)
  const countdownRef = useRef<number>(3)
  const goalTimerRef = useRef<number>(0)
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; color: string }[]>([])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const startMatch = useCallback((m: Mode) => {
    setMode(m)
    modeRef.current = m
    p1Ref.current.score = 0
    p2Ref.current.score = 0
    setScoreL(0)
    setScoreR(0)
    setTimeLeft(MATCH_SECONDS)
    timeRef.current = MATCH_SECONDS
    resetPositions(p1Ref.current, p2Ref.current, ballRef.current)
    countdownRef.current = 3
    setPhase("countdown")
    phaseRef.current = "countdown"
    lastTickRef.current = performance.now()
  }, [])

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (
        ["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "w", "a", "s", "d", "f", "l"].includes(k)
      ) {
        e.preventDefault()
      }
      keys.current[k] = true
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  const spawnConfetti = (x: number, y: number) => {
    const colors = ["#fbbf24", "#f87171", "#34d399", "#60a5fa", "#c084fc", "#ffffff"]
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 2 + Math.random() * 7
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 4,
        life: 1,
        color: colors[(Math.random() * colors.length) | 0],
      })
    }
  }

  const scoreGoal = useCallback((side: "L" | "R") => {
    if (side === "L") {
      p1Ref.current.score += 1
      setScoreL(p1Ref.current.score)
      spawnConfetti(W - GOAL_W, GROUND_Y - GOAL_H / 2)
    } else {
      p2Ref.current.score += 1
      setScoreR(p2Ref.current.score)
      spawnConfetti(GOAL_W, GROUND_Y - GOAL_H / 2)
    }
    setGoalText("GOAL!")
    setPhase("goal")
    phaseRef.current = "goal"
    goalTimerRef.current = 90
  }, [])

  // main loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const step = (now: number) => {
      const phase = phaseRef.current
      const p1 = p1Ref.current
      const p2 = p2Ref.current
      const ball = ballRef.current

      // ----- timers -----
      if (phase === "countdown") {
        if (now - lastTickRef.current >= 800) {
          countdownRef.current -= 1
          lastTickRef.current = now
          if (countdownRef.current <= 0) {
            setPhase("playing")
            phaseRef.current = "playing"
            lastTickRef.current = now
          }
        }
      } else if (phase === "playing") {
        if (now - lastTickRef.current >= 1000) {
          timeRef.current -= 1
          lastTickRef.current = now
          setTimeLeft(timeRef.current)
          if (timeRef.current <= 0) {
            setPhase("over")
            phaseRef.current = "over"
          }
        }
      } else if (phase === "goal") {
        goalTimerRef.current -= 1
        if (goalTimerRef.current <= 0) {
          resetPositions(p1, p2, ball)
          if (timeRef.current <= 0) {
            setPhase("over")
            phaseRef.current = "over"
          } else {
            countdownRef.current = 3
            setPhase("countdown")
            phaseRef.current = "countdown"
            lastTickRef.current = now
          }
        }
      }

      const active = phase === "playing"

      // ----- input / control -----
      const controlPlayer = (p: Player, left: boolean, right: boolean, jump: boolean, kick: boolean) => {
        if (left) {
          p.vx -= PLAYER_ACCEL
          p.facing = -1
        }
        if (right) {
          p.vx += PLAYER_ACCEL
          p.facing = 1
        }
        p.vx = Math.max(-PLAYER_SPEED, Math.min(PLAYER_SPEED, p.vx))
        if (jump && p.onGround) {
          p.vy = JUMP_V
          p.onGround = false
        }
        if (kick && p.kickTimer <= 0) {
          p.kickTimer = 14
        }
      }

      if (active) {
        // Player 1: A/D move, W jump, F kick
        controlPlayer(
          p1,
          keys.current["a"],
          keys.current["d"],
          keys.current["w"],
          keys.current["f"],
        )

        if (modeRef.current === "two") {
          // Player 2: arrows + L kick
          controlPlayer(
            p2,
            keys.current["arrowleft"],
            keys.current["arrowright"],
            keys.current["arrowup"],
            keys.current["l"],
          )
        } else {
          // CPU
          const diff = ball.x - p2.x
          const aiLeft = diff < -18
          const aiRight = diff > 18
          // jump if ball is high and near
          const near = Math.abs(diff) < 120
          const aiJump = near && ball.y < GROUND_Y - 120 && p2.onGround && Math.random() < 0.06
          // kick if ball close
          const aiKick = Math.abs(ball.x - p2.x) < KICK_RANGE && Math.abs(ball.y - p2.y) < 70
          // defend: if ball is behind (to the right of) cpu near own goal, prioritize getting goal-side
          controlPlayer(p2, aiLeft, aiRight, aiJump, aiKick)
        }
      }

      // ----- physics: players -----
      const integratePlayer = (p: Player) => {
        if (p.kickTimer > 0) p.kickTimer -= 1
        p.vy += GRAVITY
        p.x += p.vx
        p.y += p.vy
        if (!active) p.vx *= 0.8
        p.vx *= 0.82
        if (p.y >= GROUND_Y) {
          p.y = GROUND_Y
          p.vy = 0
          p.onGround = true
        }
        // walls
        p.x = Math.max(R_PLAYER, Math.min(W - R_PLAYER, p.x))
      }
      integratePlayer(p1)
      integratePlayer(p2)

      // player-player collision (simple push)
      {
        const dx = p2.x - p1.x
        const dist = Math.abs(dx)
        const minDist = R_PLAYER * 1.5
        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / 2
          const dir = dx / dist
          p1.x -= dir * overlap
          p2.x += dir * overlap
        }
      }

      // ----- physics: ball -----
      if (phase === "playing" || phase === "goal" || phase === "countdown") {
        ball.vy += GRAVITY * 0.75
        ball.vx *= AIR_FRICTION
        ball.x += ball.vx
        ball.y += ball.vy
        ball.spin += ball.vx * 0.05

        // ground
        if (ball.y >= GROUND_Y + (R_PLAYER - R_BALL)) {
          ball.y = GROUND_Y + (R_PLAYER - R_BALL)
          ball.vy *= -0.62
          ball.vx *= FRICTION
          if (Math.abs(ball.vy) < 1.5) ball.vy = 0
        }
        // ceiling
        if (ball.y < R_BALL) {
          ball.y = R_BALL
          ball.vy *= -0.6
        }

        // side walls (but allow going into goal mouth area)
        const inGoalHeight = ball.y > GROUND_Y - GOAL_H
        if (ball.x < R_BALL) {
          if (!inGoalHeight || ball.x < R_BALL) {
            // left wall — but if within goal, let it pass for goal detection
            if (!inGoalHeight) {
              ball.x = R_BALL
              ball.vx *= -0.6
            } else {
              ball.x = R_BALL
              ball.vx *= -0.6
            }
          }
        }
        if (ball.x > W - R_BALL) {
          if (!inGoalHeight) {
            ball.x = W - R_BALL
            ball.vx *= -0.6
          } else {
            ball.x = W - R_BALL
            ball.vx *= -0.6
          }
        }

        // goal posts collision (crossbar) — top of goal
        const barY = GROUND_Y - GOAL_H
        // left goal crossbar
        if (ball.x < GOAL_W + R_BALL && Math.abs(ball.y - barY) < R_BALL + 4 && ball.x > R_BALL) {
          ball.y = barY - R_BALL
          ball.vy *= -0.5
        }
        // right goal crossbar
        if (ball.x > W - GOAL_W - R_BALL && Math.abs(ball.y - barY) < R_BALL + 4 && ball.x < W - R_BALL) {
          ball.y = barY - R_BALL
          ball.vy *= -0.5
        }
      }

      // ball-player collision + kick
      const collideBall = (p: Player) => {
        const dx = ball.x - p.x
        const dy = ball.y - p.y
        const dist = Math.hypot(dx, dy)
        const minDist = R_PLAYER + R_BALL
        if (dist < minDist && dist > 0) {
          const nx = dx / dist
          const ny = dy / dist
          // separate
          const overlap = minDist - dist
          ball.x += nx * overlap
          ball.y += ny * overlap
          // transfer momentum
          const bounce = 4 + Math.hypot(p.vx, p.vy) * 0.6
          ball.vx = nx * bounce + p.vx * 0.7
          ball.vy = ny * bounce + p.vy * 0.5 - 2
        }
        // kick impulse
        if (p.kickTimer > 8) {
          const kx = p.x + p.facing * (R_PLAYER + 6)
          const ky = p.y - 6
          const kdist = Math.hypot(ball.x - kx, ball.y - ky)
          if (kdist < KICK_RANGE) {
            ball.vx = p.facing * KICK_POWER + p.vx
            ball.vy = -8
          }
        }
      }
      if (phase === "playing" || phase === "goal") {
        collideBall(p1)
        collideBall(p2)
      }

      // ----- goal detection -----
      if (phase === "playing") {
        const inHeight = ball.y > GROUND_Y - GOAL_H + 6
        // right goal (player 1 / left scores)
        if (ball.x > W - GOAL_W + R_BALL && inHeight) {
          scoreGoal("L")
        }
        // left goal (player 2 / right scores)
        else if (ball.x < GOAL_W - R_BALL && inHeight) {
          scoreGoal("R")
        }
      }

      // ----- particles -----
      const parts = particlesRef.current
      for (let i = parts.length - 1; i >= 0; i--) {
        const pt = parts[i]
        pt.vy += 0.35
        pt.x += pt.vx
        pt.y += pt.vy
        pt.life -= 0.02
        if (pt.life <= 0) parts.splice(i, 1)
      }

      // =========================================================
      // ----- RENDER -----
      // =========================================================
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, "#1e3a8a")
      sky.addColorStop(0.6, "#2563eb")
      sky.addColorStop(1, "#1d4ed8")
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // stadium stands
      ctx.fillStyle = "#0f172a"
      ctx.fillRect(0, 0, W, 70)
      // crowd dots
      for (let i = 0; i < 120; i++) {
        const cx = (i * 53) % W
        const cy = 12 + ((i * 37) % 48)
        ctx.fillStyle = ["#f59e0b", "#ef4444", "#22c55e", "#e2e8f0", "#a855f7"][i % 5]
        ctx.globalAlpha = 0.7
        ctx.fillRect(cx, cy, 5, 5)
      }
      ctx.globalAlpha = 1

      // field
      const grad = ctx.createLinearGradient(0, GROUND_Y - 10, 0, H)
      grad.addColorStop(0, "#16a34a")
      grad.addColorStop(1, "#15803d")
      ctx.fillStyle = grad
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
      // stripes
      ctx.fillStyle = "rgba(255,255,255,0.04)"
      for (let i = 0; i < W; i += 80) {
        if ((i / 80) % 2 === 0) ctx.fillRect(i, GROUND_Y, 40, H - GROUND_Y)
      }
      // center line
      ctx.strokeStyle = "rgba(255,255,255,0.25)"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(W / 2, GROUND_Y)
      ctx.lineTo(W / 2, H)
      ctx.stroke()

      // goals
      const drawGoal = (side: "L" | "R") => {
        const gx = side === "L" ? 0 : W - GOAL_W
        const barY = GROUND_Y - GOAL_H
        ctx.strokeStyle = "#f8fafc"
        ctx.lineWidth = 6
        // net background
        ctx.fillStyle = "rgba(255,255,255,0.08)"
        ctx.fillRect(gx, barY, GOAL_W, GOAL_H)
        // net grid
        ctx.strokeStyle = "rgba(255,255,255,0.22)"
        ctx.lineWidth = 1
        for (let x = gx; x <= gx + GOAL_W; x += 12) {
          ctx.beginPath()
          ctx.moveTo(x, barY)
          ctx.lineTo(x, GROUND_Y)
          ctx.stroke()
        }
        for (let y = barY; y <= GROUND_Y; y += 12) {
          ctx.beginPath()
          ctx.moveTo(gx, y)
          ctx.lineTo(gx + GOAL_W, y)
          ctx.stroke()
        }
        // frame
        ctx.strokeStyle = "#f8fafc"
        ctx.lineWidth = 6
        ctx.beginPath()
        if (side === "L") {
          ctx.moveTo(gx + GOAL_W, GROUND_Y)
          ctx.lineTo(gx + GOAL_W, barY)
          ctx.lineTo(gx, barY)
        } else {
          ctx.moveTo(gx, GROUND_Y)
          ctx.lineTo(gx, barY)
          ctx.lineTo(gx + GOAL_W, barY)
        }
        ctx.stroke()
      }
      drawGoal("L")
      drawGoal("R")

      // shadows
      const drawShadow = (x: number, scale: number) => {
        ctx.fillStyle = "rgba(0,0,0,0.25)"
        ctx.beginPath()
        ctx.ellipse(x, GROUND_Y + R_PLAYER - 4, R_PLAYER * scale, 8, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      drawShadow(p1.x, 1)
      drawShadow(p2.x, 1)
      drawShadow(ball.x, 0.5)

      // players (big-head style, original characters)
      const drawPlayer = (p: Player) => {
        const bodyY = p.y
        // body circle
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, bodyY, R_PLAYER, 0, Math.PI * 2)
        ctx.fill()
        // jersey stripe
        ctx.fillStyle = p.accent
        ctx.beginPath()
        ctx.arc(p.x, bodyY, R_PLAYER, Math.PI * 0.15, Math.PI * 0.85)
        ctx.fill()
        // head
        const headY = bodyY - R_PLAYER - 12
        ctx.fillStyle = "#f2c79a"
        ctx.beginPath()
        ctx.arc(p.x, headY, 20, 0, Math.PI * 2)
        ctx.fill()
        // hair
        ctx.fillStyle = "#3b2a1a"
        ctx.beginPath()
        ctx.arc(p.x, headY - 4, 20, Math.PI, Math.PI * 2)
        ctx.fill()
        // eyes
        ctx.fillStyle = "#0f172a"
        ctx.beginPath()
        ctx.arc(p.x + p.facing * 6, headY - 2, 2.6, 0, Math.PI * 2)
        ctx.fill()
        // foot / kick
        const kicking = p.kickTimer > 6
        ctx.strokeStyle = p.color
        ctx.lineWidth = 10
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(p.x, bodyY + R_PLAYER - 6)
        if (kicking) {
          ctx.lineTo(p.x + p.facing * (R_PLAYER + 14), bodyY + R_PLAYER - 20)
        } else {
          ctx.lineTo(p.x + p.facing * 10, bodyY + R_PLAYER + 8)
        }
        ctx.stroke()
        // shoe
        ctx.fillStyle = "#0f172a"
        const footX = kicking ? p.x + p.facing * (R_PLAYER + 16) : p.x + p.facing * 12
        const footY = kicking ? bodyY + R_PLAYER - 20 : bodyY + R_PLAYER + 8
        ctx.beginPath()
        ctx.ellipse(footX, footY, 9, 5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      drawPlayer(p1)
      drawPlayer(p2)

      // ball
      ctx.save()
      ctx.translate(ball.x, ball.y)
      ctx.rotate(ball.spin)
      ctx.fillStyle = "#ffffff"
      ctx.beginPath()
      ctx.arc(0, 0, R_BALL, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "#111827"
      ctx.lineWidth = 2
      ctx.stroke()
      // pentagon accents
      ctx.fillStyle = "#111827"
      ctx.beginPath()
      ctx.arc(0, 0, 5, 0, Math.PI * 2)
      ctx.fill()
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // particles
      for (const pt of parts) {
        ctx.globalAlpha = Math.max(0, pt.life)
        ctx.fillStyle = pt.color
        ctx.fillRect(pt.x, pt.y, 5, 5)
      }
      ctx.globalAlpha = 1

      // countdown / goal overlays
      if (phase === "countdown") {
        ctx.fillStyle = "rgba(0,0,0,0.35)"
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = "#ffffff"
        ctx.font = "bold 120px system-ui, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(countdownRef.current > 0 ? String(countdownRef.current) : "GO!", W / 2, H / 2)
      }
      if (phase === "goal") {
        ctx.fillStyle = "rgba(0,0,0,0.25)"
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = "#fbbf24"
        ctx.font = "bold 90px system-ui, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.strokeStyle = "#0f172a"
        ctx.lineWidth = 6
        ctx.strokeText("GOAL!", W / 2, H / 2)
        ctx.fillText("GOAL!", W / 2, H / 2)
      }

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [scoreGoal])

  const winner =
    scoreL > scoreR ? "Red Wins!" : scoreR > scoreL ? "Blue Wins!" : "It's a Draw!"

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-3">
      {/* Scoreboard */}
      <div className="flex w-full items-center justify-between rounded-xl bg-slate-800/80 px-5 py-3 text-white shadow-lg ring-1 ring-white/10">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full bg-red-500" />
          <span className="text-sm font-semibold uppercase tracking-wide text-red-200">Red</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="min-w-10 text-center text-3xl font-black tabular-nums">{scoreL}</span>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-widest text-slate-400">Time</span>
            <span className="text-xl font-bold tabular-nums text-amber-300">
              {String(Math.max(0, Math.floor(timeLeft / 60))).padStart(1, "0")}:
              {String(Math.max(0, timeLeft % 60)).padStart(2, "0")}
            </span>
          </div>
          <span className="min-w-10 text-center text-3xl font-black tabular-nums">{scoreR}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold uppercase tracking-wide text-blue-200">
            {mode === "cpu" ? "CPU" : "Blue"}
          </span>
          <span className="h-4 w-4 rounded-full bg-blue-500" />
        </div>
      </div>

      {/* Canvas stage */}
      <div className="relative w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block h-auto w-full touch-none select-none"
        />

        {/* Menu overlay */}
        {phase === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-slate-950/70 backdrop-blur-sm">
            <div className="text-center">
              <h1 className="text-5xl font-black tracking-tight text-white drop-shadow-lg">
                Soccer <span className="text-amber-400">Legends</span>
              </h1>
              <p className="mt-2 text-sm text-slate-300">
                Head-to-head arcade football. First to the final whistle with the most goals wins!
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => startMatch("cpu")}
                className="rounded-xl bg-amber-400 px-8 py-3 text-lg font-bold text-slate-900 shadow-lg transition hover:scale-105 hover:bg-amber-300"
              >
                1 Player (vs CPU)
              </button>
              <button
                onClick={() => startMatch("two")}
                className="rounded-xl bg-white px-8 py-3 text-lg font-bold text-slate-900 shadow-lg transition hover:scale-105 hover:bg-slate-200"
              >
                2 Players
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-10 gap-y-1 text-center text-xs text-slate-300">
              <div>
                <p className="font-bold text-red-300">Red</p>
                <p>A / D move · W jump · F kick</p>
              </div>
              <div>
                <p className="font-bold text-blue-300">Blue</p>
                <p>← / → move · ↑ jump · L kick</p>
              </div>
            </div>
          </div>
        )}

        {/* Game over overlay */}
        {phase === "over" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-slate-950/80 backdrop-blur-sm">
            <h2 className="text-4xl font-black text-white">Full Time</h2>
            <div className="flex items-center gap-6 text-white">
              <span className="text-2xl font-bold text-red-300">Red {scoreL}</span>
              <span className="text-slate-400">—</span>
              <span className="text-2xl font-bold text-blue-300">
                {mode === "cpu" ? "CPU" : "Blue"} {scoreR}
              </span>
            </div>
            <p className="text-3xl font-black text-amber-400">{winner}</p>
            <div className="flex gap-3">
              <button
                onClick={() => startMatch(mode)}
                className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-slate-900 shadow-lg transition hover:scale-105 hover:bg-amber-300"
              >
                Rematch
              </button>
              <button
                onClick={() => {
                  setPhase("menu")
                  phaseRef.current = "menu"
                }}
                className="rounded-xl bg-white/10 px-6 py-3 font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
              >
                Menu
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile / touch controls */}
      {(phase === "playing" || phase === "countdown" || phase === "goal") && (
        <div className="flex w-full select-none items-center justify-between gap-2 sm:hidden">
          <div className="flex gap-2">
            <TouchBtn label="←" k="a" keys={keys} />
            <TouchBtn label="→" k="d" keys={keys} />
          </div>
          <div className="flex gap-2">
            <TouchBtn label="JUMP" k="w" keys={keys} />
            <TouchBtn label="KICK" k="f" keys={keys} />
          </div>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        Tip: time your <span className="font-semibold text-slate-200">kick</span> as the ball comes to
        you, and <span className="font-semibold text-slate-200">jump</span> to reach high balls.
      </p>
    </div>
  )
}

function TouchBtn({
  label,
  k,
  keys,
}: {
  label: string
  k: string
  keys: React.MutableRefObject<Record<string, boolean>>
}) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault()
        keys.current[k] = true
      }}
      onPointerUp={() => {
        keys.current[k] = false
      }}
      onPointerLeave={() => {
        keys.current[k] = false
      }}
      className="h-14 min-w-14 rounded-xl bg-slate-700 px-4 text-sm font-bold text-white shadow active:bg-slate-500"
    >
      {label}
    </button>
  )
}
