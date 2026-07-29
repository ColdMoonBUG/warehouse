# 销单/退单商品排序修复计划

## 背景问题（用户反馈）

1. **退单添加商品不置顶**：销单选新商品会排到已选列表最上方方便填数量，但"同时创建退单"里的退货商品选完后不会置顶，仍按基础资料原始顺序排列。
2. **数量多时打印顺序混乱**：销售+退货商品总数超过一定量后，打印出来的行顺序和手动录入顺序对不上。
3. **"根据此单重建"后顺序混乱**：重建预填后商品顺序也是乱的。

## 根因分析（已通过检索确认）

### 问题 1：退单列表无排序逻辑
- `sales/create.vue:505` 销单 `selectedProducts` 用 `addedProductOrder` Map 按加入时间降序，新商品置顶 ✓
- `sales/create.vue:579` 退单 `returnSelectedProducts = products.value.filter(...)`，**完全没有排序**，只能按 `products` 原始顺序 ✗

### 问题 2 & 3：后端明细 ID 随机 + 按 ID 排序（核心根因）
- 前端 `doSubmit` 给每行写了 `lineNo: index + 1`（`create.vue:928/969`）
- 但 `SaleLine` / `ReturnLine` 实体**没有 lineNo 字段**，该值从未落库
- 后端 `SaleController.save:176` 保存时 `line.setId(IdUtils.randomId())` —— **用纯 UUID 覆盖前端 ID**
- 后端 4 处读取明细全用 `.orderByDesc(SaleLine::getId)` —— 按随机 UUID 降序 = **顺序随机**
- 商品少时碰巧看着还行，多了必乱。退单侧同理。
- 打印函数 `sortLinesByLineNo` 依赖 `lineNo`，但后端返回的行根本没有 `lineNo`，退化为原始（乱序）顺序

## 修复方案

### 方案选择
加显式 `line_no` 列（数据库层稳定排序）。语义清晰、根治所有"从后端读明细"场景，不依赖 ID 副作用。

### 改动清单

#### A. 数据库（新增 line_no 列）
- 新增 migration SQL：`sql/20260723_add_line_no.sql`
  - `wh_sale_line` ADD COLUMN `line_no` INT DEFAULT 0
  - `wh_return_line` ADD COLUMN `line_no` INT DEFAULT 0
  - 幂等写法（存在则跳过），参考 `sql/20260417_pending_migrations.sql` 风格
- 存量数据 line_no 全为 0，读取时 0 值按 ID 兜底，不影响历史单展示

#### B. 后端实体
- `SaleLine.java`：新增 `private Integer lineNo;`
- `ReturnLine.java`：新增 `private Integer lineNo;`

#### C. 后端保存逻辑
- `SaleController.save`：保存明细循环中，若前端传了 lineNo 则保留；未传则用循环 index 兜底赋值。**不改** `setId(randomId())`（ID 仍随机，但排序不再依赖它）
- `ReturnController` 对应 save：同样处理

#### D. 后端读取排序（4+处）
- `SaleController` 全部 `.orderByDesc(SaleLine::getId)` → `.orderByAsc(SaleLine::getLineNo).orderByAsc(SaleLine::getId)`
  - 行号升序（录入顺序），行号相同（历史 0 值）再按 ID 稳定兜底
- `ReturnController` 对应读取同样改

#### E. 前端退单置顶（问题 1）
- `sales/create.vue`：新增 `returnAddedProductOrder` Map，仿照销单 `addedProductOrder`
- `toggleReturnSelect` 选中时 `set(id, Date.now())`，移除时 `delete`
- `returnSelectedProducts` computed 改为按该 Map 降序排列

#### F. 前端重建保留顺序（问题 3）
- `create.vue:tryRestorePrefill`：恢复销单 qtyMap 时同步给 `addedProductOrder` 按 line 顺序赋递增值；退单恢复时给 `returnAddedProductOrder` 赋值
- `detail.vue` 生成 prefill 时确保 lines 已按 lineNo 排序后再写入 localStorage
- `tryRestoreBackendDraft` 同样补 addedProductOrder（已部分有，需检查退单）

#### G. 前端提交 lineNo 正确传递
- 确认 `doSubmit` 的 `lineNo: index + 1` 中 index 来自已排序的 `selectedProducts`/`returnSelectedProducts`（当前已是，验证即可）

## 验证步骤
1. 后端编译：`./mvnw -q -o compile`
2. 前端构建：`pnpm -C apps/mobile-app build:h5`
3. 手动执行 migration SQL
4. 功能验证：
   - 退单选新商品是否置顶
   - 录 10+ 商品的销单+退单，打印顺序 == 录入顺序
   - 对该单"根据此单重建"，顺序保持一致

## 不做范围
- 不改 ID 生成策略（保持 UUID，避免影响外键/日志）
- 不动库存、提成、金额计算逻辑
- 不重构打印模块，仅确保它拿到带 lineNo 的有序数据

---

# 追加需求：商品克重列

## 需求
- 商品表 `wh_product` 新增"克重"列 `weight`
- 打印时在"保质期"列后面新增一列显示克重
- 未填写则该格留空（不显示 `-`），但列位置保持一致，保证表格对齐

## 改动清单

### A. 数据库
- migration 追加：`wh_product` ADD COLUMN `weight` VARCHAR(20) DEFAULT NULL COMMENT '克重'
- 用 VARCHAR：克重可能带单位（如 "500g"、"1kg"），也方便留空

### B. 后端
- `Product.java` 新增 `private String weight;`
- 保存/查询走 MyBatis-Plus 自动映射，无需改 Controller

### C. 商品维护录入（一并做）
- `apps/admin-web/src/pages/basic/Product.vue`：表单加克重输入框
- `apps/mobile-app/src/pages/admin/product/form.vue`：同样加克重输入
- 类型定义 `Product` 加 `weight?: string`

### D. 打印（canvas-print.ts，3处布局）
- `PrintItem` 接口加 `weight?: string`
- 构建 items 时带 `weight: product?.weight`
- 6列表格（1317、1670 两处）重排列宽，保质期后插入克重列
  - 建议百分比：条码0.05 / 商品0.24 / 数量0.55 / 保质期0.66 / 克重0.76 / 进价0.85 / 总计0.93
- 表头加"克重"，数据行 `item.weight || ''`（空则留白，不打 `-`）
- 简化3列布局（1944 赠送单）保持一致处理

## 服务器数据库迁移方式

项目**无 Flyway/Liquibase**，迁移靠手动执行 SQL。

- 本次所有 DDL（line_no ×2 + weight ×1）合并成一个幂等文件：
  `sql/20260723_line_no_and_weight.sql`
- 幂等写法：用 `INFORMATION_SCHEMA.COLUMNS` 判断列是否存在，可安全重复执行
- **本地**：我执行给测试库
- **生产库**：你部署新后端**之前**，用 Navicat / 命令行连生产库执行这一个文件即可
- 顺序：先跑 SQL（加列）→ 再上线新后端，避免新代码查无列报错

## 执行顺序
1. 写 migration SQL 文件
2. 本地执行 migration（需你确认连的是测试库）
3. 后端实体 + 保存/读取排序
4. 前端退单置顶 + 重建顺序 + 克重录入
5. 打印列布局
6. 后端编译 + 前端构建验证
7. 交付生产库执行步骤说明

