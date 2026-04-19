-- ============================================================
-- 测试数据：全商品入库 300 箱 + 每业务员出库 100 箱
-- 执行前提：商品已录入，仓库 main/veh_sp_big/veh_sp_small/veh_sp_third 已存在
-- 执行方式：在 MySQL 中直接运行此脚本
-- ============================================================

-- 防止重复执行导致 UK 冲突
DELETE FROM wh_inbound_line WHERE doc_id IN ('seed_inbound_001');
DELETE FROM wh_inbound_doc WHERE id = 'seed_inbound_001';
DELETE FROM wh_transfer_line WHERE doc_id IN ('seed_transfer_big','seed_transfer_small','seed_transfer_third');
DELETE FROM wh_transfer_doc WHERE id IN ('seed_transfer_big','seed_transfer_small','seed_transfer_third');

-- ============================================================
-- 1. 创建入库单（已过账状态）
-- ============================================================
INSERT INTO wh_inbound_doc (id, code, supplier_id, doc_date, remark, status)
VALUES ('seed_inbound_001', 'IN-SEED-001', (SELECT id FROM wh_supplier LIMIT 1), CURDATE(), '测试脚本入库300箱', 'posted');

-- 入库明细：每个商品 300箱（qty = 300 × box_qty）
INSERT INTO wh_inbound_line (id, doc_id, product_id, box_qty, qty, price, amount)
SELECT
  CONCAT('sil_', id) AS id,
  'seed_inbound_001'  AS doc_id,
  id                  AS product_id,
  300                 AS box_qty,
  300 * COALESCE(box_qty, 1) AS qty,
  COALESCE(purchase_price, 0) AS price,
  300 * COALESCE(box_qty, 1) * COALESCE(purchase_price, 0) AS amount
FROM wh_product
WHERE status = 'active';

-- 更新主仓库存（入库 300箱）
INSERT INTO wh_stock (warehouse_id, product_id, qty)
SELECT 'main', id, 300 * COALESCE(box_qty, 1)
FROM wh_product WHERE status = 'active'
ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty);

-- ============================================================
-- 2. 创建大车调拨单（主仓 → veh_sp_big，100箱）
-- ============================================================
INSERT INTO wh_transfer_doc (id, code, from_warehouse_id, to_warehouse_id, doc_date, remark, status)
VALUES ('seed_transfer_big', 'TR-SEED-BIG', 'main', 'veh_sp_big', CURDATE(), '测试出库大车100箱', 'posted');

INSERT INTO wh_transfer_line (id, doc_id, product_id, box_qty, qty)
SELECT
  CONCAT('stl_big_', id),
  'seed_transfer_big',
  id,
  100,
  100 * COALESCE(box_qty, 1)
FROM wh_product WHERE status = 'active';

-- 3. 创建小车调拨单（主仓 → veh_sp_small，100箱）
INSERT INTO wh_transfer_doc (id, code, from_warehouse_id, to_warehouse_id, doc_date, remark, status)
VALUES ('seed_transfer_small', 'TR-SEED-SML', 'main', 'veh_sp_small', CURDATE(), '测试出库小车100箱', 'posted');

INSERT INTO wh_transfer_line (id, doc_id, product_id, box_qty, qty)
SELECT
  CONCAT('stl_sml_', id),
  'seed_transfer_small',
  id,
  100,
  100 * COALESCE(box_qty, 1)
FROM wh_product WHERE status = 'active';

-- 4. 创建三车调拨单（主仓 → veh_sp_third，100箱）
INSERT INTO wh_transfer_doc (id, code, from_warehouse_id, to_warehouse_id, doc_date, remark, status)
VALUES ('seed_transfer_third', 'TR-SEED-3RD', 'main', 'veh_sp_third', CURDATE(), '测试出库三车100箱', 'posted');

INSERT INTO wh_transfer_line (id, doc_id, product_id, box_qty, qty)
SELECT
  CONCAT('stl_3rd_', id),
  'seed_transfer_third',
  id,
  100,
  100 * COALESCE(box_qty, 1)
FROM wh_product WHERE status = 'active';

-- ============================================================
-- 5. 同步库存（调拨：主仓 -100箱/商品 × 3，各车库 +100箱）
-- ============================================================

-- 主仓扣减（300箱 - 100×3 = 0箱剩余）
UPDATE wh_stock ws
JOIN wh_product p ON ws.product_id = p.id
SET ws.qty = ws.qty - 300 * COALESCE(p.box_qty, 1)
WHERE ws.warehouse_id = 'main' AND p.status = 'active';

-- 大车车库增加
INSERT INTO wh_stock (warehouse_id, product_id, qty)
SELECT 'veh_sp_big', id, 100 * COALESCE(box_qty, 1)
FROM wh_product WHERE status = 'active'
ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty);

-- 小车车库增加
INSERT INTO wh_stock (warehouse_id, product_id, qty)
SELECT 'veh_sp_small', id, 100 * COALESCE(box_qty, 1)
FROM wh_product WHERE status = 'active'
ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty);

-- 三车车库增加
INSERT INTO wh_stock (warehouse_id, product_id, qty)
SELECT 'veh_sp_third', id, 100 * COALESCE(box_qty, 1)
FROM wh_product WHERE status = 'active'
ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty);

-- ============================================================
-- 6. 确认结果
-- ============================================================
SELECT w.name AS 仓库, p.name AS 商品, s.qty AS 库存袋数
FROM wh_stock s
JOIN wh_warehouse w ON s.warehouse_id = w.id
JOIN wh_product p ON s.product_id = p.id
WHERE w.id IN ('main','veh_sp_big','veh_sp_small','veh_sp_third')
ORDER BY w.id, p.name;
