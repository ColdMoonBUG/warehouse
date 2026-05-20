-- ============================================================
-- 库存初始化脚本（直接写入，不走单据流程）
-- 
-- 使用说明：
--   1. 先通过 web 端【系统维护 → 仅清库存】清空所有库存
--   2. 先查出所有商品 ID（执行第一段 SELECT）
--   3. 把商品名对应的 ID 填入下方 INSERT
--   4. 分两次执行：今晚执行主仓库，明早盘完三车后执行车库
--
-- 执行方式（在服务器上）：
--   mysql -u warehouse -pwarehouse123 warehouse < init-stock.sql
-- 或者直接粘贴到 MySQL 命令行执行
-- ============================================================

-- 第一步：查看所有商品（先执行这个，记录名称对应的 ID）
SELECT id, name, barcode FROM wh_product WHERE status='active' ORDER BY name;

-- ============================================================
-- 第二步：主仓库初始化（今晚执行）
-- warehouseId = 'main'
-- ============================================================
-- 示例格式，复制修改：
-- INSERT INTO wh_stock (warehouse_id, product_id, qty) VALUES
-- ('main', '这里填商品ID', 这里填数量),
-- ('main', '这里填商品ID', 这里填数量)
-- ON DUPLICATE KEY UPDATE qty = VALUES(qty);

-- ============================================================
-- 第三步：三个车库初始化（明早盘完后执行）
-- 注意：直接写入，不走出库单，不影响主仓库存
-- ============================================================

-- 大车（warehouseId = 'veh_sp_big'）
-- INSERT INTO wh_stock (warehouse_id, product_id, qty) VALUES
-- ('veh_sp_big', '这里填商品ID', 这里填数量),
-- ('veh_sp_big', '这里填商品ID', 这里填数量)
-- ON DUPLICATE KEY UPDATE qty = VALUES(qty);

-- 小车（warehouseId = 'veh_sp_small'）
-- INSERT INTO wh_stock (warehouse_id, product_id, qty) VALUES
-- ('veh_sp_small', '这里填商品ID', 这里填数量),
-- ('veh_sp_small', '这里填商品ID', 这里填数量)
-- ON DUPLICATE KEY UPDATE qty = VALUES(qty);

-- 三车（warehouseId = 'veh_sp_third'）
-- INSERT INTO wh_stock (warehouse_id, product_id, qty) VALUES
-- ('veh_sp_third', '这里填商品ID', 这里填数量),
-- ('veh_sp_third', '这里填商品ID', 这里填数量)
-- ON DUPLICATE KEY UPDATE qty = VALUES(qty);

-- ============================================================
-- 第四步：验证（执行后看结果是否正确）
-- ============================================================
SELECT
  w.name  AS 仓库,
  p.name  AS 商品,
  p.barcode AS 条码,
  s.qty   AS 库存数量
FROM wh_stock s
JOIN wh_warehouse w ON w.id = s.warehouse_id
JOIN wh_product   p ON p.id = s.product_id
WHERE s.qty > 0
ORDER BY w.name, p.name;
