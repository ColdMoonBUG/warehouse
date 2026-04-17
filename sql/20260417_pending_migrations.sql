-- 待执行迁移（兼容重复执行，所有 ALTER 都检查列是否存在）
USE `warehouse`;
SET NAMES utf8mb4;

-- ============================================================
-- 来自 20260401_normalize_bag_unit_and_box_qty.sql
-- ============================================================

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_sale_line` ADD COLUMN `box_qty` INT DEFAULT 0 COMMENT ''箱数'' AFTER `product_id`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_line' AND COLUMN_NAME='box_qty');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_return_line` ADD COLUMN `box_qty` INT DEFAULT 0 COMMENT ''箱数'' AFTER `product_id`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_return_line' AND COLUMN_NAME='box_qty');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_outbound_line` ADD COLUMN `box_qty` INT DEFAULT 0 COMMENT ''箱数'' AFTER `product_id`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_outbound_line' AND COLUMN_NAME='box_qty');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- ============================================================
-- 来自 20260413_sale_doc_type_and_settled.sql
-- ============================================================

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_sale_doc` ADD COLUMN `doc_type` VARCHAR(20) NOT NULL DEFAULT ''sale'' COMMENT ''单据类型: sale=销售 gift=赠送'' AFTER `status`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND COLUMN_NAME='doc_type');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_sale_doc` ADD COLUMN `settled` TINYINT NOT NULL DEFAULT 0 COMMENT ''货款状态: 0=未收款 1=已收款'' AFTER `doc_type`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND COLUMN_NAME='settled');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_sale_doc` ADD COLUMN `settled_at` DATETIME DEFAULT NULL COMMENT ''收款确认时间'' AFTER `settled`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND COLUMN_NAME='settled_at');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_sale_doc` ADD COLUMN `settled_by` VARCHAR(32) DEFAULT NULL COMMENT ''确认收款操作人ID'' AFTER `settled_at`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND COLUMN_NAME='settled_by');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_sale_doc` ADD KEY `idx_settled` (`settled`)',
  'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND INDEX_NAME='idx_settled');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- ============================================================
-- return_doc_id：关联退单（sales/create.vue 同时创建退单功能需要）
-- ============================================================

SET @s = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `wh_sale_doc` ADD COLUMN `return_doc_id` VARCHAR(32) DEFAULT NULL COMMENT ''关联退单ID'' AFTER `settled_by`',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND COLUMN_NAME='return_doc_id');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
