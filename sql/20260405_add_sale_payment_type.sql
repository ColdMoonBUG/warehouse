SET NAMES utf8mb4;

SET @add_payment_type = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_sale_doc' AND COLUMN_NAME = 'payment_type'
    ),
    'SELECT ''skip: payment_type exists''',
    'ALTER TABLE `wh_sale_doc` ADD COLUMN `payment_type` VARCHAR(16) NOT NULL DEFAULT ''cash'' COMMENT ''结算方式: cash/bill'' AFTER `doc_date`'
  )
);
PREPARE stmt FROM @add_payment_type;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `wh_sale_doc`
SET `payment_type` = 'cash'
WHERE `payment_type` IS NULL OR `payment_type` NOT IN ('cash', 'bill');
