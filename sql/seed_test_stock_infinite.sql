-- ============================================================
-- 测试阶段专用：给三个业务员车库灌入"无限"库存
-- ============================================================
-- 用途：测试阶段，让销单/退单不受车库库存限制
-- 做法：把 "所有 vehicle 车库 × 所有 active 商品" 的库存设为 999999
--       不走入库/转移单据，直接写 wh_stock 表，零副作用
-- 重跑：任何时候都可以重跑；新增商品后重跑一次即可把新商品补上
-- ============================================================

INSERT INTO wh_stock (warehouse_id, product_id, qty)
SELECT w.id AS warehouse_id,
       p.id AS product_id,
       999999 AS qty
FROM wh_warehouse w
CROSS JOIN wh_product p
WHERE w.type = 'vehicle'
  AND p.status = 'active'
ON DUPLICATE KEY UPDATE qty = 999999;

-- 查看结果（可选）
SELECT w.name AS 车库, COUNT(s.product_id) AS 商品种类, SUM(s.qty) AS 总袋数
FROM wh_warehouse w
LEFT JOIN wh_stock s ON s.warehouse_id = w.id
WHERE w.type = 'vehicle'
GROUP BY w.id, w.name;
