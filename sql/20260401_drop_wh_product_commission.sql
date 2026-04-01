-- 删除 wh_product.commission 列（兼容重复执行）
USE `warehouse`;
SET NAMES utf8mb4;

SET @drop_sql = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE `wh_product` DROP COLUMN `commission`',
    'SELECT ''skip: wh_product.commission not found'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wh_product'
    AND COLUMN_NAME = 'commission'
);

PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
