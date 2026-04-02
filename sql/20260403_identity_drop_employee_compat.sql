USE `warehouse`;
SET NAMES utf8mb4;

-- Migration B: 在所有前后端调用都停止依赖 employee 模型后，确保物理列名统一为 salesperson_id。
-- 前置条件：
-- 1. /api/employee 相关接口与页面已下线；
-- 2. Account / Session 不再读取 wh_account.employee_id；
-- 3. 门店、车库、单据、提成归属列中保存的都是 canonical salesperson accountId。

SET @rename_store_salesperson = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_store' AND COLUMN_NAME = 'default_employee_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_store' AND COLUMN_NAME = 'salesperson_id'
    )
      THEN 'ALTER TABLE `wh_store` CHANGE COLUMN `default_employee_id` `salesperson_id` VARCHAR(32) DEFAULT NULL COMMENT ''默认业务员账户ID'''
    ELSE 'SELECT ''skip: wh_store salesperson_id ready'''
  END
);
PREPARE stmt FROM @rename_store_salesperson;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @rename_warehouse_salesperson = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_warehouse' AND COLUMN_NAME = 'employee_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_warehouse' AND COLUMN_NAME = 'salesperson_id'
    )
      THEN 'ALTER TABLE `wh_warehouse` CHANGE COLUMN `employee_id` `salesperson_id` VARCHAR(32) DEFAULT NULL COMMENT ''业务员账户ID(车载仓)'''
    ELSE 'SELECT ''skip: wh_warehouse salesperson_id ready'''
  END
);
PREPARE stmt FROM @rename_warehouse_salesperson;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @rename_sale_salesperson = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_sale_doc' AND COLUMN_NAME = 'employee_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_sale_doc' AND COLUMN_NAME = 'salesperson_id'
    )
      THEN 'ALTER TABLE `wh_sale_doc` CHANGE COLUMN `employee_id` `salesperson_id` VARCHAR(32) NOT NULL COMMENT ''业务员账户ID'''
    ELSE 'SELECT ''skip: wh_sale_doc salesperson_id ready'''
  END
);
PREPARE stmt FROM @rename_sale_salesperson;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @rename_return_salesperson = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_return_doc' AND COLUMN_NAME = 'employee_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_return_doc' AND COLUMN_NAME = 'salesperson_id'
    )
      THEN 'ALTER TABLE `wh_return_doc` CHANGE COLUMN `employee_id` `salesperson_id` VARCHAR(32) NOT NULL COMMENT ''业务员账户ID'''
    ELSE 'SELECT ''skip: wh_return_doc salesperson_id ready'''
  END
);
PREPARE stmt FROM @rename_return_salesperson;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @rename_outbound_salesperson = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_outbound_doc' AND COLUMN_NAME = 'employee_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_outbound_doc' AND COLUMN_NAME = 'salesperson_id'
    )
      THEN 'ALTER TABLE `wh_outbound_doc` CHANGE COLUMN `employee_id` `salesperson_id` VARCHAR(32) NOT NULL COMMENT ''业务员账户ID'''
    ELSE 'SELECT ''skip: wh_outbound_doc salesperson_id ready'''
  END
);
PREPARE stmt FROM @rename_outbound_salesperson;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @rename_commission_salesperson = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_commission_ledger' AND COLUMN_NAME = 'employee_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wh_commission_ledger' AND COLUMN_NAME = 'salesperson_id'
    )
      THEN 'ALTER TABLE `wh_commission_ledger` CHANGE COLUMN `employee_id` `salesperson_id` VARCHAR(32) NOT NULL COMMENT ''业务员账户ID'''
    ELSE 'SELECT ''skip: wh_commission_ledger salesperson_id ready'''
  END
);
PREPARE stmt FROM @rename_commission_salesperson;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `wh_store`
  MODIFY COLUMN `salesperson_id` VARCHAR(32) DEFAULT NULL COMMENT '默认业务员账户ID';

ALTER TABLE `wh_warehouse`
  MODIFY COLUMN `salesperson_id` VARCHAR(32) DEFAULT NULL COMMENT '业务员账户ID(车载仓)';

ALTER TABLE `wh_sale_doc`
  MODIFY COLUMN `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID';

ALTER TABLE `wh_return_doc`
  MODIFY COLUMN `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID';

ALTER TABLE `wh_outbound_doc`
  MODIFY COLUMN `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID';

ALTER TABLE `wh_commission_ledger`
  MODIFY COLUMN `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID';

SET @drop_account_employee_id = (
  SELECT IF(
    COUNT(*) = 0,
    'SELECT ''skip: wh_account.employee_id missing''',
    'ALTER TABLE `wh_account` DROP COLUMN `employee_id`'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wh_account'
    AND COLUMN_NAME = 'employee_id'
);
PREPARE stmt FROM @drop_account_employee_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS `wh_employee`;
