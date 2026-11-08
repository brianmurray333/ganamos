const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const depositRequestStorageKey = (userId: string, satsAmount: number) =>
  `ganamos:deposit-request:v1:${userId}:${satsAmount}`

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

type DurableRequestDependencies = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">
  locks: LockManagerLike | undefined
  randomUUID: () => string
}

function browserDependencies(): DurableRequestDependencies {
  return {
    storage: window.localStorage,
    locks: navigator.locks,
    randomUUID: () => crypto.randomUUID(),
  }
}

export async function withDurableDepositRequest<T>(
  userId: string,
  satsAmount: number,
  operation: (requestId: string) => Promise<T>,
  dependencies: DurableRequestDependencies = browserDependencies(),
): Promise<T> {
  const key = depositRequestStorageKey(userId, satsAmount)
  if (!dependencies.locks) throw new Error("Safe invoice creation is unavailable in this browser")

  return dependencies.locks.request(key, async () => {
    let requestId = dependencies.storage.getItem(key)
    if (!requestId || !uuidPattern.test(requestId)) {
      requestId = dependencies.randomUUID()
      dependencies.storage.setItem(key, requestId)
    }
    return operation(requestId)
  })
}

export function clearDurableDepositRequest(
  userId: string,
  satsAmount: number,
  requestId: string,
  storage: Pick<Storage, "getItem" | "removeItem"> = window.localStorage,
) {
  const key = depositRequestStorageKey(userId, satsAmount)
  if (storage.getItem(key) === requestId) storage.removeItem(key)
}
