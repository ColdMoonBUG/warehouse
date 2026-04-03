-- Full database initialization for warehouse
-- Run in a privileged MySQL session, for example:
--   sudo mysql < /home/bug/CODE/ERP/warehouse/sql/warehouse_full_init.sql
-- This script will recreate business tables, seed demo data,
-- and ensure the application user warehouse/warehouse123 exists.

CREATE DATABASE IF NOT EXISTS `warehouse` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `warehouse`;
SET NAMES utf8mb4;

-- 1. 账户表
DROP TABLE IF EXISTS `wh_account`;
CREATE TABLE `wh_account` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `username` VARCHAR(50) NOT NULL COMMENT '用户名',
  `display_name` VARCHAR(255) NOT NULL COMMENT '显示名称',
  `role` VARCHAR(20) NOT NULL DEFAULT 'salesperson' COMMENT '角色: admin/salesperson',
  `password_hash` VARCHAR(64) NOT NULL COMMENT '密码hash',
  `gesture_hash` VARCHAR(64) DEFAULT NULL COMMENT '手势密码hash',
  `status` VARCHAR(10) NOT NULL DEFAULT 'active' COMMENT '状态: active/inactive',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账户表';

-- 3. 供应商表
DROP TABLE IF EXISTS `wh_supplier`;
CREATE TABLE `wh_supplier` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `code` VARCHAR(50) NOT NULL COMMENT '供应商编码',
  `name` VARCHAR(200) NOT NULL COMMENT '供应商名称',
  `contact` VARCHAR(50) DEFAULT NULL COMMENT '联系人',
  `phone` VARCHAR(20) DEFAULT NULL COMMENT '联系电话',
  `address` VARCHAR(500) DEFAULT NULL COMMENT '地址',
  `status` VARCHAR(10) NOT NULL DEFAULT 'active' COMMENT '状态: active/inactive',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商表';

-- 4. 商品表
DROP TABLE IF EXISTS `wh_product`;
CREATE TABLE `wh_product` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `code` VARCHAR(50) NOT NULL COMMENT '商品编码',
  `name` VARCHAR(200) NOT NULL COMMENT '商品名称',
  `image_url` VARCHAR(500) DEFAULT NULL COMMENT '商品图片地址',
  `barcode` VARCHAR(64) DEFAULT NULL COMMENT '条形码',
  `supplier_id` VARCHAR(32) DEFAULT NULL COMMENT '供应商ID',
  `unit` VARCHAR(20) DEFAULT '袋' COMMENT '基础单位(袋)',
  `box_qty` INT DEFAULT 1 COMMENT '每箱袋数',
  `shelf_days` INT DEFAULT 365 COMMENT '保质期(天)',
  `purchase_price` DECIMAL(10,2) DEFAULT 0 COMMENT '采购价',
  `sale_price` DECIMAL(10,2) DEFAULT 0 COMMENT '销售价',
  `status` VARCHAR(10) NOT NULL DEFAULT 'active' COMMENT '状态: active/inactive',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_supplier_id` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表';

-- 5. 门店表
DROP TABLE IF EXISTS `wh_store`;
CREATE TABLE `wh_store` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `code` VARCHAR(50) DEFAULT NULL COMMENT '门店编码',
  `name` VARCHAR(200) NOT NULL COMMENT '门店名称',
  `address` VARCHAR(500) DEFAULT NULL COMMENT '地址',
  `salesperson_id` VARCHAR(32) DEFAULT NULL COMMENT '默认业务员账户ID',
  `lat` DECIMAL(10,6) DEFAULT NULL COMMENT '纬度',
  `lng` DECIMAL(10,6) DEFAULT NULL COMMENT '经度',
  `scale` TINYINT DEFAULT 1 COMMENT '规模: 1小 2中 3大 4超大',
  `status` VARCHAR(10) NOT NULL DEFAULT 'active' COMMENT '状态: active/inactive',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_salesperson_id` (`salesperson_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店表';

-- 6. 仓库表
DROP TABLE IF EXISTS `wh_warehouse`;
CREATE TABLE `wh_warehouse` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `name` VARCHAR(100) NOT NULL COMMENT '仓库名称',
  `type` VARCHAR(20) NOT NULL DEFAULT 'main' COMMENT '类型: main主仓 vehicle车载',
  `salesperson_id` VARCHAR(32) DEFAULT NULL COMMENT '业务员账户ID(车载仓)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_salesperson_id` (`salesperson_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仓库表';

-- 7. 销售单主表
DROP TABLE IF EXISTS `wh_sale_doc`;
CREATE TABLE `wh_sale_doc` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `code` VARCHAR(50) NOT NULL COMMENT '单据编号',
  `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID',
  `store_id` VARCHAR(32) NOT NULL COMMENT '门店ID',
  `warehouse_id` VARCHAR(32) DEFAULT NULL COMMENT '出库车库ID',
  `doc_date` DATE NOT NULL COMMENT '单据日期',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',
  `status` VARCHAR(10) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/posted/voided',
  `total_qty` INT DEFAULT 0 COMMENT '总袋数',
  `total_amount` DECIMAL(12,2) DEFAULT 0 COMMENT '总金额',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_salesperson_id` (`salesperson_id`),
  KEY `idx_store_id` (`store_id`),
  KEY `idx_warehouse_id` (`warehouse_id`),
  KEY `idx_doc_date` (`doc_date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售单主表';

-- 8. 销售单明细表
DROP TABLE IF EXISTS `wh_sale_line`;
CREATE TABLE `wh_sale_line` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `doc_id` VARCHAR(32) NOT NULL COMMENT '销售单ID',
  `product_id` VARCHAR(32) NOT NULL COMMENT '商品ID',
  `box_qty` INT DEFAULT 0 COMMENT '箱数',
  `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价',
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '金额',
  PRIMARY KEY (`id`),
  KEY `idx_doc_id` (`doc_id`),
  KEY `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售单明细表';

-- 9. 库存表
DROP TABLE IF EXISTS `wh_stock`;
CREATE TABLE `wh_stock` (
  `warehouse_id` VARCHAR(32) NOT NULL COMMENT '仓库ID',
  `product_id` VARCHAR(32) NOT NULL COMMENT '商品ID',
  `qty` INT NOT NULL DEFAULT 0 COMMENT '库存袋数',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`warehouse_id`, `product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存表';

-- 10. 入库单主表
DROP TABLE IF EXISTS `wh_inbound_doc`;
CREATE TABLE `wh_inbound_doc` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `code` VARCHAR(50) NOT NULL COMMENT '单据编号',
  `supplier_id` VARCHAR(32) NOT NULL COMMENT '供应商ID',
  `doc_date` DATE NOT NULL COMMENT '单据日期',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',
  `status` VARCHAR(10) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/posted/voided',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_supplier_id` (`supplier_id`),
  KEY `idx_doc_date` (`doc_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入库单主表';

-- 11. 入库单明细表
DROP TABLE IF EXISTS `wh_inbound_line`;
CREATE TABLE `wh_inbound_line` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `doc_id` VARCHAR(32) NOT NULL COMMENT '入库单ID',
  `product_id` VARCHAR(32) NOT NULL COMMENT '商品ID',
  `mfg_date` DATE DEFAULT NULL COMMENT '生产日期',
  `exp_date` DATE DEFAULT NULL COMMENT '过期日期',
  `box_qty` INT DEFAULT 0 COMMENT '箱数',
  `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价',
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '金额',
  PRIMARY KEY (`id`),
  KEY `idx_doc_id` (`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入库单明细表';

-- 12. 调拨单主表
DROP TABLE IF EXISTS `wh_transfer_doc`;
CREATE TABLE `wh_transfer_doc` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `code` VARCHAR(50) NOT NULL COMMENT '单据编号',
  `from_warehouse_id` VARCHAR(32) NOT NULL COMMENT '源仓库ID',
  `to_warehouse_id` VARCHAR(32) NOT NULL COMMENT '目标仓库ID',
  `doc_date` DATE NOT NULL COMMENT '单据日期',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',
  `status` VARCHAR(10) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/posted/voided',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_doc_date` (`doc_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='调拨单主表';

-- 13. 调拨单明细表
DROP TABLE IF EXISTS `wh_transfer_line`;
CREATE TABLE `wh_transfer_line` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `doc_id` VARCHAR(32) NOT NULL COMMENT '调拨单ID',
  `product_id` VARCHAR(32) NOT NULL COMMENT '商品ID',
  `box_qty` INT DEFAULT 0 COMMENT '箱数',
  `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数',
  PRIMARY KEY (`id`),
  KEY `idx_doc_id` (`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='调拨单明细表';

-- 14. 库存台账表
DROP TABLE IF EXISTS `wh_ledger`;
CREATE TABLE `wh_ledger` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `biz_type` VARCHAR(20) NOT NULL COMMENT '业务类型: inbound/transfer/sale',
  `doc_id` VARCHAR(32) NOT NULL COMMENT '单据ID',
  `warehouse_id` VARCHAR(32) NOT NULL COMMENT '仓库ID',
  `product_id` VARCHAR(32) NOT NULL COMMENT '商品ID',
  `qty` INT NOT NULL COMMENT '袋数(正入库负出库)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_warehouse_product` (`warehouse_id`, `product_id`),
  KEY `idx_doc_id` (`doc_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存台账表';

-- 15. 退货单主表
DROP TABLE IF EXISTS `wh_return_doc`;
CREATE TABLE `wh_return_doc` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `code` VARCHAR(50) NOT NULL COMMENT '单据编号',
  `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID',
  `store_id` VARCHAR(32) NOT NULL COMMENT '门店ID',
  `doc_date` DATE NOT NULL COMMENT '单据日期',
  `return_type` VARCHAR(20) NOT NULL DEFAULT 'vehicle_return' COMMENT '退货类型',
  `from_warehouse_id` VARCHAR(32) DEFAULT NULL COMMENT '退货来源仓库',
  `to_warehouse_id` VARCHAR(32) DEFAULT NULL COMMENT '退货目标仓库',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',
  `status` VARCHAR(10) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/posted/voided',
  `total_qty` INT DEFAULT 0 COMMENT '总袋数',
  `total_amount` DECIMAL(12,2) DEFAULT 0 COMMENT '总金额',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_salesperson_id` (`salesperson_id`),
  KEY `idx_store_id` (`store_id`),
  KEY `idx_doc_date` (`doc_date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='退货单主表';

-- 16. 退货单明细表
DROP TABLE IF EXISTS `wh_return_line`;
CREATE TABLE `wh_return_line` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `doc_id` VARCHAR(32) NOT NULL COMMENT '退货单ID',
  `product_id` VARCHAR(32) NOT NULL COMMENT '商品ID',
  `box_qty` INT DEFAULT 0 COMMENT '箱数',
  `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价',
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '金额',
  PRIMARY KEY (`id`),
  KEY `idx_doc_id` (`doc_id`),
  KEY `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='退货单明细表';

-- 17. 出库单主表
DROP TABLE IF EXISTS `wh_outbound_doc`;
CREATE TABLE `wh_outbound_doc` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `code` VARCHAR(50) NOT NULL COMMENT '单据编号',
  `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID',
  `warehouse_id` VARCHAR(32) NOT NULL COMMENT '出库仓库ID',
  `doc_date` DATE NOT NULL COMMENT '单据日期',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',
  `status` VARCHAR(10) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/posted/voided',
  `total_qty` INT DEFAULT 0 COMMENT '总袋数',
  `total_amount` DECIMAL(12,2) DEFAULT 0 COMMENT '总金额',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_salesperson_id` (`salesperson_id`),
  KEY `idx_warehouse_id` (`warehouse_id`),
  KEY `idx_doc_date` (`doc_date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='出库单主表';

-- 18. 出库单明细表
DROP TABLE IF EXISTS `wh_outbound_line`;
CREATE TABLE `wh_outbound_line` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `doc_id` VARCHAR(32) NOT NULL COMMENT '出库单ID',
  `product_id` VARCHAR(32) NOT NULL COMMENT '商品ID',
  `box_qty` INT DEFAULT 0 COMMENT '箱数',
  `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价',
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '金额',
  PRIMARY KEY (`id`),
  KEY `idx_doc_id` (`doc_id`),
  KEY `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='出库单明细表';

-- 19. 提成流水表
DROP TABLE IF EXISTS `wh_commission_ledger`;
CREATE TABLE `wh_commission_ledger` (
  `id` VARCHAR(32) NOT NULL COMMENT '主键ID',
  `biz_type` VARCHAR(20) NOT NULL COMMENT '业务类型: sale/return/void_sale/void_return',
  `doc_id` VARCHAR(32) NOT NULL COMMENT '单据ID',
  `salesperson_id` VARCHAR(32) NOT NULL COMMENT '业务员账户ID',
  `store_id` VARCHAR(32) DEFAULT NULL COMMENT '门店ID',
  `product_id` VARCHAR(32) NOT NULL COMMENT '商品ID',
  `qty` INT NOT NULL DEFAULT 0 COMMENT '袋数',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价',
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '金额',
  `commission_rate` DECIMAL(6,4) NOT NULL DEFAULT 0.0600 COMMENT '提成比例',
  `commission_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '提成金额(可正可负)',
  `settlement_id` VARCHAR(32) DEFAULT NULL COMMENT '结清批次ID',
  `settled_at` DATETIME DEFAULT NULL COMMENT '结清时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_doc_id` (`doc_id`),
  KEY `idx_salesperson_id` (`salesperson_id`),
  KEY `idx_store_id` (`store_id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_settlement_id` (`settlement_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提成流水表';

-- 20. 提成结清表
DROP TABLE IF EXISTS `wh_commission_settlement`;
CREATE TABLE `wh_commission_settlement` (
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

-- 21. 静态JSON存储表
DROP TABLE IF EXISTS `wh_static_json`;
CREATE TABLE `wh_static_json` (
  `json_key` VARCHAR(50) NOT NULL COMMENT '唯一key',
  `content` MEDIUMTEXT NOT NULL COMMENT 'JSON内容',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`json_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='静态JSON缓存表';

-- 门店数据（最小集）
INSERT INTO `wh_store` (`id`, `code`, `name`, `address`, `salesperson_id`, `lat`, `lng`, `scale`, `status`) VALUES
('st1','ST001','一号门店','测试地址1','sp_big',32.9987,112.5292,2,'active'),
('st2','ST002','二号门店','测试地址2','sp_small',32.9998,112.5302,1,'active'),
('st3','ST003','三号门店','测试地址3','sp_third',32.9975,112.5281,3,'active');

-- 仓库数据（含退货仓库）
INSERT INTO `wh_warehouse` (`id`, `name`, `type`, `salesperson_id`) VALUES
('main','主仓库','main',NULL),
('return','退货仓库','return',NULL),
('veh_sp_big','大车(车库)','vehicle','sp_big'),
('veh_sp_small','小车(车库)','vehicle','sp_small'),
('veh_sp_third','三车(车库)','vehicle','sp_third');

-- 固定账户数据
INSERT INTO `wh_account` (`id`, `username`, `display_name`, `role`, `password_hash`, `gesture_hash`, `status`) VALUES
('admin_root', 'admin', '管理员', 'admin', '7045830c', '43be43aa', 'active'),
('sp_big', 'bigcar', '大车', 'salesperson', '9995b6aa', 'b0fab432', 'active'),
('sp_small', 'smallcar', '小车', 'salesperson', '9995b6aa', 'a11067e3', 'active'),
('sp_third', 'thirdcar', '三车', 'salesperson', '9995b6aa', '534bab36', 'active');

-- App MySQL user
CREATE USER IF NOT EXISTS 'warehouse'@'localhost' IDENTIFIED BY 'warehouse123';
CREATE USER IF NOT EXISTS 'warehouse'@'127.0.0.1' IDENTIFIED BY 'warehouse123';
ALTER USER 'warehouse'@'localhost' IDENTIFIED BY 'warehouse123';
ALTER USER 'warehouse'@'127.0.0.1' IDENTIFIED BY 'warehouse123';
GRANT ALL PRIVILEGES ON `warehouse`.* TO 'warehouse'@'localhost';
GRANT ALL PRIVILEGES ON `warehouse`.* TO 'warehouse'@'127.0.0.1';
FLUSH PRIVILEGES;

-- Auto-generated seed from apps/admin-web/src/mock/seed.ts
-- NOTE: This script truncates tables before insert.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

TRUNCATE TABLE wh_commission_settlement;
TRUNCATE TABLE wh_commission_ledger;
TRUNCATE TABLE wh_outbound_line;
TRUNCATE TABLE wh_outbound_doc;
TRUNCATE TABLE wh_return_line;
TRUNCATE TABLE wh_return_doc;
TRUNCATE TABLE wh_sale_line;
TRUNCATE TABLE wh_sale_doc;
TRUNCATE TABLE wh_ledger;
TRUNCATE TABLE wh_stock;
TRUNCATE TABLE wh_transfer_line;
TRUNCATE TABLE wh_transfer_doc;
TRUNCATE TABLE wh_inbound_line;
TRUNCATE TABLE wh_inbound_doc;
TRUNCATE TABLE wh_warehouse;
TRUNCATE TABLE wh_store;
TRUNCATE TABLE wh_product;
TRUNCATE TABLE wh_supplier;
TRUNCATE TABLE wh_account;

SET FOREIGN_KEY_CHECKS=1;

-- suppliers
INSERT INTO wh_supplier (id, code, name, contact, phone, status, created_at, updated_at) VALUES
('s1','GY001','旺旺食品厂','张经理','13800001111','active',NOW(),NOW()),
('s2','GY002','统一食品厂','李经理','13800002222','active',NOW(),NOW()),
('s3','GY003','康师傅饮料厂','王总','13800003333','active',NOW(),NOW());

-- products (base + extra)
INSERT INTO wh_product (id, code, name, barcode, supplier_id, unit, box_qty, shelf_days, purchase_price, sale_price, status, created_at, updated_at) VALUES
('p1','SP001','旺旺雪饼(大)',NULL,'s1','袋',12,180,35,45,'active',NOW(),NOW()),
('p2','SP002','旺旺碎冰冰',NULL,'s1','袋',20,365,28,38,'active',NOW(),NOW()),
('p3','SP003','统一冰红茶(500ml)',NULL,'s2','袋',24,180,40,52,'active',NOW(),NOW()),
('p4','SP004','统一绿茶(500ml)',NULL,'s2','袋',24,180,40,52,'active',NOW(),NOW()),
('p5','SP005','康师傅红烧牛肉面',NULL,'s3','袋',12,270,55,70,'active',NOW(),NOW()),
('p6','SP006','康师傅矿泉水',NULL,'s3','袋',12,720,10,15,'active',NOW(),NOW()),
('p7','SP007','旺旺仙贝(小)',NULL,'s1','袋',30,180,22,30,'active',NOW(),NOW()),
('p8','SP008','统一老坛酸菜面',NULL,'s2','袋',12,270,52,66,'active',NOW(),NOW()),
('p9','SP009','旺旺茉莉花茶(500ml)',NULL,'s3','袋',12,90,55,70,'active',NOW(),NOW()),
('p10','SP010','统一柠檬茶(500ml)',NULL,'s1','袋',20,180,19,37,'active',NOW(),NOW()),
('p11','SP011','康师傅无糖绿茶(500ml)',NULL,'s2','袋',30,365,51,69,'active',NOW(),NOW()),
('p12','SP012','旺旺可乐(500ml)',NULL,'s3','袋',12,540,20,30,'active',NOW(),NOW()),
('p13','SP013','统一橙汁(1L)',NULL,'s1','袋',24,720,26,37,'active',NOW(),NOW()),
('p14','SP014','康师傅苹果汁(1L)',NULL,'s2','袋',30,90,55,73,'active',NOW(),NOW()),
('p15','SP015','旺旺薯片(原味)',NULL,'s3','袋',12,180,21,41,'active',NOW(),NOW()),
('p16','SP016','统一薯片(烧烤)',NULL,'s1','袋',20,365,53,71,'active',NOW(),NOW()),
('p17','SP017','康师傅曲奇饼干',NULL,'s2','袋',24,540,17,27,'active',NOW(),NOW()),
('p18','SP018','旺旺牛奶(250ml)',NULL,'s3','袋',30,720,23,36,'active',NOW(),NOW()),
('p19','SP019','统一酸奶(200ml)',NULL,'s1','袋',12,90,36,48,'active',NOW(),NOW()),
('p20','SP020','康师傅能量饮料(250ml)',NULL,'s2','袋',20,180,27,40,'active',NOW(),NOW()),
('p21','SP021','旺旺苏打水(500ml)',NULL,'s3','袋',24,365,43,56,'active',NOW(),NOW()),
('p22','SP022','统一气泡水(500ml)',NULL,'s1','袋',30,540,32,46,'active',NOW(),NOW()),
('p23','SP023','康师傅咖啡饮料(300ml)',NULL,'s2','袋',12,720,42,52,'active',NOW(),NOW()),
('p24','SP024','旺旺茉莉花茶(500ml)',NULL,'s3','袋',20,90,31,45,'active',NOW(),NOW()),
('p25','SP025','统一柠檬茶(500ml)',NULL,'s1','袋',24,180,40,51,'active',NOW(),NOW()),
('p26','SP026','康师傅无糖绿茶(500ml)',NULL,'s2','袋',30,365,47,60,'active',NOW(),NOW()),
('p27','SP027','旺旺可乐(500ml)',NULL,'s3','袋',12,540,24,39,'active',NOW(),NOW()),
('p28','SP028','统一橙汁(1L)',NULL,'s1','袋',20,720,18,34,'active',NOW(),NOW()),
('p29','SP029','康师傅苹果汁(1L)',NULL,'s2','袋',24,90,58,70,'active',NOW(),NOW()),
('p30','SP030','旺旺薯片(原味)',NULL,'s3','袋',30,180,15,34,'active',NOW(),NOW()),
('p31','SP031','统一薯片(烧烤)',NULL,'s1','袋',12,365,16,33,'active',NOW(),NOW());

-- stores (sample of 100 stores)
INSERT INTO wh_store (id, code, name, address, salesperson_id, lat, lng, scale, status, created_at, updated_at) VALUES
('st1','MD001','幸福路商超','南阳市幸福路17号','sp_small',32.996792,112.524421,1,'active',NOW(),NOW()),
('st2','MD002','建设路便利店','南阳市建设路91号','sp_third',32.993087,112.567536,1,'active',NOW(),NOW()),
('st3','MD003','人民路小卖部','南阳市人民路83号','sp_big',32.999425,112.546925,1,'active',NOW(),NOW()),
('st4','MD004','光明街生活馆','南阳市光明街179号','sp_small',33.019535,112.558179,1,'active',NOW(),NOW()),
('st5','MD005','东关大道便利店','南阳市东关大道199号','sp_third',33.005928,112.560706,1,'active',NOW(),NOW()),
('st6','MD006','解放路超市','南阳市解放路16号','sp_big',32.981168,112.503853,1,'active',NOW(),NOW()),
('st7','MD007','中州路商超','南阳市中州路112号','sp_small',32.999873,112.505582,1,'active',NOW(),NOW()),
('st8','MD008','滨河路便利店','南阳市滨河路137号','sp_third',32.993098,112.50838,1,'active',NOW(),NOW()),
('st9','MD009','工业路小卖部','南阳市工业路164号','sp_big',33.011924,112.50437,1,'active',NOW(),NOW()),
('st10','MD010','新华路生活馆','南阳市新华路146号','sp_small',33.016144,112.548555,1,'active',NOW(),NOW()),
('st11','MD011','幸福路便利店','南阳市幸福路27号','sp_third',33.014748,112.551902,1,'active',NOW(),NOW()),
('st12','MD012','建设路小卖部','南阳市建设路66号','sp_big',33.009933,112.49389,1,'active',NOW(),NOW()),
('st13','MD013','人民路生活馆','南阳市人民路124号','sp_small',32.975102,112.561818,1,'active',NOW(),NOW()),
('st14','MD014','光明街便利店','南阳市光明街145号','sp_third',33.012815,112.514723,1,'active',NOW(),NOW()),
('st15','MD015','东关大道小卖部','南阳市东关大道77号','sp_big',32.988528,112.518941,1,'active',NOW(),NOW()),
('st16','MD016','解放路生活馆','南阳市解放路107号','sp_small',32.983578,112.52694,1,'active',NOW(),NOW()),
('st17','MD017','中州路便利店','南阳市中州路152号','sp_third',33.017645,112.521374,1,'active',NOW(),NOW()),
('st18','MD018','滨河路小卖部','南阳市滨河路18号','sp_big',32.978746,112.513948,1,'active',NOW(),NOW()),
('st19','MD019','工业路生活馆','南阳市工业路147号','sp_small',33.012836,112.534402,1,'active',NOW(),NOW()),
('st20','MD020','新华路便利店','南阳市新华路67号','sp_third',33.019681,112.519542,1,'active',NOW(),NOW()),
('st21','MD021','幸福路小卖部','南阳市幸福路20号','sp_big',33.019208,112.547022,1,'active',NOW(),NOW()),
('st22','MD022','建设路生活馆','南阳市建设路200号','sp_small',33.001577,112.545541,1,'active',NOW(),NOW()),
('st23','MD023','人民路便利店','南阳市人民路4号','sp_third',32.981811,112.538539,1,'active',NOW(),NOW()),
('st24','MD024','光明街小卖部','南阳市光明街114号','sp_big',32.990591,112.528602,1,'active',NOW(),NOW()),
('st25','MD025','东关大道生活馆','南阳市东关大道196号','sp_small',33.018979,112.517836,1,'active',NOW(),NOW()),
('st26','MD026','解放路便利店','南阳市解放路111号','sp_third',32.978867,112.514413,1,'active',NOW(),NOW()),
('st27','MD027','中州路小卖部','南阳市中州路75号','sp_big',33.012955,112.567631,1,'active',NOW(),NOW()),
('st28','MD028','滨河路生活馆','南阳市滨河路88号','sp_small',33.002578,112.544853,1,'active',NOW(),NOW()),
('st29','MD029','工业路便利店','南阳市工业路69号','sp_third',33.01887,112.503349,1,'active',NOW(),NOW()),
('st30','MD030','新华路小卖部','南阳市新华路48号','sp_big',33.00757,112.514102,1,'active',NOW(),NOW()),
('st31','MD031','幸福路生活馆','南阳市幸福路39号','sp_small',32.976469,112.502829,1,'active',NOW(),NOW()),
('st32','MD032','建设路便利店','南阳市建设路175号','sp_third',32.989537,112.541403,1,'active',NOW(),NOW()),
('st33','MD033','人民路小卖部','南阳市人民路140号','sp_big',33.024862,112.549983,1,'active',NOW(),NOW()),
('st34','MD034','光明街生活馆','南阳市光明街161号','sp_small',33.026905,112.537956,1,'active',NOW(),NOW()),
('st35','MD035','东关大道便利店','南阳市东关大道91号','sp_third',33.023254,112.56429,1,'active',NOW(),NOW()),
('st36','MD036','解放路小卖部','南阳市解放路83号','sp_big',32.984227,112.542454,1,'active',NOW(),NOW()),
('st37','MD037','中州路生活馆','南阳市中州路128号','sp_small',33.007523,112.526115,1,'active',NOW(),NOW()),
('st38','MD038','滨河路便利店','南阳市滨河路84号','sp_third',32.998086,112.506416,1,'active',NOW(),NOW()),
('st39','MD039','工业路小卖部','南阳市工业路149号','sp_big',33.01353,112.567462,1,'active',NOW(),NOW()),
('st40','MD040','新华路生活馆','南阳市新华路185号','sp_small',32.995227,112.544448,1,'active',NOW(),NOW()),
('st41','MD041','幸福路便利店','南阳市幸福路59号','sp_third',33.017777,112.530492,1,'active',NOW(),NOW()),
('st42','MD042','建设路小卖部','南阳市建设路52号','sp_big',33.019126,112.539496,1,'active',NOW(),NOW()),
('st43','MD043','人民路生活馆','南阳市人民路200号','sp_small',32.976786,112.521777,1,'active',NOW(),NOW()),
('st44','MD044','光明街便利店','南阳市光明街60号','sp_third',32.974164,112.509821,1,'active',NOW(),NOW()),
('st45','MD045','东关大道小卖部','南阳市东关大道88号','sp_big',33.016896,112.556997,1,'active',NOW(),NOW()),
('st46','MD046','解放路生活馆','南阳市解放路186号','sp_small',32.985756,112.544902,1,'active',NOW(),NOW()),
('st47','MD047','中州路便利店','南阳市中州路49号','sp_third',33.001285,112.510838,1,'active',NOW(),NOW()),
('st48','MD048','滨河路小卖部','南阳市滨河路22号','sp_big',32.973959,112.515277,1,'active',NOW(),NOW()),
('st49','MD049','工业路生活馆','南阳市工业路189号','sp_small',32.974575,112.546116,1,'active',NOW(),NOW()),
('st50','MD050','新华路便利店','南阳市新华路110号','sp_third',32.999783,112.535114,1,'active',NOW(),NOW()),
('st51','MD051','幸福路小卖部','南阳市幸福路100号','sp_big',32.992204,112.543424,1,'active',NOW(),NOW()),
('st52','MD052','建设路生活馆','南阳市建设路71号','sp_small',33.022472,112.548363,1,'active',NOW(),NOW()),
('st53','MD053','人民路便利店','南阳市人民路128号','sp_third',33.008383,112.520366,1,'active',NOW(),NOW()),
('st54','MD054','光明街小卖部','南阳市光明街50号','sp_big',33.019741,112.517055,1,'active',NOW(),NOW()),
('st55','MD055','东关大道生活馆','南阳市东关大道112号','sp_small',33.018339,112.517622,1,'active',NOW(),NOW()),
('st56','MD056','解放路便利店','南阳市解放路164号','sp_third',33.020519,112.546162,1,'active',NOW(),NOW()),
('st57','MD057','中州路小卖部','南阳市中州路45号','sp_big',32.98214,112.53417,1,'active',NOW(),NOW()),
('st58','MD058','滨河路生活馆','南阳市滨河路27号','sp_small',33.006315,112.503091,1,'active',NOW(),NOW()),
('st59','MD059','工业路便利店','南阳市工业路30号','sp_third',33.024677,112.532077,1,'active',NOW(),NOW()),
('st60','MD060','新华路小卖部','南阳市新华路61号','sp_big',32.97656,112.506687,1,'active',NOW(),NOW()),
('st61','MD061','幸福路生活馆','南阳市幸福路195号','sp_small',32.974135,112.556504,1,'active',NOW(),NOW()),
('st62','MD062','建设路便利店','南阳市建设路172号','sp_third',33.012224,112.536722,1,'active',NOW(),NOW()),
('st63','MD063','人民路小卖部','南阳市人民路68号','sp_big',33.023047,112.547222,1,'active',NOW(),NOW()),
('st64','MD064','光明街生活馆','南阳市光明街29号','sp_small',32.978714,112.537178,1,'active',NOW(),NOW()),
('st65','MD065','东关大道便利店','南阳市东关大道90号','sp_third',33.02566,112.533583,1,'active',NOW(),NOW()),
('st66','MD066','解放路小卖部','南阳市解放路72号','sp_big',32.973555,112.520498,1,'active',NOW(),NOW()),
('st67','MD067','中州路生活馆','南阳市中州路108号','sp_small',32.983616,112.546466,1,'active',NOW(),NOW()),
('st68','MD068','滨河路便利店','南阳市滨河路93号','sp_third',32.984149,112.527058,1,'active',NOW(),NOW()),
('st69','MD069','工业路小卖部','南阳市工业路89号','sp_big',33.019055,112.55544,1,'active',NOW(),NOW()),
('st70','MD070','新华路生活馆','南阳市新华路32号','sp_small',33.014694,112.511562,1,'active',NOW(),NOW()),
('st71','MD071','幸福路便利店','南阳市幸福路68号','sp_third',33.004417,112.510567,1,'active',NOW(),NOW()),
('st72','MD072','建设路小卖部','南阳市建设路185号','sp_big',33.022684,112.548312,1,'active',NOW(),NOW()),
('st73','MD073','人民路生活馆','南阳市人民路154号','sp_small',33.002441,112.552583,1,'active',NOW(),NOW()),
('st74','MD074','光明街便利店','南阳市光明街195号','sp_third',33.001296,112.557918,1,'active',NOW(),NOW()),
('st75','MD075','东关大道小卖部','南阳市东关大道45号','sp_big',33.0106,112.567104,1,'active',NOW(),NOW()),
('st76','MD076','解放路生活馆','南阳市解放路96号','sp_small',32.982171,112.556777,1,'active',NOW(),NOW()),
('st77','MD077','中州路便利店','南阳市中州路58号','sp_third',33.012047,112.516535,1,'active',NOW(),NOW()),
('st78','MD078','滨河路小卖部','南阳市滨河路89号','sp_big',33.011659,112.547798,1,'active',NOW(),NOW()),
('st79','MD079','工业路生活馆','南阳市工业路136号','sp_small',32.994921,112.501395,1,'active',NOW(),NOW()),
('st80','MD080','新华路便利店','南阳市新华路129号','sp_third',33.010826,112.537338,1,'active',NOW(),NOW()),
('st81','MD081','幸福路小卖部','南阳市幸福路192号','sp_big',32.984456,112.515464,1,'active',NOW(),NOW()),
('st82','MD082','建设路生活馆','南阳市建设路128号','sp_small',33.012614,112.556239,1,'active',NOW(),NOW()),
('st83','MD083','人民路便利店','南阳市人民路43号','sp_third',32.987728,112.519832,1,'active',NOW(),NOW()),
('st84','MD084','光明街小卖部','南阳市光明街48号','sp_big',33.015747,112.554351,1,'active',NOW(),NOW()),
('st85','MD085','东关大道生活馆','南阳市东关大道101号','sp_small',33.015396,112.566436,1,'active',NOW(),NOW()),
('st86','MD086','解放路便利店','南阳市解放路55号','sp_third',32.981446,112.520665,1,'active',NOW(),NOW()),
('st87','MD087','中州路小卖部','南阳市中州路58号','sp_big',32.987593,112.520668,1,'active',NOW(),NOW()),
('st88','MD088','滨河路生活馆','南阳市滨河路193号','sp_small',33.02465,112.513082,1,'active',NOW(),NOW()),
('st89','MD089','工业路便利店','南阳市工业路177号','sp_third',32.999913,112.538045,1,'active',NOW(),NOW()),
('st90','MD090','新华路小卖部','南阳市新华路187号','sp_big',32.99373,112.524093,1,'active',NOW(),NOW()),
('st91','MD091','幸福路生活馆','南阳市幸福路106号','sp_small',33.023178,112.503898,1,'active',NOW(),NOW()),
('st92','MD092','建设路便利店','南阳市建设路119号','sp_third',32.983239,112.548875,1,'active',NOW(),NOW()),
('st93','MD093','人民路小卖部','南阳市人民路5号','sp_big',33.005371,112.54562,1,'active',NOW(),NOW()),
('st94','MD094','光明街生活馆','南阳市光明街151号','sp_small',33.015028,112.548782,1,'active',NOW(),NOW()),
('st95','MD095','东关大道便利店','南阳市东关大道169号','sp_third',32.980428,112.542063,1,'active',NOW(),NOW()),
('st96','MD096','解放路小卖部','南阳市解放路139号','sp_big',33.021255,112.54214,1,'active',NOW(),NOW()),
('st97','MD097','中州路生活馆','南阳市中州路114号','sp_small',33.016438,112.507851,1,'active',NOW(),NOW()),
('st98','MD098','滨河路便利店','南阳市滨河路24号','sp_third',33.012894,112.534186,1,'active',NOW(),NOW()),
('st99','MD099','工业路小卖部','南阳市工业路80号','sp_big',32.981267,112.53142,1,'active',NOW(),NOW()),
('st100','MD100','新华路生活馆','南阳市新华路35号','sp_small',32.989939,112.521857,1,'active',NOW(),NOW());

-- warehouses
INSERT INTO wh_warehouse (id, name, type, salesperson_id, created_at) VALUES
('main','主仓库','main',NULL,NOW()),
('return','退货仓库','return',NULL,NOW()),
('veh_sp_big','大车(车库)','vehicle','sp_big',NOW()),
('veh_sp_small','小车(车库)','vehicle','sp_small',NOW()),
('veh_sp_third','三车(车库)','vehicle','sp_third',NOW());

-- stock (main + vehicles)
INSERT INTO wh_stock (warehouse_id, product_id, qty, updated_at) VALUES
('main','p1',153,NOW()),('main','p2',91,NOW()),('main','p3',175,NOW()),('main','p4',6,NOW()),('main','p5',89,NOW()),
('main','p6',184,NOW()),('main','p7',10,NOW()),('main','p8',16,NOW()),('main','p9',210,NOW()),('main','p10',21,NOW()),
('main','p11',84,NOW()),('main','p12',186,NOW()),('main','p13',111,NOW()),('main','p14',0,NOW()),('main','p15',187,NOW()),
('main','p16',113,NOW()),('main','p17',194,NOW()),('main','p18',130,NOW()),('main','p19',93,NOW()),('main','p20',6,NOW()),
('main','p21',4,NOW()),('main','p22',170,NOW()),('main','p23',128,NOW()),('main','p24',77,NOW()),('main','p25',201,NOW()),
('main','p26',1,NOW()),('main','p27',159,NOW()),('main','p28',22,NOW()),('main','p29',191,NOW()),('main','p30',81,NOW()),
('main','p31',26,NOW()),
('veh_sp_big','p8',30,NOW()),('veh_sp_big','p10',35,NOW()),('veh_sp_big','p1',13,NOW()),('veh_sp_big','p30',41,NOW()),('veh_sp_big','p22',43,NOW()),
('veh_sp_big','p11',41,NOW()),('veh_sp_big','p25',16,NOW()),('veh_sp_big','p27',40,NOW()),('veh_sp_big','p16',48,NOW()),('veh_sp_big','p18',45,NOW()),
('veh_sp_small','p6',54,NOW()),('veh_sp_small','p26',50,NOW()),('veh_sp_small','p2',51,NOW()),('veh_sp_small','p3',9,NOW()),('veh_sp_small','p30',36,NOW()),
('veh_sp_small','p27',34,NOW()),('veh_sp_small','p31',33,NOW()),('veh_sp_small','p28',31,NOW()),('veh_sp_small','p4',2,NOW()),('veh_sp_small','p9',41,NOW()),
('veh_sp_third','p14',45,NOW()),('veh_sp_third','p9',19,NOW()),('veh_sp_third','p7',22,NOW()),('veh_sp_third','p6',52,NOW()),('veh_sp_third','p26',50,NOW()),
('veh_sp_third','p25',33,NOW()),('veh_sp_third','p10',12,NOW()),('veh_sp_third','p5',16,NOW()),('veh_sp_third','p13',58,NOW()),('veh_sp_third','p12',9,NOW());

-- accounts
INSERT INTO wh_account (id, username, display_name, role, password_hash, gesture_hash, status, created_at, updated_at) VALUES
('admin_root','admin','管理员','admin','7045830c','43be43aa','active',NOW(),NOW()),
('sp_big','bigcar','大车','salesperson','9995b6aa','b0fab432','active',NOW(),NOW()),
('sp_small','smallcar','小车','salesperson','9995b6aa','a11067e3','active',NOW(),NOW()),
('sp_third','thirdcar','三车','salesperson','9995b6aa','534bab36','active',NOW(),NOW());

-- sale docs
INSERT INTO wh_sale_doc (id, code, salesperson_id, store_id, doc_date, remark, status, total_qty, total_amount, created_at, updated_at) VALUES
('sa1','SA00000001','sp_big','st1',DATE_SUB(CURDATE(), INTERVAL 2 DAY),'','posted',72, (24*45 + 48*52), NOW(), NOW()),
('sa2','SA00000002','sp_big','st1',DATE_SUB(CURDATE(), INTERVAL 5 DAY),'','posted',36, (36*45), NOW(), NOW()),
('sa3','SA00000003','sp_big','st2',DATE_SUB(CURDATE(), INTERVAL 3 DAY),'','posted',36, (24*52 + 12*70), NOW(), NOW()),
('sa4','SA00000004','sp_small','st3',DATE_SUB(CURDATE(), INTERVAL 1 DAY),'','posted',100,(80*38 + 20*52), NOW(), NOW()),
('sa5','SA00000005','sp_small','st4',DATE_SUB(CURDATE(), INTERVAL 7 DAY),'','posted',12, (12*15), NOW(), NOW()),
('sa6','SA00000006','sp_third','st5',DATE_SUB(CURDATE(), INTERVAL 4 DAY),'','posted',96, (60*30 + 36*66), NOW(), NOW());

INSERT INTO wh_sale_line (id, doc_id, product_id, box_qty, qty, price, amount) VALUES
('sal1','sa1','p1',0,24,45,24*45),('sal2','sa1','p3',0,48,52,48*52),
('sal3','sa2','p1',0,36,45,36*45),
('sal4','sa3','p3',0,24,52,24*52),('sal5','sa3','p5',0,12,70,12*70),
('sal6','sa4','p2',0,80,38,80*38),('sal7','sa4','p4',0,20,52,20*52),
('sal8','sa5','p6',0,12,15,12*15),
('sal9','sa6','p7',0,60,30,60*30),('sal10','sa6','p8',0,36,66,36*66);
