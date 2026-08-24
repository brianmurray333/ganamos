\"use client\"

import { useEffect, useMemo, useState } from \"react\"
import { Card, CardContent } from \"@/components/ui/card\"
import { Button } from \"@/components/ui/button\"
import { ArrowDownIcon, ArrowUpIcon } from \"lucide-react\"
import Image from \"next/image\"
import Link from \"next/link\"
import { formatSatsValue } from \"@/lib/utils\"

type WLReact = any

export function SignetWalletTab() {
  const [wlReact, setWlReact] = useState<WLReact | null>(null)
  const [engine, setEngine] = useState<any>(null)
  const [phase, setPhase] = useState<string>(\"loading\")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Lazily load the SDK only when this tab mounts
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const web = await import(\"@lightninglabs/wavelength-web\")
        const react = await import(\"@lightninglabs/wavelength-react\")

        // Assets are expected under /public/wavewalletdk/<version>/
        // See docs: Hosting runtime assets
        const baseUrl = `/wavewalletdk/${web.RUNTIME_MANIFEST_VERSION}/`

        const walletEngine = web.createWebWalletEngine({
          // Use main-thread mode to avoid COOP/COEP requirements in the PWA shell
          runtimeThread: \"main\",
          runtimeBaseUrl: baseUrl,
          // Signet preset; no mainnet allowed
          config: web.defaultConfig(\"signet\" as any),
          autoStart: true,
        })

        if (!mounted) return
        setWlReact(react)
        setEngine(walletEngine)
        setPhase(\"booting\")
      } catch (err: any) {
        if (!mounted) return
        const message =
          err?.message ||
          (typeof err === \"string\" ? err : \"Failed to load Wavelength SDK\") +
            \"\\nIf you are running locally, ensure runtime assets are present under public/wavewalletdk/<version>.\" 
        setErrorMsg(message)
        setPhase(\"error\")
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

      const confirmed = balance?.confirmedSat ?? 0

      return (
        <div className=\"space-y-6\">
          <Card className=\"shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card\">
            <CardContent className=\"p-6\">
              <div className=\"flex flex-col items-center\">
                <div className=\"p-3 mb-3 bg-amber-100 rounded-full dark:bg-amber-950/50\">
                  <Image src=\"/images/bitcoin-logo.png\" alt=\"Bitcoin\" width={32} height={32} className=\"object-contain\" />
                </div>
                <p className=\"text-sm text-muted-foreground mb-1\">Signet Balance (Practice)</p>
                <p className=\"text-3xl font-bold\">{formatSatsValue(confirmed)}</p>
                <p className=\"text-xs text-muted-foreground mt-2\">Keys live only in this browser</p>
                <p className=\"text-xs text-muted-foreground mt-1\">Not mainnet — for practice only</p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className=\"grid grid-cols-2 gap-4\">
            <ReceiveButton />
            <SendButton />
          </div>

          {/* Onboard / Unlock helpers */}
          {walletPhase === \"needsWallet\" && (
            <Card>
              <CardContent className=\"p-4\">
                <div className=\"space-y-3 text-center\">
                  <p className=\"text-sm text-muted-foreground\">Create a new Signet practice wallet</p>
                  <Button
                    variant=\"outline\"
                    disabled={createPending}
                    onClick={async () => {
                      // Do NOT display or persist the mnemonic here
                      await create({ password: \"practice-only\" })
                    }}
                  >
                    Create Wallet
                  </Button>
                  <p className=\"text-xs text-muted-foreground\">We never show a seed here. Backup handled separately.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {walletPhase === \"locked\" && (
            <Card>
              <CardContent className=\"p-4\">
                <div className=\"space-y-3 text-center\">
                  <p className=\"text-sm text-muted-foreground\">Unlock your Signet practice wallet</p>
                  <Button
                    variant=\"outline\"
                    disabled={unlockPending}
                    onClick={async () => {
                      await unlock({ password: \"practice-only\" })
                    }}
                  >
                    Unlock Wallet
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {(receiveError || sendError || error) && (
            <div className=\"text-xs text-red-500\">
              {receiveError?.message || sendError?.message || error?.message}
            </div>
          )}

          {/* Lightweight receive/send panels */}
          {receiveData?.invoice && (
            <Card>
              <CardContent className=\"p-4 space-y-2\">
                <div className=\"font-medium\">Invoice created</div>
                <div className=\"break-all text-xs\">{receiveData.invoice}</div>
                <div className=\"flex gap-2\">
                  <Button asChild size=\"sm\">
                    <Link href={`lightning:${receiveData.invoice}`}>Open Wallet</Link>
                  </Button>
                  <Button variant=\"outline\" size=\"sm\" onClick={() => navigator.clipboard.writeText(receiveData.invoice)}>
                    Copy
                  </Button>
                  <Button variant=\"ghost\" size=\"sm\" onClick={() => resetReceive()}>
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className=\"text-xs text-muted-foreground\">
            Having trouble starting? Ensure runtime assets exist under <code>/public/wavewalletdk/&lt;version&gt;/</code>.
          </div>
        </div>
      )

      function ReceiveButton() {
        return (
          <Button
            variant=\"outline\"
            className=\"w-full h-24 flex flex-col items-center justify-center gap-2\"
            disabled={receivePending}
            onClick={async () => {
              await receive({ amountSat: 1000 })
            }}
          >
            <ArrowDownIcon className=\"h-6 w-6 text-green-500\" />
            <span>Receive</span>
          </Button>
        )
      }

      function SendButton() {
        return (
          <Button
            variant=\"outline\"
            className=\"w-full h-24 flex flex-col items-center justify-center gap-2\"
            disabled={sendPending}
            onClick={async () => {
              const bolt11 = prompt(\"Paste a Signet invoice (BOLT11)\") || \"\"
              if (!bolt11) return
              try {
                await send({ invoice: bolt11 })
                resetSend()
              } catch (e) {
                // error is surfaced by sendError
              }
            }}
          >
            <ArrowUpIcon className=\"h-6 w-6 text-red-500\" />
            <span>Send</span>
          </Button>
        )
      }
    }

    // Wrap with provider when engine is ready
    return function Provided() {
      if (!engine) {
        return (
          <div className=\"py-10 text-center text-sm text-muted-foreground\">
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
  }, [wlReact, engine])

  if (errorMsg) {
    return (
      <Card>
        <CardContent className=\"p-6 space-y-3\">
          <div className=\"text-base font-medium\">Signet Practice Wallet</div>
          <p className=\"text-sm text-muted-foreground\">
            We couldn’t start the embedded Wavelength SDK.
          </p>
          <div className=\"text-xs text-red-500 break-words\">{errorMsg}</div>
          <div className=\"pt-2 text-xs text-muted-foreground\">
            Option: open the dedicated route which attempts the same boot:
          </div>
          <div>
            <Button asChild size=\"sm\">
              <Link href=\"/wallet/signet\">Open Practice Wallet</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!Inner) {
    return (
      <div className=\"py-10 text-center text-sm text-muted-foreground\">
        Loading Signet wallet…
      </div>
    )
  }

  return <Inner />
}

