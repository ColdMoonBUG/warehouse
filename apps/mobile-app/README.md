# 车销系统 - 移动端 App

## 项目简介

食品中间商车销管理系统的移动端应用，基于 uni-app (Vue 3) 开发，支持多端发布。

## 技术栈

- **框架**: uni-app (Vue 3)
- **状态管理**: Pinia
- **工具库**: dayjs
- **构建工具**: Vite

## 项目结构

```
src/
├── api/                  # API 接口
│   └── index.ts          # 统一 API 导出（登录、门店、商品、销售）
├── mock/                 # Mock 数据
│   └── storage.ts        # 本地存储 Mock 数据
├── pages/                # 页面
│   ├── login/            # 登录模块
│   │   ├── index.vue     # 账户选择页
│   │   ├── password.vue  # 密码登录页
│   │   └── gesture.vue   # 手势解锁页
│   ├── map/              # 地图模块
│   │   └── index.vue     # 门店地图+销量热力展示
│   ├── sales/            # 销售模块
│   │   ├── index.vue     # 销售列表页（筛选、统计）
│   │   ├── create.vue    # 创建销单页（门店/商品选择）
│   │   └── detail.vue    # 销单详情页（查看/过账/作废）
│   └── settings/         # 设置模块
│       ├── index.vue     # 设置页
│       ├── store-list.vue # 门店列表页（搜索、启用/停用）
│       └── store-add.vue  # 新增/编辑门店页（地图选点）
├── store/                # 状态管理
│   └── user.ts           # 用户状态
├── types/                # 类型定义
│   └── index.ts          # 统一类型导出
├── utils/                # 工具函数
│   ├── config.ts         # 环境配置
│   ├── index.ts          # 通用工具函数
│   └── request.ts        # HTTP 请求封装
├── App.vue               # 根组件
├── pages.json            # 页面路由配置
├── manifest.json         # 应用配置
└── uni.scss              # 全局样式
```

## 功能说明

### 已实现功能

#### 1. 登录认证
- 账户选择登录（展示可用账户列表）
- 密码登录（支持明文/加密密码）
- 手势密码解锁（Canvas 绘制连线）
- 自动登录状态保持
- Mock 数据支持

#### 2. 地图展示
- 门店位置标记（高德地图/uni-app map组件）
- 销量热力分级（绿-黄-橙-红，近30天）
- 门店信息弹窗（名称、地址、销量、业务员）
- 导航到店功能
- 定位当前位置

#### 3. 销售管理
- 销售单列表
  - 日期范围筛选（今天/昨天/近7天/近30天/本月）
  - 门店筛选
  - 统计卡片（单据数、总件数、总金额）
  - 分页加载
- 创建销单
  - 选择门店
  - 选择业务员（默认当前用户）
  - 添加商品明细（数量、单价）
  - 自动计算小计和总金额
  - 保存草稿 / 提交过账
- 销单详情
  - 查看单据信息
  - 草稿状态可编辑
  - 过账/作废操作

#### 4. 门店管理
- 门店列表
  - 搜索过滤
  - 规模标签（小/中/大/超大）
  - 状态显示（启用/停用）
  - 启用/停用切换
  - 删除操作
- 新增/编辑门店
  - 填写门店信息
  - 地图选点（点击地图或定位）
  - 自动获取坐标

### 待实现功能

- 手势密码设置
- 销售单编辑（从详情进入）
- 数据导出
- 打印功能
- 真实后端 API 对接

## 快速开始

### 1. 安装依赖

```bash
cd apps/mobile-app
npm install
```

### 2. 运行开发服务器

```bash
# H5 开发
npm run dev:h5

# 微信小程序开发
npm run dev:mp-weixin

# App 开发
npm run dev:app
```

### 3. 构建

```bash
# H5 构建
npm run build:h5

# 微信小程序构建
npm run build:mp-weixin

# App 构建
npm run build:app
```

## 测试账户

默认 Mock 数据包含以下测试账户：

| 用户名 | 密码 | 角色 | 关联业务员 |
|--------|------|------|-----------|
| admin | 123456 | 管理员 | - |
| zhangsan | 123456 | 业务员 | 张三 |
| lisi | 123456 | 业务员 | 李四 |

## Mock 数据说明

系统会自动初始化以下 Mock 数据：

- **账户**: 3个（admin、zhangsan、lisi）
- **业务员**: 3个（张三、李四、王五）
- **供应商**: 3个
- **商品**: 10个（可乐、雪碧、矿泉水、方便面等）
- **门店**: 8个（南阳市范围内的超市）
- **销售单**: 近30天的随机销售数据

## 配置说明

### Mock 模式

默认开启 Mock 模式，使用本地存储模拟数据。在 `src/utils/config.ts` 中配置：

```typescript
export const USE_MOCK = true  // 设置为 false 切换到真实 API
```

### API 地址

```typescript
export const BASE_URL = 'http://localhost:8080'  // 后端 API 地址
```

### 地图配置

H5 端使用高德地图，需配置 Key：

```typescript
export const AMAP_KEY = 'your_amap_key'
```

## 注意事项

1. 地图功能需要配置高德地图 Key（H5 端）
2. 微信小程序需要在 `manifest.json` 中配置 appid
3. App 打包需要配置签名证书
4. 首次运行会自动初始化 Mock 数据
5. 数据存储在本地，清除缓存会丢失数据
