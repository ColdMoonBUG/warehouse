-- 统一基础单位为“袋”，补齐箱数字段（兼容重复执行）
USE `warehouse`;
SET NAMES utf8mb4;

SET @sale_line_add_box_qty = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `wh_sale_line` ADD COLUMN `box_qty` INT DEFAULT 0 COMMENT ''箱数'' AFTER `product_id`',
    'SELECT ''skip: wh_sale_line.box_qty exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wh_sale_line'
    AND COLUMN_NAME = 'box_qty'
);
PREPARE stmt FROM @sale_line_add_box_qty;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @return_line_add_box_qty = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `wh_return_line` ADD COLUMN `box_qty` INT DEFAULT 0 COMMENT ''箱数'' AFTER `product_id`',
    'SELECT ''skip: wh_return_line.box_qty exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wh_return_line'
    AND COLUMN_NAME = 'box_qty'
);
PREPARE stmt FROM @return_line_add_box_qty;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @outbound_line_add_box_qty = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `wh_outbound_line` ADD COLUMN `box_qty` INT DEFAULT 0 COMMENT ''箱数'' AFTER `product_id`',
    'SELECT ''skip: wh_outbound_line.box_qty exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wh_outbound_line'
    AND COLUMN_NAME = 'box_qty'
);
PREPARE stmt FROM @outbound_line_add_box_qty;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `wh_product`
  MODIFY COLUMN `unit` VARCHAR(20) DEFAULT '袋' COMMENT '基础单位(袋)',
  MODIFY COLUMN `box_qty` INT DEFAULT 1 COMMENT '每箱袋数';

ALTER TABLE `wh_sale_doc`
  MODIFY COLUMN `total_qty` INT DEFAULT 0 COMMENT '总袋数';

ALTER TABLE `wh_outbound_doc`
  MODIFY COLUMN `total_qty` INT DEFAULT 0 COMMENT '总袋数';

ALTER TABLE `wh_return_doc`
  MODIFY COLUMN `total_qty` INT DEFAULT 0 COMMENT '总袋数';

ALTER TABLE `wh_sale_line`
  MODIFY COLUMN `box_qty` INT DEFAULT 0 COMMENT '箱数',
  MODIFY COLUMN `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数';

ALTER TABLE `wh_return_line`
  MODIFY COLUMN `box_qty` INT DEFAULT 0 COMMENT '箱数',
  MODIFY COLUMN `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数';

ALTER TABLE `wh_outbound_line`
  MODIFY COLUMN `box_qty` INT DEFAULT 0 COMMENT '箱数',
  MODIFY COLUMN `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数';

ALTER TABLE `wh_inbound_line`
  MODIFY COLUMN `box_qty` INT DEFAULT 0 COMMENT '箱数',
  MODIFY COLUMN `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数';

ALTER TABLE `wh_transfer_line`
  MODIFY COLUMN `box_qty` INT DEFAULT 0 COMMENT '箱数',
  MODIFY COLUMN `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数';

ALTER TABLE `wh_stock`
  MODIFY COLUMN `qty` INT NOT NULL DEFAULT 0 COMMENT '库存袋数';

ALTER TABLE `wh_ledger`
  MODIFY COLUMN `qty` INT NOT NULL COMMENT '袋数(正入库负出库)';

ALTER TABLE `wh_commission_ledger`
  MODIFY COLUMN `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数';

UPDATE `wh_product`
SET `unit` = '袋'
WHERE `unit` IS NULL OR TRIM(`unit`) = '' OR `unit` <> '袋';

UPDATE `wh_product`
SET `box_qty` = 1
WHERE `box_qty` IS NULL OR `box_qty` < 1;

UPDATE `wh_sale_line`
SET `box_qty` = 0
WHERE `box_qty` IS NULL;

UPDATE `wh_return_line`
SET `box_qty` = 0
WHERE `box_qty` IS NULL;

UPDATE `wh_outbound_line`
SET `box_qty` = 0
WHERE `box_qty` IS NULL;
