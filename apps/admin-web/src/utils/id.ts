/** 32 位十六进制单据 id。用 getRandomValues 而不是 randomUUID：后者在 http（非 https）页面里不可用。 */
export function newDocId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
