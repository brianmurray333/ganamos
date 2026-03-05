'use client'

import { useState, useRef, useEffect } from 'react'

const BASE_URL = 'https://www.ganamos.earth'

type DemoStep = 'input' | 'invoice' | 'preimage' | 'creating' | 'success' | 'error'

function StatusDot({ color = 'green' }: { color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'bg-emerald-400 shadow-emerald-400/50',
    orange: 'bg-orange-400 shadow-orange-400/50',
    red: 'bg-red-400 shadow-red-400/50',
    blue: 'bg-sky-400 shadow-sky-400/50',
    cyan: 'bg-cyan-400 shadow-cyan-400/50',
    yellow: 'bg-amber-400 shadow-amber-400/50',
    purple: 'bg-violet-400 shadow-violet-400/50',
  }
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full shadow-[0_0_6px] ${colorMap[color] || colorMap.green}`} />
  )
}

function TerminalLine({ prefix, text, color = 'text-neutral-400' }: { prefix: string; text: string; color?: string }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-neutral-600 shrink-0 text-[11px] font-mono select-none">{prefix}</span>
      <span className={`text-[11px] font-mono break-all ${color}`}>{text}</span>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="text-[9px] font-mono tracking-wider text-neutral-500 hover:text-emerald-400 border border-neutral-700 hover:border-emerald-400/30 px-1.5 py-0.5 bg-[#0a0a0a] transition-colors"
    >
      {copied ? 'COPIED' : 'COPY'}
    </button>
  )
}

export default function DemoPage() {
  const [step, setStep] = useState<DemoStep>('input')
  const [description, setDescription] = useState('')
  const [reward, setReward] = useState('100')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // L402 challenge state
  const [macaroon, setMacaroon] = useState('')
  const [invoice, setInvoice] = useState('')
  const [totalAmount, setTotalAmount] = useState(0)
  const [apiFee, setApiFee] = useState(0)

  // Preimage input
  const [preimage, setPreimage] = useState('')

  // Success state
  const [postId, setPostId] = useState('')
  const [paymentHash, setPaymentHash] = useState('')

  // Terminal log
  const [logs, setLogs] = useState<Array<{ prefix: string; text: string; color?: string }>>([])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const addLog = (prefix: string, text: string, color?: string) => {
    setLogs(prev => [...prev, { prefix, text, color }])
  }

  const clearLogs = () => setLogs([])

  const handleRequestInvoice = async () => {
    if (!description.trim()) {
      setError('Description is required')
      return
    }

    const rewardNum = parseInt(reward) || 0
    if (rewardNum < 0) {
      setError('Reward must be non-negative')
      return
    }

    setLoading(true)
    setError('')
    clearLogs()

    addLog('$', `curl -X POST ${BASE_URL}/api/posts \\`, 'text-emerald-400/80')
    addLog(' ', `  -H "Content-Type: application/json" \\`, 'text-emerald-400/80')
    addLog(' ', `  -d '{"description": "${description}", "reward": ${rewardNum}}'`, 'text-emerald-400/80')
    addLog('>', 'Sending request...', 'text-neutral-500')

    try {
      const res = await fetch(`${BASE_URL}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), reward: rewardNum }),
      })

      const data = await res.json()

      if (res.status === 402) {
        const wwwAuth = res.headers.get('WWW-Authenticate') || ''
        const macMatch = wwwAuth.match(/macaroon="([^"]+)"/)
        const invMatch = wwwAuth.match(/invoice="([^"]+)"/)

        const mac = macMatch?.[1] || data.macaroon || ''
        const inv = invMatch?.[1] || data.payment_request || ''

        setMacaroon(mac)
        setInvoice(inv)
        setTotalAmount(data.total_amount || 0)
        setApiFee(data.api_fee || 10)

        addLog('<', `HTTP 402 Payment Required`, 'text-amber-400')
        addLog(' ', `Total: ${data.total_amount} sats (${data.job_reward} reward + ${data.api_fee} fee)`, 'text-neutral-400')
        addLog(' ', `Invoice ready. Pay with any Lightning wallet.`, 'text-emerald-400/80')

        setStep('invoice')
      } else {
        addLog('<', `HTTP ${res.status}: ${data.error || 'Unexpected response'}`, 'text-red-400')
        setError(data.error || 'Unexpected response from server')
      }
    } catch (err: any) {
      addLog('!', `Network error: ${err.message}`, 'text-red-400')
      setError(`Network error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitPreimage = async () => {
    if (!preimage.trim()) {
      setError('Paste the preimage from your Lightning wallet')
      return
    }

    setLoading(true)
    setError('')

    const l402Token = `${macaroon}:${preimage.trim()}`
    const rewardNum = parseInt(reward) || 0

    addLog('$', `curl -X POST ${BASE_URL}/api/posts \\`, 'text-emerald-400/80')
    addLog(' ', `  -H "Authorization: L402 ${macaroon.slice(0, 20)}...:${preimage.trim().slice(0, 12)}..." \\`, 'text-emerald-400/80')
    addLog(' ', `  -H "Content-Type: application/json" \\`, 'text-emerald-400/80')
    addLog(' ', `  -d '{"description": "${description}", "reward": ${rewardNum}}'`, 'text-emerald-400/80')
    addLog('>', 'Authenticating with L402 token...', 'text-neutral-500')

    setStep('creating')

    try {
      const res = await fetch(`${BASE_URL}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `L402 ${l402Token}`,
        },
        body: JSON.stringify({ description: description.trim(), reward: rewardNum }),
      })

      const data = await res.json()

      if (res.status === 201 && data.success) {
        setPostId(data.post_id)
        setPaymentHash(data.payment_hash)

        addLog('<', `HTTP 201 Created`, 'text-emerald-400')
        addLog(' ', `Post ID: ${data.post_id}`, 'text-neutral-300')
        addLog(' ', `Reward: ${data.job_reward} sats`, 'text-neutral-400')
        addLog(' ', `Total paid: ${data.total_paid} sats`, 'text-neutral-400')
        addLog(' ', `Payment hash: ${data.payment_hash}`, 'text-neutral-500')
        addLog('*', `Post is now LIVE on Ganamos!`, 'text-emerald-400')

        setStep('success')
      } else {
        addLog('<', `HTTP ${res.status}: ${data.error}`, 'text-red-400')
        setError(data.error || 'Failed to create post')
        setStep('preimage')
      }
    } catch (err: any) {
      addLog('!', `Network error: ${err.message}`, 'text-red-400')
      setError(`Network error: ${err.message}`)
      setStep('preimage')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setStep('input')
    setDescription('')
    setReward('100')
    setLoading(false)
    setError('')
    setMacaroon('')
    setInvoice('')
    setTotalAmount(0)
    setApiFee(0)
    setPreimage('')
    setPostId('')
    setPaymentHash('')
    clearLogs()
  }

  return (
    <div className="min-h-screen bg-[#060606] text-neutral-400 font-mono selection:bg-emerald-400/20 selection:text-emerald-200">
      {/* Header */}
      <div className="border-b border-[#151515] bg-[#080808] sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/docs" className="text-emerald-400 text-sm hover:text-emerald-300 transition-colors">⚡</a>
            <span className="text-[11px] tracking-[0.25em] text-neutral-300 uppercase">Ganamos API</span>
            <span className="text-[9px] tracking-wider text-amber-400/80 border border-amber-400/20 px-1.5 py-0.5">LIVE DEMO</span>
          </div>
          <a
            href="/docs"
            className="text-[10px] tracking-wider text-neutral-600 hover:text-emerald-400 transition-colors"
          >
            ← DOCS
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        {/* Title */}
        <div className="pt-8 pb-6 border-b border-[#151515]">
          <div className="flex items-center gap-2.5 mb-3">
            <StatusDot color="green" />
            <h1 className="text-[11px] tracking-[0.2em] text-neutral-300 uppercase">L402 Live Demo</h1>
          </div>
          <p className="text-[11px] text-neutral-600 leading-relaxed max-w-xl">
            Post a real job to the Ganamos marketplace using the L402 protocol. Pay with Lightning, get your post live in seconds. This uses the production API with real Bitcoin.
          </p>
        </div>

        {/* Flow indicator */}
        <div className="py-4 flex items-center gap-0 border-b border-[#111]">
          {[
            { id: 'input', label: 'DESCRIBE', n: 1 },
            { id: 'invoice', label: 'PAY', n: 2 },
            { id: 'preimage', label: 'PROVE', n: 3 },
            { id: 'success', label: 'LIVE', n: 4 },
          ].map((s, i) => {
            const isActive = s.id === step || (s.id === 'preimage' && step === 'creating')
            const isDone =
              (s.id === 'input' && step !== 'input') ||
              (s.id === 'invoice' && ['preimage', 'creating', 'success'].includes(step)) ||
              (s.id === 'preimage' && step === 'success')

            return (
              <div key={s.id} className="flex items-center gap-0">
                <div className={`flex items-center gap-2 px-3 py-1.5 ${
                  isActive ? 'bg-emerald-400/5 border border-emerald-400/20' :
                  isDone ? 'opacity-50' : 'opacity-30'
                }`}>
                  <span className={`text-[10px] font-mono ${
                    isDone ? 'text-emerald-400' :
                    isActive ? 'text-emerald-400' : 'text-neutral-600'
                  }`}>
                    {isDone ? '✓' : String(s.n).padStart(2, '0')}
                  </span>
                  <span className={`text-[9px] tracking-[0.15em] ${
                    isActive ? 'text-neutral-300' : 'text-neutral-600'
                  }`}>{s.label}</span>
                </div>
                {i < 3 && <span className="text-neutral-800 text-[10px] px-1">→</span>}
              </div>
            )
          })}
        </div>

        {/* Main content area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 mt-0">
          {/* Left: Interactive form */}
          <div className="border-r-0 lg:border-r border-[#111] pr-0 lg:pr-6 py-6">
            {step === 'input' && (
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] tracking-[0.2em] text-neutral-600 uppercase block mb-2">Job Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What needs to be done? e.g. Retweet this post, fix the bug in issue #42..."
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] focus:border-emerald-400/30 text-neutral-300 text-xs font-mono p-3 h-24 resize-none outline-none placeholder:text-neutral-700 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[9px] tracking-[0.2em] text-neutral-600 uppercase block mb-2">Reward (sats)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={reward}
                      onChange={e => setReward(e.target.value)}
                      min="0"
                      className="w-32 bg-[#0a0a0a] border border-[#1a1a1a] focus:border-emerald-400/30 text-neutral-300 text-xs font-mono p-2 outline-none transition-colors"
                    />
                    <span className="text-[10px] text-neutral-600">+ 10 sat API fee</span>
                  </div>
                </div>
                <div className="text-[10px] text-neutral-600 border border-[#151515] p-3">
                  <div className="flex justify-between py-0.5">
                    <span>Reward</span>
                    <span className="text-neutral-400">{parseInt(reward) || 0} sats</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>API fee</span>
                    <span className="text-neutral-400">10 sats</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-t border-[#1a1a1a] mt-1 pt-1">
                    <span className="text-neutral-400">Total</span>
                    <span className="text-emerald-400">{(parseInt(reward) || 0) + 10} sats</span>
                  </div>
                </div>
                <button
                  onClick={handleRequestInvoice}
                  disabled={loading || !description.trim()}
                  className="w-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-[10px] tracking-[0.15em] py-2.5 hover:bg-emerald-400/15 hover:border-emerald-400/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase"
                >
                  {loading ? 'Requesting invoice...' : 'Get Lightning Invoice'}
                </button>
              </div>
            )}

            {step === 'invoice' && (
              <div className="space-y-4">
                <div className="border border-amber-400/10 bg-amber-400/[0.03] p-3">
                  <div className="text-[9px] tracking-[0.15em] text-amber-400/80 mb-2">LIGHTNING INVOICE</div>
                  <div className="text-[10px] text-neutral-500 mb-3">
                    Pay <span className="text-amber-400">{totalAmount} sats</span> with any Lightning wallet (Alby, Phoenix, Muun, etc.)
                  </div>
                  <div className="relative">
                    <pre className="bg-[#0a0a0a] border border-[#1a1a1a] p-2 text-[9px] text-emerald-300/60 break-all whitespace-pre-wrap max-h-20 overflow-y-auto">
                      {invoice}
                    </pre>
                    <div className="absolute top-1 right-1">
                      <CopyButton text={invoice} />
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-neutral-600 leading-relaxed">
                  After paying, your wallet will show a <span className="text-neutral-400">preimage</span> (64-character hex string). Paste it below.
                </div>

                <div>
                  <label className="text-[9px] tracking-[0.2em] text-neutral-600 uppercase block mb-2">Payment Preimage</label>
                  <input
                    type="text"
                    value={preimage}
                    onChange={e => setPreimage(e.target.value)}
                    placeholder="e.g. 6496c2a5124bb7d849750a06..."
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] focus:border-emerald-400/30 text-neutral-300 text-xs font-mono p-2 outline-none placeholder:text-neutral-700 transition-colors"
                    onPaste={() => setStep('preimage')}
                  />
                </div>

                <button
                  onClick={() => {
                    if (preimage.trim()) {
                      setStep('preimage')
                    }
                  }}
                  disabled={!preimage.trim()}
                  className="w-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-[10px] tracking-[0.15em] py-2.5 hover:bg-emerald-400/15 hover:border-emerald-400/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase"
                >
                  I&apos;ve paid — Continue
                </button>
              </div>
            )}

            {(step === 'preimage' || step === 'creating') && (
              <div className="space-y-4">
                <div className="border border-emerald-400/10 bg-emerald-400/[0.03] p-3">
                  <div className="text-[9px] tracking-[0.15em] text-emerald-400/80 mb-2">READY TO POST</div>
                  <div className="text-[10px] text-neutral-500">
                    Your L402 token is constructed from the macaroon + your preimage.
                    Click below to authenticate and create the post.
                  </div>
                </div>

                <div className="text-[10px] text-neutral-600 border border-[#151515] p-3 space-y-1">
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-700 shrink-0">Description:</span>
                    <span className="text-neutral-400 break-all">{description}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-700 shrink-0">Reward:</span>
                    <span className="text-neutral-400">{parseInt(reward) || 0} sats</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-700 shrink-0">Preimage:</span>
                    <span className="text-neutral-400 break-all text-[9px]">{preimage.slice(0, 16)}...{preimage.slice(-8)}</span>
                  </div>
                </div>

                <button
                  onClick={handleSubmitPreimage}
                  disabled={loading}
                  className="w-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-[10px] tracking-[0.15em] py-2.5 hover:bg-emerald-400/15 hover:border-emerald-400/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase"
                >
                  {loading ? 'Creating post...' : 'Create Post with L402 Token'}
                </button>
              </div>
            )}

            {step === 'success' && (
              <div className="space-y-4">
                <div className="border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <StatusDot color="green" />
                    <span className="text-[10px] tracking-[0.15em] text-emerald-400 uppercase">Post is Live</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed mb-3">
                    Your job is now on the Ganamos marketplace. Anyone (human or AI agent) can submit a fix and earn {parseInt(reward) || 0} sats.
                  </p>
                  <a
                    href={`${BASE_URL}/issue/${postId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 text-[10px] tracking-[0.15em] py-2.5 hover:bg-emerald-400/20 transition-colors uppercase"
                  >
                    View Live Post →
                  </a>
                </div>

                <div className="text-[10px] text-neutral-600 border border-[#151515] p-3 space-y-1">
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-700 shrink-0">Post ID:</span>
                    <span className="text-neutral-400 break-all text-[9px]">{postId}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-700 shrink-0">Payment:</span>
                    <span className="text-neutral-400 break-all text-[9px]">{paymentHash}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-700 shrink-0">Status URL:</span>
                    <a
                      href={`${BASE_URL}/api/posts/${postId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400/70 hover:text-emerald-400 break-all text-[9px] underline underline-offset-2 decoration-emerald-400/30 transition-colors"
                    >
                      {BASE_URL}/api/posts/{postId}
                    </a>
                  </div>
                </div>

                <div className="border border-neutral-800 p-3">
                  <div className="text-[9px] tracking-[0.15em] text-neutral-600 mb-2">WHAT&apos;S NEXT?</div>
                  <div className="space-y-1 text-[10px] text-neutral-500">
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-500/40 shrink-0">▸</span>
                      <span>Save your L402 token to poll for fix submissions</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-500/40 shrink-0">▸</span>
                      <span>Use <code className="text-neutral-400">GET /api/posts/{'{id}'}</code> with the same token to check status</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-500/40 shrink-0">▸</span>
                      <span>When a fix is submitted, approve it with <code className="text-neutral-400">POST /api/posts/{'{id}'}/approve</code></span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleReset}
                  className="w-full border border-neutral-700 text-neutral-500 text-[10px] tracking-[0.15em] py-2 hover:text-neutral-300 hover:border-neutral-600 transition-colors uppercase"
                >
                  Post Another Job
                </button>
              </div>
            )}

            {error && (
              <div className="mt-3 border border-red-400/20 bg-red-400/[0.03] p-2.5">
                <span className="text-[10px] text-red-400/80 font-mono">{error}</span>
              </div>
            )}
          </div>

          {/* Right: Terminal output */}
          <div className="pl-0 lg:pl-6 py-6">
            <div className="text-[9px] tracking-[0.2em] text-neutral-700 uppercase mb-2">Terminal Output</div>
            <div
              ref={logRef}
              className="bg-[#0a0a0a] border border-[#1a1a1a] p-3 h-80 overflow-y-auto"
            >
              {logs.length === 0 ? (
                <div className="text-[10px] text-neutral-700 italic">
                  Waiting for first request...
                </div>
              ) : (
                logs.map((log, i) => (
                  <TerminalLine key={i} prefix={log.prefix} text={log.text} color={log.color} />
                ))
              )}
            </div>
            <div className="mt-3 text-[9px] text-neutral-700 leading-relaxed">
              This terminal shows the actual HTTP requests and responses between your browser and the Ganamos API. The same flow works from any HTTP client (curl, Python, your AI agent).
            </div>
          </div>
        </div>

        {/* How It Works section */}
        <div className="border-t border-[#151515] mt-4 pt-6">
          <div className="flex items-center gap-2.5 mb-4">
            <StatusDot color="cyan" />
            <h2 className="text-[11px] tracking-[0.2em] text-neutral-300 uppercase">How L402 Works</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                n: '01',
                title: 'REQUEST',
                desc: 'Send a POST request. The server returns HTTP 402 with a Lightning invoice.',
                color: 'text-amber-400/70',
              },
              {
                n: '02',
                title: 'PAY',
                desc: 'Pay the invoice with any Lightning wallet. The payment proof (preimage) becomes your credential.',
                color: 'text-emerald-400/70',
              },
              {
                n: '03',
                title: 'AUTHENTICATE',
                desc: 'Retry with the L402 token (macaroon:preimage). The server verifies payment and creates your resource.',
                color: 'text-sky-400/70',
              },
            ].map(s => (
              <div key={s.n} className="border border-[#111] p-3">
                <div className={`text-[18px] font-mono font-light ${s.color} mb-1`}>{s.n}</div>
                <div className="text-[9px] tracking-[0.15em] text-neutral-400 mb-1.5">{s.title}</div>
                <div className="text-[10px] text-neutral-600 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent integration section */}
        <div className="border-t border-[#151515] mt-6 pt-6">
          <div className="flex items-center gap-2.5 mb-4">
            <StatusDot color="orange" />
            <h2 className="text-[11px] tracking-[0.2em] text-neutral-300 uppercase">For AI Agent Developers</h2>
          </div>
          <div className="text-[10px] text-neutral-600 leading-relaxed mb-4 max-w-xl">
            Your agent can use the same flow programmatically. Here&apos;s the complete lifecycle in curl:
          </div>
          <div className="relative group">
            <pre className="bg-[#0a0a0a] border border-[#1a1a1a] p-3 overflow-x-auto text-[10px] leading-[1.7] font-mono text-emerald-300/70 selection:bg-emerald-400/20">
{`# 1. Request invoice
RESPONSE=$(curl -s -X POST ${BASE_URL}/api/posts \\
  -H "Content-Type: application/json" \\
  -D - \\
  -d '{"description": "Your task here", "reward": 100}')

# 2. Extract macaroon from WWW-Authenticate header
MACAROON=$(echo "$RESPONSE" | grep -oP 'macaroon="\\K[^"]+')

# 3. Pay the invoice with your Lightning node/wallet
# ... get the PREIMAGE ...

# 4. Create the post
curl -s -X POST ${BASE_URL}/api/posts \\
  -H "Authorization: L402 $MACAROON:$PREIMAGE" \\
  -H "Content-Type: application/json" \\
  -d '{"description": "Your task here", "reward": 100}'

# 5. Poll for fix submissions (reuse same token)
curl -s ${BASE_URL}/api/posts/POST_ID \\
  -H "Authorization: L402 $MACAROON:$PREIMAGE"

# 6. Approve a fix (reuse same token)
curl -s -X POST ${BASE_URL}/api/posts/POST_ID/approve \\
  -H "Authorization: L402 $MACAROON:$PREIMAGE"`}
            </pre>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton text={`# 1. Request invoice
RESPONSE=$(curl -s -X POST ${BASE_URL}/api/posts \\
  -H "Content-Type: application/json" \\
  -D - \\
  -d '{"description": "Your task here", "reward": 100}')

# 2. Extract macaroon from WWW-Authenticate header
MACAROON=$(echo "$RESPONSE" | grep -oP 'macaroon="\\K[^"]+')

# 3. Pay the invoice with your Lightning node/wallet
# ... get the PREIMAGE ...

# 4. Create the post
curl -s -X POST ${BASE_URL}/api/posts \\
  -H "Authorization: L402 $MACAROON:$PREIMAGE" \\
  -H "Content-Type: application/json" \\
  -d '{"description": "Your task here", "reward": 100}'

# 5. Poll for fix submissions (reuse same token)
curl -s ${BASE_URL}/api/posts/POST_ID \\
  -H "Authorization: L402 $MACAROON:$PREIMAGE"

# 6. Approve a fix (reuse same token)
curl -s -X POST ${BASE_URL}/api/posts/POST_ID/approve \\
  -H "Authorization: L402 $MACAROON:$PREIMAGE"`} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-[#111] flex flex-col sm:flex-row items-center justify-between gap-2 text-[9px] text-neutral-700 tracking-wider">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500/50">⚡</span>
            <span>POWERED BY LIGHTNING NETWORK</span>
            <span className="text-neutral-800">•</span>
            <span>BUILT ON BITCOIN</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/docs" className="hover:text-emerald-400 transition-colors">API DOCS</a>
            <span className="text-neutral-800">•</span>
            <a href="https://www.ganamos.earth" className="hover:text-emerald-400 transition-colors">GANAMOS.EARTH</a>
          </div>
        </div>
      </div>

      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.015]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
        }}
      />
    </div>
  )
}
