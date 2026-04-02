USE `warehouse`;
SET NAMES utf8mb4;

-- Migration A: 统一身份主数据到 wh_account 固定四账户，并切换业务归属列到 salesperson_id。

-- 0) 先把历史固定账户重命名到 canonical id，避免唯一键冲突。
UPDATE `wh_account`
SET `id` = 'admin_root'
WHERE `id` = 'a_admin'
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT `id` FROM `wh_account`) existing
    WHERE existing.`id` = 'admin_root'
  );

UPDATE `wh_account`
SET `id` = 'sp_big'
WHERE `id` = 'a_e1'
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT `id` FROM `wh_account`) existing
    WHERE existing.`id` = 'sp_big'
  );

UPDATE `wh_account`
SET `id` = 'sp_small'
WHERE `id` = 'a_e2'
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT `id` FROM `wh_account`) existing
    WHERE existing.`id` = 'sp_small'
  );

UPDATE `wh_account`
SET `id` = 'sp_third'
WHERE `id` = 'a_e3'
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT `id` FROM `wh_account`) existing
    WHERE existing.`id` = 'sp_third'
  );

-- 1) 把旧归属列名切到 salesperson_id，兼容新旧库结构。
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

DROP TEMPORARY TABLE IF EXISTS `tmp_salesperson_map`;
CREATE TEMPORARY TABLE `tmp_salesperson_map` (
  `legacy_id` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `salesperson_id` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`legacy_id`)
) ENGINE=Memory DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `tmp_salesperson_map` (`legacy_id`, `salesperson_id`)
VALUES
('e1', 'sp_big'),
('emp001', 'sp_big'),
('a_e1', 'sp_big'),
('sp_big', 'sp_big'),
('e2', 'sp_small'),
('emp002', 'sp_small'),
('a_e2', 'sp_small'),
('sp_small', 'sp_small'),
('e3', 'sp_third'),
('emp003', 'sp_third'),
('a_e3', 'sp_third'),
('sp_third', 'sp_third');

-- 2) 确保 canonical accounts 存在。
INSERT INTO `wh_account` (`id`, `username`, `display_name`, `role`, `password_hash`, `gesture_hash`, `status`)
SELECT 'admin_root', 'admin', '管理员', 'admin', '7045830c', '43be43aa', 'active'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `wh_account` WHERE `id` = 'admin_root');

INSERT INTO `wh_account` (`id`, `username`, `display_name`, `role`, `password_hash`, `gesture_hash`, `status`)
SELECT 'sp_big', 'bigcar', '大车', 'salesperson', '9995b6aa', 'b0fab432', 'active'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `wh_account` WHERE `id` = 'sp_big');

INSERT INTO `wh_account` (`id`, `username`, `display_name`, `role`, `password_hash`, `gesture_hash`, `status`)
SELECT 'sp_small', 'smallcar', '小车', 'salesperson', '9995b6aa', 'a11067e3', 'active'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `wh_account` WHERE `id` = 'sp_small');

INSERT INTO `wh_account` (`id`, `username`, `display_name`, `role`, `password_hash`, `gesture_hash`, `status`)
SELECT 'sp_third', 'thirdcar', '三车', 'salesperson', '9995b6aa', '534bab36', 'active'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `wh_account` WHERE `id` = 'sp_third');

-- 3) 尽量继承旧固定账户的密码 / 手势 / 状态。
UPDATE `wh_account` target
JOIN `wh_account` source ON source.`id` = 'a_admin'
SET target.`password_hash` = COALESCE(NULLIF(source.`password_hash`, ''), target.`password_hash`),
    target.`gesture_hash` = COALESCE(NULLIF(source.`gesture_hash`, ''), target.`gesture_hash`),
    target.`status` = COALESCE(NULLIF(source.`status`, ''), target.`status`)
WHERE target.`id` = 'admin_root';

UPDATE `wh_account` target
JOIN `wh_account` source ON source.`id` = 'a_e1'
SET target.`password_hash` = COALESCE(NULLIF(source.`password_hash`, ''), target.`password_hash`),
    target.`gesture_hash` = COALESCE(NULLIF(source.`gesture_hash`, ''), target.`gesture_hash`),
    target.`status` = COALESCE(NULLIF(source.`status`, ''), target.`status`)
WHERE target.`id` = 'sp_big';

UPDATE `wh_account` target
JOIN `wh_account` source ON source.`id` = 'a_e2'
SET target.`password_hash` = COALESCE(NULLIF(source.`password_hash`, ''), target.`password_hash`),
    target.`gesture_hash` = COALESCE(NULLIF(source.`gesture_hash`, ''), target.`gesture_hash`),
    target.`status` = COALESCE(NULLIF(source.`status`, ''), target.`status`)
WHERE target.`id` = 'sp_small';

UPDATE `wh_account` target
JOIN `wh_account` source ON source.`id` = 'a_e3'
SET target.`password_hash` = COALESCE(NULLIF(source.`password_hash`, ''), target.`password_hash`),
    target.`gesture_hash` = COALESCE(NULLIF(source.`gesture_hash`, ''), target.`gesture_hash`),
    target.`status` = COALESCE(NULLIF(source.`status`, ''), target.`status`)
WHERE target.`id` = 'sp_third';

-- 4) 锁定 canonical 账户资料。
UPDATE `wh_account`
SET `username` = 'admin',
    `display_name` = '管理员',
    `role` = 'admin'
WHERE `id` = 'admin_root';

UPDATE `wh_account`
SET `username` = 'bigcar',
    `display_name` = '大车',
    `role` = 'salesperson'
WHERE `id` = 'sp_big';

UPDATE `wh_account`
SET `username` = 'smallcar',
    `display_name` = '小车',
    `role` = 'salesperson'
WHERE `id` = 'sp_small';

UPDATE `wh_account`
SET `username` = 'thirdcar',
    `display_name` = '三车',
    `role` = 'salesperson'
WHERE `id` = 'sp_third';

-- 5) 统一业务归属字段到 canonical salesperson accountId。
UPDATE `wh_store` target
JOIN `tmp_salesperson_map` map ON map.`legacy_id` COLLATE utf8mb4_general_ci = target.`salesperson_id` COLLATE utf8mb4_general_ci
SET target.`salesperson_id` = map.`salesperson_id`;

UPDATE `wh_warehouse` target
JOIN `tmp_salesperson_map` map ON map.`legacy_id` COLLATE utf8mb4_general_ci = target.`salesperson_id` COLLATE utf8mb4_general_ci
SET target.`salesperson_id` = map.`salesperson_id`;

UPDATE `wh_sale_doc` target
JOIN `tmp_salesperson_map` map ON map.`legacy_id` COLLATE utf8mb4_general_ci = target.`salesperson_id` COLLATE utf8mb4_general_ci
SET target.`salesperson_id` = map.`salesperson_id`;

UPDATE `wh_return_doc` target
JOIN `tmp_salesperson_map` map ON map.`legacy_id` COLLATE utf8mb4_general_ci = target.`salesperson_id` COLLATE utf8mb4_general_ci
SET target.`salesperson_id` = map.`salesperson_id`;

UPDATE `wh_outbound_doc` target
JOIN `tmp_salesperson_map` map ON map.`legacy_id` COLLATE utf8mb4_general_ci = target.`salesperson_id` COLLATE utf8mb4_general_ci
SET target.`salesperson_id` = map.`salesperson_id`;

UPDATE `wh_commission_ledger` target
JOIN `tmp_salesperson_map` map ON map.`legacy_id` COLLATE utf8mb4_general_ci = target.`salesperson_id` COLLATE utf8mb4_general_ci
SET target.`salesperson_id` = map.`salesperson_id`;

-- 6) 统一车库主数据与引用。
INSERT INTO `wh_warehouse` (`id`, `name`, `type`, `salesperson_id`)
SELECT 'veh_sp_big', '大车(车库)', 'vehicle', 'sp_big'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `wh_warehouse` WHERE `id` = 'veh_sp_big');

INSERT INTO `wh_warehouse` (`id`, `name`, `type`, `salesperson_id`)
SELECT 'veh_sp_small', '小车(车库)', 'vehicle', 'sp_small'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `wh_warehouse` WHERE `id` = 'veh_sp_small');

INSERT INTO `wh_warehouse` (`id`, `name`, `type`, `salesperson_id`)
SELECT 'veh_sp_third', '三车(车库)', 'vehicle', 'sp_third'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `wh_warehouse` WHERE `id` = 'veh_sp_third');

UPDATE `wh_sale_doc`
SET `warehouse_id` = CASE `warehouse_id`
    WHEN 'veh_e1' THEN 'veh_sp_big'
    WHEN 'veh_emp001' THEN 'veh_sp_big'
    WHEN 'veh_e2' THEN 'veh_sp_small'
    WHEN 'veh_emp002' THEN 'veh_sp_small'
    WHEN 'veh_e3' THEN 'veh_sp_third'
    WHEN 'veh_emp003' THEN 'veh_sp_third'
    ELSE `warehouse_id`
END
WHERE `warehouse_id` IS NOT NULL;

UPDATE `wh_return_doc`
SET `from_warehouse_id` = CASE `from_warehouse_id`
    WHEN 'veh_e1' THEN 'veh_sp_big'
    WHEN 'veh_emp001' THEN 'veh_sp_big'
    WHEN 'veh_e2' THEN 'veh_sp_small'
    WHEN 'veh_emp002' THEN 'veh_sp_small'
    WHEN 'veh_e3' THEN 'veh_sp_third'
    WHEN 'veh_emp003' THEN 'veh_sp_third'
    ELSE `from_warehouse_id`
END
WHERE `from_warehouse_id` IS NOT NULL;

UPDATE `wh_return_doc`
SET `to_warehouse_id` = CASE `to_warehouse_id`
    WHEN 'veh_e1' THEN 'veh_sp_big'
    WHEN 'veh_emp001' THEN 'veh_sp_big'
    WHEN 'veh_e2' THEN 'veh_sp_small'
    WHEN 'veh_emp002' THEN 'veh_sp_small'
    WHEN 'veh_e3' THEN 'veh_sp_third'
    WHEN 'veh_emp003' THEN 'veh_sp_third'
    ELSE `to_warehouse_id`
END
WHERE `to_warehouse_id` IS NOT NULL;

UPDATE `wh_outbound_doc`
SET `warehouse_id` = CASE `warehouse_id`
    WHEN 'veh_e1' THEN 'veh_sp_big'
    WHEN 'veh_emp001' THEN 'veh_sp_big'
    WHEN 'veh_e2' THEN 'veh_sp_small'
    WHEN 'veh_emp002' THEN 'veh_sp_small'
    WHEN 'veh_e3' THEN 'veh_sp_third'
    WHEN 'veh_emp003' THEN 'veh_sp_third'
    ELSE `warehouse_id`
END
WHERE `warehouse_id` IS NOT NULL;

UPDATE `wh_ledger`
SET `warehouse_id` = CASE `warehouse_id`
    WHEN 'veh_e1' THEN 'veh_sp_big'
    WHEN 'veh_emp001' THEN 'veh_sp_big'
    WHEN 'veh_e2' THEN 'veh_sp_small'
    WHEN 'veh_emp002' THEN 'veh_sp_small'
    WHEN 'veh_e3' THEN 'veh_sp_third'
    WHEN 'veh_emp003' THEN 'veh_sp_third'
    ELSE `warehouse_id`
END;

INSERT INTO `wh_stock` (`warehouse_id`, `product_id`, `qty`, `updated_at`)
SELECT CASE `warehouse_id`
        WHEN 'veh_e1' THEN 'veh_sp_big'
        WHEN 'veh_emp001' THEN 'veh_sp_big'
        WHEN 'veh_e2' THEN 'veh_sp_small'
        WHEN 'veh_emp002' THEN 'veh_sp_small'
        WHEN 'veh_e3' THEN 'veh_sp_third'
        WHEN 'veh_emp003' THEN 'veh_sp_third'
        ELSE `warehouse_id`
    END AS `warehouse_id`,
    `product_id`,
    SUM(`qty`) AS `qty`,
    MAX(`updated_at`) AS `updated_at`
FROM `wh_stock`
GROUP BY CASE `warehouse_id`
        WHEN 'veh_e1' THEN 'veh_sp_big'
        WHEN 'veh_emp001' THEN 'veh_sp_big'
        WHEN 'veh_e2' THEN 'veh_sp_small'
        WHEN 'veh_emp002' THEN 'veh_sp_small'
        WHEN 'veh_e3' THEN 'veh_sp_third'
        WHEN 'veh_emp003' THEN 'veh_sp_third'
        ELSE `warehouse_id`
    END,
    `product_id`
ON DUPLICATE KEY UPDATE
    `qty` = VALUES(`qty`),
    `updated_at` = GREATEST(`updated_at`, VALUES(`updated_at`));

DELETE FROM `wh_stock`
WHERE `warehouse_id` IN ('veh_e1', 'veh_emp001', 'veh_e2', 'veh_emp002', 'veh_e3', 'veh_emp003');

UPDATE `wh_warehouse`
SET `name` = '大车(车库)',
    `type` = 'vehicle',
    `salesperson_id` = 'sp_big'
WHERE `id` = 'veh_sp_big';

UPDATE `wh_warehouse`
SET `name` = '小车(车库)',
    `type` = 'vehicle',
    `salesperson_id` = 'sp_small'
WHERE `id` = 'veh_sp_small';

UPDATE `wh_warehouse`
SET `name` = '三车(车库)',
    `type` = 'vehicle',
    `salesperson_id` = 'sp_third'
WHERE `id` = 'veh_sp_third';

DELETE FROM `wh_warehouse`
WHERE `id` IN ('veh_e1', 'veh_emp001', 'veh_e2', 'veh_emp002', 'veh_e3', 'veh_emp003');

-- 7) 清理兼容结构，避免继续暴露旧身份。
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

DELETE FROM `wh_account`
WHERE `id` IN ('a_admin', 'a_e1', 'a_e2', 'a_e3');

DELETE FROM `wh_account`
WHERE `username` IN ('zhaoming', 'qianlei', 'sunli')
  AND `id` NOT IN ('sp_big', 'sp_small', 'sp_third');

DROP TEMPORARY TABLE IF EXISTS `tmp_salesperson_map`;
