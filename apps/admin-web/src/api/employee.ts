import { employeeDb, warehouseDb, genId, now } from '@/mock/storage'
import type { Employee } from '@/types'

export function getEmployees() {
  return Promise.resolve(employeeDb.list())
}

export function saveEmployee(data: Partial<Employee> & { name: string; code: string }) {
  const list = employeeDb.list()
  if (data.id) {
    const idx = list.findIndex(e => e.id === data.id)
    if (idx >= 0) list[idx] = { ...list[idx], ...data }
  } else {
    const emp = { ...data, id: genId(), status: 'active', createdAt: now() } as Employee
    list.push(emp)
    employeeDb.save(list)
    warehouseDb.syncVehicles()
    return Promise.resolve()
  }
  employeeDb.save(list)
  return Promise.resolve()
}

export function toggleEmployee(id: string) {
  const list = employeeDb.list()
  const item = list.find(e => e.id === id)
  if (item) item.status = item.status === 'active' ? 'inactive' : 'active'
  employeeDb.save(list)
  return Promise.resolve()
}

export function deleteEmployee(id: string) {
  employeeDb.save(employeeDb.list().filter(e => e.id !== id))
  return Promise.resolve()
}
