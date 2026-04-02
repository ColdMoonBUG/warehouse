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

