/**
 * 蓝牙打印机预设配置
 * 换设备时只需修改此文件，无需改动打印逻辑代码。
 *
 * key   = 账户显示名（display_name），与登录账户一一对应
 * name  = 打印机蓝牙名称（用于界面展示）
 * mac   = 蓝牙 MAC 地址（用于连接，为空则表示该账户无预设设备）
 */
export const PRINTER_PRESETS: Record<string, { name: string; mac: string }> = {
  大车: { name: 'A4LEP-A0290A', mac: '80:F1:B2:A0:29:0A' },
  小车: { name: 'A4LEP-A0C4CA', mac: '80:F1:B2:A0:C4:CA' },
  三车: { name: 'A4LEP-A0BFAA', mac: '80:F1:B2:A0:BF:AA' },
}
