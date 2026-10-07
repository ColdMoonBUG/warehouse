-- 20261007 查询索引（可选，只加索引、不改表结构和数据）
-- 作用：App 按“业务员 + 日期”查单、按创建时间翻页、销单↔退单关联反查时直接走索引。
-- 不执行也能正常运行新版后端，只是数据量大了以后这些查询会慢一些。
-- 幂等：索引已存在则跳过，可重复执行；MySQL 8 在线加索引，不锁表，旧版后端照常可用。
-- 回滚（一般不需要）：ALTER TABLE <表> DROP INDEX <索引名>;
-- 手动执行：mysql -u<用户> -p <库名> < sql/20261007_query_indexes.sql（作用于命令里指定的库）
SET NAMES utf8mb4;

-- 销单：App 列表（业务员 + 日期）
SET @s = (SELECT IF(COUNT(*)=0, 'ALTER TABLE `wh_sale_doc` ADD INDEX `idx_sp_date` (`salesperson_id`, `doc_date`)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND INDEX_NAME='idx_sp_date');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- 销单：后台列表按创建时间倒序翻页
SET @s = (SELECT IF(COUNT(*)=0, 'ALTER TABLE `wh_sale_doc` ADD INDEX `idx_created_at` (`created_at`)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND INDEX_NAME='idx_created_at');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- 销单：由退单反查关联销单
SET @s = (SELECT IF(COUNT(*)=0, 'ALTER TABLE `wh_sale_doc` ADD INDEX `idx_return_doc_id` (`return_doc_id`)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_sale_doc' AND INDEX_NAME='idx_return_doc_id');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- 退单：App 列表（业务员 + 日期）
SET @s = (SELECT IF(COUNT(*)=0, 'ALTER TABLE `wh_return_doc` ADD INDEX `idx_sp_date` (`salesperson_id`, `doc_date`)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_return_doc' AND INDEX_NAME='idx_sp_date');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- 退单：后台列表按创建时间倒序翻页
SET @s = (SELECT IF(COUNT(*)=0, 'ALTER TABLE `wh_return_doc` ADD INDEX `idx_created_at` (`created_at`)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_return_doc' AND INDEX_NAME='idx_created_at');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- 出库单：按调出仓 + 日期计算“出库后剩余”
SET @s = (SELECT IF(COUNT(*)=0, 'ALTER TABLE `wh_transfer_doc` ADD INDEX `idx_from_date` (`from_warehouse_id`, `doc_date`)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_transfer_doc' AND INDEX_NAME='idx_from_date');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- 提成流水：工资统计按业务员汇总
SET @s = (SELECT IF(COUNT(*)=0, 'ALTER TABLE `wh_commission_ledger` ADD INDEX `idx_sp_settlement` (`salesperson_id`, `settlement_id`)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wh_commission_ledger' AND INDEX_NAME='idx_sp_settlement');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
