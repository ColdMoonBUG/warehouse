import axios from 'axios'

export async function uploadFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('mf', file)
  try {
    const res = await axios.post('/api/file/uploadFile', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const path = res?.data?.path || ''
    if (!path) {
      throw new Error(res?.data?.msg || '上传失败')
    }
    return path
  } catch (err: any) {
    throw new Error(err?.response?.data?.msg || err?.message || '上传失败')
  }
}

export function getImageUrl(path?: string) {
  if (!path) return ''
  return `/api/file/showImageByPath?path=${encodeURIComponent(path)}`
}
