import request from '@/utils/request'
import type { Employee } from '@/types'

export async function getEmployees(): Promise<Employee[]> {
  const res = await request.get('/employee/list')
  return res.data
}

export async function saveEmployee(data: Partial<Employee> & { name: string; code: string }) {
  await request.post('/employee/save', data)
}

export async function toggleEmployee(id: string) {
  await request.post(`/employee/toggle/${id}`)
}

export async function deleteEmployee(id: string) {
  await request.post(`/employee/delete/${id}`)
}
