const CPCL_SRC = import.meta.glob('./CPCL.min.js', { eager: true, query: '?raw', import: 'default' })['./CPCL.min.js'] as string

type CpclModule = { Builder: any; Tools: { HEX: any } }

let _cpcl: CpclModule | undefined

function getCpcl(): CpclModule {
  if (_cpcl) return _cpcl
  const m: { exports: CpclModule } = { exports: {} as CpclModule }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', CPCL_SRC)(m, m.exports)
  _cpcl = m.exports
  return _cpcl
}

export const CPCL = new Proxy({} as CpclModule, {
  get(_, key) {
    return (getCpcl() as any)[key]
  },
})

export const HEX = new Proxy({} as CpclModule['Tools']['HEX'], {
  get(_, key) {
    return (getCpcl().Tools.HEX as any)[key]
  },
})