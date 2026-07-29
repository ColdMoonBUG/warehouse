-- 20260723 迁移：明细行号 line_no + 商品克重 weight
-- 幂等写法：列已存在则跳过，可安全重复执行
-- 生产库部署新后端前执行一次即可
USE `warehouse`;
SET NAMES utf8mb4;

-- ============================================================
-- wh_sale_line.line_no：销单明细行号（录入顺序，打印/重建排序用）
-- ============================================================
SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_sale_line` ADD COLUMN `line_no` INT NOT NULL DEFAULT 0 COMMENT ''行号(录入顺序)'' AFTER `product_id`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_line' AND COLUMN_NAME='line_no');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- ============================================================
-- wh_return_line.line_no：退单明细行号
-- ============================================================
SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_return_line` ADD COLUMN `line_no` INT NOT NULL DEFAULT 0 COMMENT ''行号(录入顺序)'' AFTER `product_id`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_return_line' AND COLUMN_NAME='line_no');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- ============================================================
-- wh_product.weight：商品克重（VARCHAR，可带单位，可留空）
-- ============================================================
SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_product` ADD COLUMN `weight` VARCHAR(20) DEFAULT NULL COMMENT ''克重'' AFTER `shelf_days`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_product' AND COLUMN_NAME='weight');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
