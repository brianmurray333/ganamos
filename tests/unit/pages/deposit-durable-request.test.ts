import { describe, expect, it, vi } from "vitest"
import { clearDurableDepositRequest, withDurableDepositRequest } from "@/lib/deposit-request-id"

function storageHarness() {
  const values = new Map<string, string>()
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    },
  }
}

function serializedLocks() {
  let tail = Promise.resolve<unknown>(undefined)
  return {
    request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
      const result = tail.then(callback)
      tail = result.then(() => undefined, () => undefined)
      return result
    },
  }
}

describe("web deposit request durability", () => {
  it("serializes concurrent callers before reading storage and reuses one UUID", async () => {
    const { storage } = storageHarness()
    const locks = serializedLocks()
    const randomUUID = vi.fn()
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000011")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000012")
    const submitted: string[] = []
    let releaseFirst!: () => void
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = withDurableDepositRequest("account-1", 2_500, async (requestId) => {
      submitted.push(requestId)
      await firstHeld
      return requestId
    }, { storage, locks, randomUUID })
    const second = withDurableDepositRequest("account-1", 2_500, async (requestId) => {
      submitted.push(requestId)
      return requestId
    }, { storage, locks, randomUUID })

    await vi.waitFor(() => expect(submitted).toHaveLength(1))
    releaseFirst()
    const results = await Promise.all([first, second])

    expect(results).toEqual([
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000011",
    ])
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it("survives a client restart and clears only the matching terminal request", async () => {
    const { values, storage } = storageHarness()
    const locks = serializedLocks()
    const randomUUID = vi.fn().mockReturnValue("00000000-0000-4000-8000-000000000011")
    const dependencies = { storage, locks, randomUUID }

    const first = await withDurableDepositRequest("account-1", 2_500, async (id) => id, dependencies)
    const afterRestart = await withDurableDepositRequest("account-1", 2_500, async (id) => id, dependencies)
    expect(afterRestart).toBe(first)
    expect(randomUUID).toHaveBeenCalledTimes(1)

    clearDurableDepositRequest("account-1", 2_500, "00000000-0000-4000-8000-000000000099", storage)
    expect(values.size).toBe(1)
    clearDurableDepositRequest("account-1", 2_500, first, storage)
    expect(values.size).toBe(0)
  })

  it("fails closed when origin-wide locking is unavailable", async () => {
    const { storage } = storageHarness()
    await expect(withDurableDepositRequest("account-1", 2_500, async (id) => id, {
      storage,
      locks: undefined,
      randomUUID: vi.fn(),
    })).rejects.toThrow("Safe invoice creation is unavailable")
  })
})
