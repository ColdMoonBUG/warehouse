/** 去掉空值，避免把 undefined/'' 当成筛选条件发给后端 */
export function cleanParams(params: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}
