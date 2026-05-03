/**
 * 蓝牙打印机预设配置
 * 仅用于为特定账户覆盖全局默认打印行为。
 * 未配置的账户统一走全局默认参数。
 *
 * key   = 账户显示名（display_name），与登录账户一一对应
 * name  = 打印机蓝牙名称（用于界面展示）
 * mac   = 蓝牙 MAC 地址（用于连接，为空则表示该账户无预设设备）
 * journalMode = 是否需要在打印前发送 JOURNAL+SETFF 配置（A4LEP 系列需要，A4mini 系列不需要，否则内容会上下居中）
 * fillFullPage = 是否强制铺满 A5 整页（A4mini 需要，A4pro 不需要）
 * rotateImage = 是否把打印图片逆时针旋转 90 度（A4pro 不需要）
 * autoCut = 是否打印后自动切纸（A4pro 支持）
 */
export interface PrinterPreset {
  name: string
  mac: string
  /** 是否需要在打印前发送 JOURNAL+SETFF 走纸配置（A4LEP 需要，A4mini 不需要） */
  journalMode: boolean
  /** 是否强制铺满 A5 整页 */
  fillFullPage?: boolean
  /** 是否把打印图片逆时针旋转 90 度 */
  rotateImage?: boolean
  /** 是否打印后自动切纸 */
  autoCut?: boolean
}

export const PRINTER_PRESETS: Record<string, PrinterPreset> = {
  大车: { name: 'A4Pro-6A4F7A', mac: '98:3D:AE:6A:4F:7A', journalMode: false },
  小车: { name: 'A4Pro-6C11A6', mac: '98:3D:AE:6C:11:A6', journalMode: false },
  三车: { name: 'A4Pro-134C46', mac: '34:CD:B0:13:4C:46', journalMode: false },
}
