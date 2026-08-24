"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowDownIcon, ArrowUpIcon, Copy } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { formatSatsValue } from "@/lib/utils"
import { Input } from "@/components/ui/input"

type WLReact = any

export function SignetWalletTab() {
  const [wlReact, setWlReact] = useState<WLReact | null>(null)
  const [engine, setEngine] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [password, setPassword] = useState<string>("")

  // Lazily load the SDK only when this tab mounts
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const web = await import("@lightninglabs/wavelength-web")
        const react = await import("@lightninglabs/wavelength-react")

        // Assets are expected under /public/wavewalletdk/<version>/
        // Provide an ABSOLUTE same-origin base URL so the SDK's URL() constructor
        // receives a valid base (relative bases throw in new URL()).
        const baseUrl = new URL(
          `/wavewalletdk/${web.RUNTIME_MANIFEST_VERSION}/`,
          window.location.origin
        ).toString()

        // Build the client explicitly and then wrap it in an engine.
        // This path mirrors the official demo and ensures runtimeBaseUrl is
        // forwarded before start() is called.
        // Force sqlite bridge to use same-origin worker and sqlite3 URLs
        ;(globalThis as any).sqliteBridgeWorkerURL = `${baseUrl}sqlite-worker.js`
        ;(globalThis as any).sqliteBridgeSQLiteJSURL = `${baseUrl}sqlite3.js`

        const client = web.createWebClient({
          runtimeBaseUrl: baseUrl,
          debug: true,
        })
        await client.ready()
        const engine = web.createWalletEngine({
          client,
          config: web.defaultConfig("signet" as any),
          autoStart: true,
        })

        if (!mounted) return
        setWlReact(react)
        setEngine(engine)
      } catch (err: any) {
        if (!mounted) return
        const message =
          err?.message ||
          (typeof err === "string" ? err : "Failed to load Wavelength SDK") +
            "\nIf you are running locally, ensure runtime assets are present under public/wavewalletdk/<version>."
        setErrorMsg(message)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Inner UI that uses the React hooks after the provider is ready
  const Inner = useMemo(() => {
    if (!wlReact) return null
    const {
      WavelengthProvider,
      useWallet,
      useWalletBalance,
      useWalletCreate,
      useWalletUnlock,
      useWalletReceive,
      useWalletSend,
    } = wlReact

    function WalletUI() {
      const { phase: walletPhase, error } = useWallet()
      const balance = useWalletBalance()
      const { create, createPending } = useWalletCreate()
      const { unlock, unlockPending } = useWalletUnlock()
      const { receive, receivePending, receiveData, receiveError, resetReceive } = useWalletReceive()
      const { send, sendPending, sendError, resetSend } = useWalletSend()

      // Receive form state
      const [receiveAmount, setReceiveAmount] = useState<string>("")
      // Send form state
      const [sendInvoice, setSendInvoice] = useState<string>("")
      const [sendAmount, setSendAmount] = useState<string>("")
      const [copied, setCopied] = useState(false)

      const confirmed = balance?.confirmedSat ?? 0

      return (
        <div className="space-y-6">
          <Card className="mb-2 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card">
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <div className="p-3 mb-3 bg-amber-100 rounded-full dark:bg-amber-950/50">
                  <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={32} height={32} className="object-contain" />
                </div>
                <p className="text-sm text-muted-foreground mb-1">Signet Balance (Practice)</p>
                <p className="text-3xl font-bold">{formatSatsValue(confirmed)}</p>
                <p className="text-xs text-muted-foreground mt-2">Keys live only in this browser</p>
                <p className="text-xs text-muted-foreground mt-1">Not mainnet — for practice only</p>
              </div>
            </CardContent>
          </Card>

          {/* Receive */}
          <Card className="shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowDownIcon className="h-5 w-5 text-green-500" />
                <h3 className="text-lg font-medium">Receive</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Amount (sats, optional)"
                    value={receiveAmount}
                    onChange={(e) => setReceiveAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <Button
                  onClick={async () => {
                    const amt = receiveAmount ? parseInt(receiveAmount, 10) : undefined
                    await receive({ amountSat: amt })
                  }}
                  disabled={receivePending}
                >
                  Create invoice
                </Button>
              </div>
              {receiveError && <p className="text-sm text-red-500">{receiveError.message}</p>}
              {receiveData?.invoice && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">BOLT11 Invoice</div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 text-xs font-mono bg-muted border rounded-md px-3 py-2 break-all">
                      {receiveData.invoice}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-9 w-9"
                      onClick={() => {
                        navigator.clipboard.writeText(receiveData.invoice)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1200)
                      }}
                    >
                      <Copy className={`h-4 w-4 ${copied ? "text-green-600" : ""}`} />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm">
                      <Link href={`lightning:${receiveData.invoice}`}>Open Wallet</Link>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => resetReceive()}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Send */}
          <Card className="shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUpIcon className="h-5 w-5 text-red-500" />
                <h3 className="text-lg font-medium">Send</h3>
              </div>
              <textarea
                placeholder="Paste a Signet Lightning invoice (BOLT11)…"
                value={sendInvoice}
                onChange={(e) => setSendInvoice(e.target.value)}
                className="w-full min-h-24 text-sm font-mono bg-muted border rounded-md p-3"
              />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Amount (sats if invoice is amountless)"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <Button
                  onClick={async () => {
                    if (!sendInvoice.trim()) return
                    try {
                      const amt = sendAmount ? parseInt(sendAmount, 10) : undefined
                      await send({ invoice: sendInvoice.trim(), amountSat: amt })
                      resetSend()
                      setSendInvoice("")
                      setSendAmount("")
                    } catch {
                      // sendError is shown below
                    }
                  }}
                  disabled={sendPending || !sendInvoice.trim()}
                >
                  Confirm
                </Button>
              </div>
              {sendError && <p className="text-sm text-red-500">{sendError.message}</p>}
            </CardContent>
          </Card>

          {/* Onboard / Unlock helpers */}
          {walletPhase === "needsWallet" && (
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">Create a new Signet practice wallet</p>
                  <div className="flex gap-2 justify-center">
                    <Input
                      type="password"
                      placeholder="Choose a password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button
                      variant="outline"
                      disabled={createPending || !password}
                      onClick={async () => {
                        await create({ password })
                      }}
                    >
                      Create Wallet
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">We never show a seed here. Backup handled separately.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {walletPhase === "locked" && (
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">Unlock your Signet practice wallet</p>
                  <div className="flex gap-2 justify-center">
                    <Input
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button
                      variant="outline"
                      disabled={unlockPending || !password}
                      onClick={async () => {
                        await unlock({ password })
                      }}
                    >
                      Unlock Wallet
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(receiveError || sendError || error) && (
            <div className="text-xs text-red-500 space-y-1">
              <div>{receiveError?.message || sendError?.message || (error && (error.message || String(error)))}</div>
              {"code" in (error || {}) && (error as any).code && (
                <div className="opacity-80">Code: {(error as any).code}</div>
              )}
              {"detail" in (error || {}) && (error as any).detail && (
                <div className="opacity-80 break-all">Detail: {(error as any).detail}</div>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Having trouble starting? Ensure runtime assets exist under <code>/public/wavewalletdk/&lt;version&gt;/</code>.
          </div>
        </div>
      )
    }

    // Wrap with provider when engine is ready
    return function Provided() {
      if (!engine) {
        return (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Booting Signet wallet…
          </div>
        )
      }
      return (
        <wlReact.WavelengthProvider engine={engine}>
          <WalletUI />
        </wlReact.WavelengthProvider>
      )
    }
  }, [wlReact, engine, password])

  if (errorMsg) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="text-base font-medium">Signet Practice Wallet</div>
          <p className="text-sm text-muted-foreground">We couldn’t start the embedded Wavelength SDK.</p>
          <div className="text-xs text-red-500 break-words">{errorMsg}</div>
          <div className="pt-2 text-xs text-muted-foreground">Option: open the dedicated route which attempts the same boot:</div>
          <div>
            <Button asChild size="sm">
              <Link href="/wallet/signet">Open Practice Wallet</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!Inner) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading Signet wallet…</div>
  }

  return <Inner />
}

