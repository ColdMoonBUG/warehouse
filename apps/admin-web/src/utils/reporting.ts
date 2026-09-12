import dayjs from 'dayjs'

export function docDay(doc: { date?: string; docDate?: string }) {
  return (doc.docDate || doc.date || '').slice(0, 10)
}
export function monthRange(): [string, string] {
  return [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().endOf('month').format('YYYY-MM-DD')]
}
export function inRange(date: string, range: [string, string]) {
  return !!date && date >= range[0] && date <= range[1]
}
export function daysInRange(range: [string, string]) {
  const days: string[] = []
  for (let d = dayjs(range[0]); d.format('YYYY-MM-DD') <= range[1]; d = d.add(1, 'day')) days.push(d.format('YYYY-MM-DD'))
  return days
}
export function docAmount(doc: { totalAmount?: number; lines?: { qty: number; price: number; amount?: number }[] }) {
  return Number(doc.totalAmount ?? doc.lines?.reduce((s, l) => s + Number(l.amount ?? Number(l.qty) * Number(l.price)), 0) ?? 0)
}
export function docQty(doc: { totalQty?: number; lines?: { qty: number }[] }) {
  return Number(doc.totalQty ?? doc.lines?.reduce((s, l) => s + Number(l.qty), 0) ?? 0)
}
