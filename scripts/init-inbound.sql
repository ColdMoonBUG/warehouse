-- ============================================================
-- 主仓库初始库存 - 入库单方式初始化
-- 生成时间：2026-05-20
-- 说明：
--   以入库单形式写入主仓库初始库存，有完整单据记录
--   执行前确保已通过【系统维护→仅清库存】清空旧库存
--   执行方式：mysql -u warehouse -pwarehouse123 warehouse < init-inbound.sql
-- ============================================================

SET @TODAY = CURDATE();
SET @DOC_ID = REPLACE(UUID(), '-', '');

-- ============================================================
-- 1. 插入入库单主表
-- ============================================================
INSERT INTO wh_inbound_doc (id, code, supplier_id, date, doc_date, remark, status, created_at)
VALUES (
  @DOC_ID,
  CONCAT('RK-', DATE_FORMAT(@TODAY, '%Y-%m-%d'), '-INIT'),
  'da3aa220c9c44f408f41fc1a6a4a146c',  -- 马德合大小老面包（用做通用入库，可按需改）
  @TODAY,
  @TODAY,
  '系统初始库存盘点入库',
  'posted',
  NOW()
);

-- ============================================================
-- 2. 插入入库明细行（每种商品一行）
-- ============================================================
INSERT INTO wh_inbound_line (id, doc_id, product_id, qty, box_qty, price, created_at) VALUES
(REPLACE(UUID(),'-',''), @DOC_ID, '57e9c215273641e3a67f2151c07ab337',  220, 0, 0, NOW()),  -- 500克钙饼干
(REPLACE(UUID(),'-',''), @DOC_ID, '705cd0f20402438588cc6469a8f0cc94',  410, 0, 0, NOW()),  -- 大切片
(REPLACE(UUID(),'-',''), @DOC_ID, '900e1480a9c4482b830eed25bdd37a91',  288, 0, 0, NOW()),  -- 大老面包
(REPLACE(UUID(),'-',''), @DOC_ID, 'df380547bacb4950a4e400502ba0ffed',  560, 0, 0, NOW()),  -- 小天鹅小面包
(REPLACE(UUID(),'-',''), @DOC_ID, '243e994795ca489cb8aec60cf2bc1d97',  640, 0, 0, NOW()),  -- 手工麻花
(REPLACE(UUID(),'-',''), @DOC_ID, 'aece7f5d92174de0b758d459810ffcb1',  276, 0, 0, NOW()),  -- 拉丝小米面包
(REPLACE(UUID(),'-',''), @DOC_ID, '132662dfb6f749089ab2be0d75a0e106',  576, 0, 0, NOW()),  -- 无糖蛋糕
(REPLACE(UUID(),'-',''), @DOC_ID, 'b36351f34f14494db993f641267f36a5',  192, 0, 0, NOW()),  -- 海绵蛋糕
(REPLACE(UUID(),'-',''), @DOC_ID, '58edc8d15e5f4810a414c0941222b78a',  592, 0, 0, NOW()),  -- 牛奶面包
(REPLACE(UUID(),'-',''), @DOC_ID, '8ae1231378cc4717987a6bb6b20dd383', 1440, 0, 0, NOW()),  -- 牛抵头
(REPLACE(UUID(),'-',''), @DOC_ID, 'b676da29b65e4f7d944794f731af9d18',  180, 0, 0, NOW()),  -- 糟子糕
(REPLACE(UUID(),'-',''), @DOC_ID, 'ce484eae8b974f448f8316d0323b3826',   19, 0, 0, NOW()),  -- 老婆饼
(REPLACE(UUID(),'-',''), @DOC_ID, '0f9dd6bec55447c7b9f393af59c3c286', 1020, 0, 0, NOW()),  -- 芋头酥
(REPLACE(UUID(),'-',''), @DOC_ID, 'd83e34b786f04a3cbe7917fb4bf0ff15',  480, 0, 0, NOW()),  -- 芝麻酥白芝麻
(REPLACE(UUID(),'-',''), @DOC_ID, 'bdd99bce7785474a9e6b56ffc6a5903e',  564, 0, 0, NOW()),  -- 蜂蜜蛋糕
(REPLACE(UUID(),'-',''), @DOC_ID, '1ffb3e0518814cbb97388d8674aae90a',  384, 0, 0, NOW()),  -- 袋桃酥
(REPLACE(UUID(),'-',''), @DOC_ID, '8e3a6f2f07dd421bad58749618c41409',  240, 0, 0, NOW()),  -- 馓子
(REPLACE(UUID(),'-',''), @DOC_ID, 'b05cf5529def48719b9cfe7a57bb5b80',  108, 0, 0, NOW()),  -- 鲜面包
(REPLACE(UUID(),'-',''), @DOC_ID, 'cd2dea827fcf4895a774acd8eac4d671',  544, 0, 0, NOW());  -- 麻叶

-- ============================================================
-- 3. 更新主仓库存（直接写入，与入库单对应）
-- ============================================================
INSERT INTO wh_stock (warehouse_id, product_id, qty) VALUES
('main', '57e9c215273641e3a67f2151c07ab337',  220),  -- 500克钙饼干
('main', '705cd0f20402438588cc6469a8f0cc94',  410),  -- 大切片
('main', '900e1480a9c4482b830eed25bdd37a91',  288),  -- 大老面包
('main', 'df380547bacb4950a4e400502ba0ffed',  560),  -- 小天鹅小面包
('main', '243e994795ca489cb8aec60cf2bc1d97',  640),  -- 手工麻花
('main', 'aece7f5d92174de0b758d459810ffcb1',  276),  -- 拉丝小米面包
('main', '132662dfb6f749089ab2be0d75a0e106',  576),  -- 无糖蛋糕
('main', 'b36351f34f14494db993f641267f36a5',  192),  -- 海绵蛋糕
('main', '58edc8d15e5f4810a414c0941222b78a',  592),  -- 牛奶面包
('main', '8ae1231378cc4717987a6bb6b20dd383', 1440),  -- 牛抵头
('main', 'b676da29b65e4f7d944794f731af9d18',  180),  -- 糟子糕
('main', 'ce484eae8b974f448f8316d0323b3826',   19),  -- 老婆饼
('main', '0f9dd6bec55447c7b9f393af59c3c286', 1020),  -- 芋头酥
('main', 'd83e34b786f04a3cbe7917fb4bf0ff15',  480),  -- 芝麻酥白芝麻
('main', 'bdd99bce7785474a9e6b56ffc6a5903e',  564),  -- 蜂蜜蛋糕
('main', '1ffb3e0518814cbb97388d8674aae90a',  384),  -- 袋桃酥
('main', '8e3a6f2f07dd421bad58749618c41409',  240),  -- 馓子
('main', 'b05cf5529def48719b9cfe7a57bb5b80',  108),  -- 鲜面包
('main', 'cd2dea827fcf4895a774acd8eac4d671',  544)   -- 麻叶
ON DUPLICATE KEY UPDATE qty = VALUES(qty);

-- ============================================================
-- 4. 台账记录
-- ============================================================
INSERT INTO wh_ledger (id, biz_type, doc_id, warehouse_id, product_id, qty, created_at) VALUES
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '57e9c215273641e3a67f2151c07ab337',  220, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '705cd0f20402438588cc6469a8f0cc94',  410, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '900e1480a9c4482b830eed25bdd37a91',  288, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'df380547bacb4950a4e400502ba0ffed',  560, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '243e994795ca489cb8aec60cf2bc1d97',  640, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'aece7f5d92174de0b758d459810ffcb1',  276, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '132662dfb6f749089ab2be0d75a0e106',  576, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'b36351f34f14494db993f641267f36a5',  192, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '58edc8d15e5f4810a414c0941222b78a',  592, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '8ae1231378cc4717987a6bb6b20dd383', 1440, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'b676da29b65e4f7d944794f731af9d18',  180, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'ce484eae8b974f448f8316d0323b3826',   19, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '0f9dd6bec55447c7b9f393af59c3c286', 1020, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'd83e34b786f04a3cbe7917fb4bf0ff15',  480, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'bdd99bce7785474a9e6b56ffc6a5903e',  564, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '1ffb3e0518814cbb97388d8674aae90a',  384, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', '8e3a6f2f07dd421bad58749618c41409',  240, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'b05cf5529def48719b9cfe7a57bb5b80',  108, NOW()),
(REPLACE(UUID(),'-',''), 'inbound', @DOC_ID, 'main', 'cd2dea827fcf4895a774acd8eac4d671',  544, NOW());

-- ============================================================
-- 5. 验证
-- ============================================================
SELECT w.name AS 仓库, p.name AS 商品, s.qty AS 库存
FROM wh_stock s
JOIN wh_warehouse w ON w.id = s.warehouse_id
JOIN wh_product p ON p.id = s.product_id
WHERE s.warehouse_id = 'main' AND s.qty > 0
ORDER BY p.name;

SELECT '入库单已生成' AS 状态, id, code FROM wh_inbound_doc WHERE id = @DOC_ID;
