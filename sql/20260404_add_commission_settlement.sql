SET NAMES utf8mb4;

SET @add_settlement_id = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_commission_ledger' AND COLUMN_NAME = 'settlement_id'
    ),
    'SELECT ''skip: settlement_id exists''',
    'ALTER TABLE `wh_commission_ledger` ADD COLUMN `settlement_id` VARCHAR(32) DEFAULT NULL COMMENT ''结清批次ID'' AFTER `commission_amount`'
  )
);
PREPARE stmt FROM @add_settlement_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_settled_at = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_commission_ledger' AND COLUMN_NAME = 'settled_at'
    ),
    'SELECT ''skip: settled_at exists''',
    'ALTER TABLE `wh_commission_ledger` ADD COLUMN `settled_at` DATETIME DEFAULT NULL COMMENT ''结清时间'' AFTER `settlement_id`'
  )
);
PREPARE stmt FROM @add_settled_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_settlement_idx = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_commission_ledger' AND INDEX_NAME = 'idx_settlement_id'
    ),
    'SELECT ''skip: idx_settlement_id exists''',
    'ALTER TABLE `wh_commission_ledger` ADD KEY `idx_settlement_id` (`settlement_id`)'
  )
);
PREPARE stmt FROM @add_settlement_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `wh_commission_settlement` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID',
  `settled_by` VARCHAR(32) NOT NULL COMMENT '结清操作人账户ID',
  `sale_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '销售净提成',
  `return_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '退货净提成',
  `total_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '结清总额',
  `ledger_count` INT NOT NULL DEFAULT 0 COMMENT '结清流水笔数',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_salesperson_id` (`salesperson_id`),
  KEY `idx_settled_by` (`settled_by`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提成结清表';
