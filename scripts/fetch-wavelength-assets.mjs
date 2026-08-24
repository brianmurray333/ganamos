#!/usr/bin/env node
/**
 * Fetches the Wavelength WASM runtime assets for the pinned SDK version
 * and unpacks them into public/wavewalletdk/<version>/ if missing.
 *
 * This runs on postinstall so `pnpm install && pnpm dev` "just works"
 * locally and on Vercel preview without any manual curl commands.
 */

import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { pipeline } from "node:stream/promises"
import tar from "tar"

async function main() {
  try {
    const web = await import("@lightninglabs/wavelength-web")
    const version = web.RUNTIME_MANIFEST_VERSION
    const assets = web.RUNTIME_ASSET_FILES ?? Object.values(web.RUNTIME_ASSETS ?? {})
    if (!version || !assets || assets.length === 0) {
      console.log("[wavelength-assets] Nothing to do (version/assets unavailable).")
      return
    }

    const baseDir = path.join(process.cwd(), "public", "wavewalletdk", version)
    const allExist = await filesExist(baseDir, assets)
    if (allExist) {
      console.log(`[wavelength-assets] Found existing assets at ${path.relative(process.cwd(), baseDir)}`)
      return
    }

    await fsp.mkdir(baseDir, { recursive: true })
    const url = `https://github.com/lightninglabs/wavelength/releases/download/${version}/Wavewalletdk.wasm.tar.gz`
    console.log(`[wavelength-assets] Downloading runtime bundle ${version}…`)

    const res = await fetch(url)
    if (!res.ok || !res.body) {
      console.warn(`[wavelength-assets] Failed to download assets: ${res.status} ${res.statusText}`)
      return
    }

    // Stream to tmp file (Windows-safe) then extract
    const tmpFile = path.join(os.tmpdir(), `wavewalletdk-${version}-${Date.now()}.tar.gz`)
    await pipeline(res.body, fs.createWriteStream(tmpFile))
    await tar.x({ file: tmpFile, cwd: baseDir })
    await fsp.unlink(tmpFile).catch(() => {})

    const postExist = await filesExist(baseDir, assets)
    if (postExist) {
      console.log(`[wavelength-assets] Installed assets to ${path.relative(process.cwd(), baseDir)}`)
    } else {
      console.warn("[wavelength-assets] Extraction finished but required files were not all found.")
    }
  } catch (err) {
    // Never fail install; just print a short hint
    const msg = err?.message || String(err)
    console.warn(`[wavelength-assets] Skipping setup: ${msg}`)
  }
}

async function filesExist(dir, names) {
  try {
    const checks = await Promise.all(
      names.map(async (n) => {
        try {
          await fsp.access(path.join(dir, n), fs.constants.R_OK)
          return true
        } catch {
          return false
        }
      })
    )
    return checks.every(Boolean)
  } catch {
    return false
  }
}

main()

