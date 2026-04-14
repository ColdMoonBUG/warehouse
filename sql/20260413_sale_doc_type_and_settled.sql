-- 需求7: 赠送品功能 - 添加单据类型字段
ALTER TABLE `wh_sale_doc`
  ADD COLUMN `doc_type` VARCHAR(20) NOT NULL DEFAULT 'sale' COMMENT '单据类型: sale=销售 gift=赠送'
  AFTER `status`;

-- 需求2: 货款结清 - 添加结清状态字段
ALTER TABLE `wh_sale_doc`
  ADD COLUMN `settled` TINYINT NOT NULL DEFAULT 0 COMMENT '货款状态: 0=未收款 1=已收款'
  AFTER `doc_type`,
  ADD COLUMN `settled_at` DATETIME DEFAULT NULL COMMENT '收款确认时间'
  AFTER `settled`,
  ADD COLUMN `settled_by` VARCHAR(32) DEFAULT NULL COMMENT '确认收款操作人ID'
  AFTER `settled_at`;

ALTER TABLE `wh_sale_doc`
  ADD KEY `idx_settled` (`settled`);
