'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Copy, Zap, ArrowRight, ExternalLink, RotateCcw, Loader2 } from 'lucide-react'
import QRCode from '@/components/qr-code'

const BASE_URL = 'https://www.ganamos.earth'

type DemoStep = 'input' | 'invoice' | 'preimage' | 'creating' | 'success' | 'error'

const STEPS = [
  { id: 'input', label: 'Describe', n: 1 },
  { id: 'invoice', label: 'Pay', n: 2 },
  { id: 'preimage', label: 'Prove', n: 3 },
  { id: 'success', label: 'Live', n: 4 },
] as const

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function StepIndicator({ step }: { step: DemoStep }) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 w-full">
      {STEPS.map((s, i) => {
        const isActive = s.id === step || (s.id === 'preimage' && step === 'creating')
        const isDone =
          (s.id === 'input' && step !== 'input') ||
          (s.id === 'invoice' && ['preimage', 'creating', 'success'].includes(step)) ||
          (s.id === 'preimage' && step === 'success')

        return (
          <div key={s.id} className="flex items-center gap-1 sm:gap-2 flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                isDone ? 'bg-green-600 text-white' :
                isActive ? 'bg-green-600 text-white' :
                'bg-muted text-muted-foreground'
              }`}>
                {isDone ? <Check className="w-3.5 h-3.5" /> : s.n}
              </div>
              <span className={`text-sm font-medium hidden sm:inline ${
                isActive ? 'text-foreground' :
                isDone ? 'text-muted-foreground' : 'text-muted-foreground/50'
              }`}>{s.label}</span>
            </div>
            {i < 3 && (
              <div className={`flex-1 h-px mx-1 ${isDone ? 'bg-green-600' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ApiLog({ logs, logRef }: {
  logs: Array<{ prefix: string; text: string; color?: string }>
  logRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-medium text-foreground mb-2">API Log</h3>
      <div
        ref={logRef}
        className="flex-1 rounded-lg bg-gray-950 border border-gray-800 p-4 min-h-[200px] max-h-[500px] overflow-y-auto font-mono text-xs"
      >
        {logs.length === 0 ? (
          <span className="text-gray-600 italic">Waiting for first request...</span>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5">
              <span className="text-gray-600 shrink-0 select-none">{log.prefix}</span>
              <span className={log.color || 'text-gray-400'}>{log.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function DemoPage() {
  const [step, setStep] = useState<DemoStep>('input')
  const [description, setDescription] = useState('')
  const [reward, setReward] = useState('100')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [macaroon, setMacaroon] = useState('')
  const [invoice, setInvoice] = useState('')
  const [totalAmount, setTotalAmount] = useState(0)
  const [apiFee, setApiFee] = useState(0)

  const [preimage, setPreimage] = useState('')

  const [postId, setPostId] = useState('')
  const [paymentHash, setPaymentHash] = useState('')

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

    addLog('$', `POST ${BASE_URL}/api/posts`, 'text-emerald-400')
    addLog('>', `{"description": "${description}", "reward": ${rewardNum}}`)

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

        setMacaroon(macMatch?.[1] || data.macaroon || '')
        setInvoice(invMatch?.[1] || data.payment_request || '')
        setTotalAmount(data.total_amount || 0)
        setApiFee(data.api_fee || 10)

        addLog('<', `402 Payment Required`, 'text-amber-400')
        addLog(' ', `Total: ${data.total_amount} sats (${data.job_reward} reward + ${data.api_fee} fee)`)
        setStep('invoice')
      } else {
        addLog('<', `${res.status}: ${data.error || 'Unexpected response'}`, 'text-red-400')
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

    addLog('$', `POST ${BASE_URL}/api/posts (with L402 token)`, 'text-emerald-400')
    addLog('>', 'Authenticating...')
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
        addLog('<', `201 Created`, 'text-emerald-400')
        addLog(' ', `Post ID: ${data.post_id}`)
        addLog('✓', `Post is live!`, 'text-emerald-400')
        setStep('success')
      } else {
        addLog('<', `${res.status}: ${data.error}`, 'text-red-400')
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

  const rewardNum = parseInt(reward) || 0

  const formContent = (
    <>
      {/* Step 1: Describe */}
      {step === 'input' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Job Description</label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What needs to be done? e.g. Retweet this post, fix the bug in issue #42..."
                className="min-h-[100px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Reward (sats)</label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={reward}
                  onChange={e => setReward(e.target.value)}
                  min="0"
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">+ 10 sat API fee</span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reward</span>
                <span>{rewardNum} sats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">API fee</span>
                <span>10 sats</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-border font-medium">
                <span>Total</span>
                <span className="text-green-600 dark:text-green-400">{rewardNum + 10} sats</span>
              </div>
            </div>

            <Button
              onClick={handleRequestInvoice}
              disabled={loading || !description.trim()}
              className="w-full bg-green-600 hover:bg-green-700 text-white h-11"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Requesting Invoice...</>
              ) : (
                <><Zap className="w-4 h-4 mr-2" />Get Lightning Invoice</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Pay */}
      {step === 'invoice' && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Lightning Invoice — {totalAmount} sats
                </h3>
                <CopyButton text={invoice} />
              </div>
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="bg-white dark:bg-gray-900 rounded-md border border-amber-200 dark:border-amber-800/30 p-3 text-xs font-mono text-muted-foreground break-all max-h-[120px] overflow-y-auto">
                    {invoice}
                  </div>
                </div>
                <div className="shrink-0 rounded-lg overflow-hidden bg-white p-1">
                  <QRCode
                    data={`lightning:${invoice}`}
                    size={112}
                    color="#000000"
                    backgroundColor="#ffffff"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Payment Preimage</label>
              <p className="text-sm text-muted-foreground">
                After paying, your wallet will show a preimage (64-character hex string). Paste it here.
              </p>
              <Input
                type="text"
                value={preimage}
                onChange={e => setPreimage(e.target.value)}
                placeholder="e.g. 6496c2a5124bb7d849750a06..."
                className="font-mono text-sm"
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text')
                  if (pasted.trim()) {
                    setPreimage(pasted.trim())
                    setStep('preimage')
                  }
                }}
              />
            </div>

            <Button
              onClick={() => {
                if (preimage.trim()) setStep('preimage')
              }}
              disabled={!preimage.trim()}
              className="w-full bg-green-600 hover:bg-green-700 text-white h-11"
            >
              I&apos;ve Paid — Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Prove */}
      {(step === 'preimage' || step === 'creating') && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 p-4">
              <h3 className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
                Ready to Post
              </h3>
              <p className="text-sm text-green-700/80 dark:text-green-400/60">
                Your L402 token is ready. Click below to authenticate and create the post.
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-20">Description</span>
                <span className="text-foreground break-all">{description}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-20">Reward</span>
                <span className="text-foreground">{rewardNum} sats</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-20">Preimage</span>
                <span className="text-foreground font-mono text-xs">{preimage.length > 24 ? `${preimage.slice(0, 16)}...${preimage.slice(-8)}` : preimage}</span>
              </div>
            </div>

            <Button
              onClick={handleSubmitPreimage}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white h-11"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating Post...</>
              ) : (
                <><Zap className="w-4 h-4 mr-2" />Create Post</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Success */}
      {step === 'success' && (
        <div className="space-y-4">
          <Card className="border-green-200 dark:border-green-800/40">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Your Job is Live!</h3>
                  <p className="text-sm text-muted-foreground">
                    Anyone can submit a fix and earn {rewardNum} sats.
                  </p>
                </div>
              </div>

              <a
                href={`${BASE_URL}/post/${postId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white h-11 mt-2">
                  View Live Post
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <h4 className="text-sm font-medium text-foreground">Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 w-24">Post ID</span>
                  <span className="text-foreground font-mono text-xs break-all">{postId}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 w-24">Payment</span>
                  <span className="text-foreground font-mono text-xs break-all">{paymentHash}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 w-24">Status URL</span>
                  <a
                    href={`${BASE_URL}/api/posts/${postId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 dark:text-green-400 hover:underline break-all text-xs font-mono"
                  >
                    /api/posts/{postId}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <h4 className="text-sm font-medium text-foreground">What&apos;s Next?</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  Save your L402 token to poll for fix submissions
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  Use <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">GET /api/posts/{'{id}'}</code> to check status
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  Approve fixes with <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">POST /api/posts/{'{id}'}/approve</code>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full h-11"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Post Another Job
          </Button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 p-3">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-16">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-semibold text-foreground">Post a Job</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Post a real job to Ganamos using Lightning. Pay with any wallet, go live in seconds.
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 max-w-xl">
          <StepIndicator step={step} />
        </div>

        {/* Two-column layout: form left, API log right on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-6">
          <div>
            {formContent}
          </div>

          {/* API log — always visible on desktop, below form on mobile */}
          <div className="hidden lg:block">
            <div className="sticky top-20">
              <ApiLog logs={logs} logRef={logRef} />
            </div>
          </div>
        </div>

        {/* API log on mobile — below the form */}
        <div className="lg:hidden mt-6">
          <ApiLog logs={logs} logRef={logRef} />
        </div>

        {/* How it works */}
        <div className="mt-10 pt-8 border-t border-border">
          <h2 className="text-base font-semibold text-foreground mb-4">How L402 Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { n: 1, title: 'Request', desc: 'Send a POST request. The server returns HTTP 402 with a Lightning invoice.', icon: '📡' },
              { n: 2, title: 'Pay', desc: 'Pay the invoice with any Lightning wallet. The payment proof (preimage) is your credential.', icon: '⚡' },
              { n: 3, title: 'Authenticate', desc: 'Retry with your L402 token. The server verifies payment and creates the resource.', icon: '🔓' },
            ].map(s => (
              <Card key={s.n}>
                <CardContent className="pt-5">
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <h3 className="text-sm font-medium text-foreground mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
