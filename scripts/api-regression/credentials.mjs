// 测试账号从环境变量读取，不把真实的密码哈希写进仓库：
//   WH_ADMIN=admin:<密码哈希>   WH_SP=<业务员用户名>:<密码哈希>
export function account(envName) {
  const value = process.env[envName] || ''
  const i = value.indexOf(':')
  if (i <= 0 || i === value.length - 1) {
    console.error(`缺少测试账号：请设置环境变量 ${envName}=用户名:密码哈希`)
    process.exit(2)
  }
  return { username: value.slice(0, i), passwordHash: value.slice(i + 1) }
}
