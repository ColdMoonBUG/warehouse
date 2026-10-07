-- 20261007 历史数据体检（只读：全部是 SELECT，不改任何数据）
-- 执行：mysql -u<用户> -p <库名> < sql/diagnostics/20261007_data_check.sql > 体检结果.txt
-- 这些问题来自老版本：作废销单时没有一起作废关联退单、提交超时后重试开出重复单、开单页自动保存留下草稿。
-- 新版本已经不会再产生这几类数据；已有的数据需要人工核对后再决定是否处理，脚本不会自动修改。
SET NAMES utf8mb4;

-- 1. 销单已作废，但关联的退单还是“已过账”：这张退货的库存和金额仍然算数
--    疑似重复退货 = 1：同一门店同一天另有一张内容完全相同、挂在有效销单上的退单（多半是作废重建时又开了一张），
--                      这张旧退单很可能重复计算了，优先核对；
--    已关联到其他有效销单 = 1：退单已经挂到新单上，一般没问题；
--    两者都是 0：退单单独生效，需要核对实际是否退了货。
SELECT s.code AS `销单号`, s.doc_date AS `销单日期`, a.display_name AS `业务员`, st.name AS `门店`,
       r.code AS `退单号`, r.doc_date AS `退单日期`, r.total_amount AS `退单金额`,
       EXISTS (
         SELECT 1 FROM wh_sale_doc s3 JOIN wh_return_doc r3 ON r3.id = s3.return_doc_id
         WHERE s3.store_id = s.store_id AND s3.doc_date = s.doc_date AND s3.status <> 'voided'
           AND r3.status = 'posted' AND r3.id <> r.id
           AND (SELECT GROUP_CONCAT(CONCAT(product_id, ':', qty) ORDER BY product_id, qty) FROM wh_return_line WHERE doc_id = r3.id)
             = (SELECT GROUP_CONCAT(CONCAT(product_id, ':', qty) ORDER BY product_id, qty) FROM wh_return_line WHERE doc_id = r.id)
       ) AS `疑似重复退货`,
       EXISTS (SELECT 1 FROM wh_sale_doc s2 WHERE s2.return_doc_id = r.id AND s2.id <> s.id AND s2.status <> 'voided') AS `已关联到其他有效销单`
FROM wh_sale_doc s
JOIN wh_return_doc r ON r.id = s.return_doc_id
LEFT JOIN wh_account a ON a.id = s.salesperson_id
LEFT JOIN wh_store st ON st.id = s.store_id
WHERE s.status = 'voided' AND r.status = 'posted'
ORDER BY `疑似重复退货` DESC, `已关联到其他有效销单`, s.doc_date DESC;

-- 2. 疑似重复提交的销单：同一业务员、同一门店、金额相同、商品和数量完全相同，2 分钟内各开了一张且都已过账
--    多数是网络超时后又点了一次提交。核对实际只送了一次货的，作废其中一张即可。
SELECT a.code AS `销单号1`, b.code AS `销单号2`, a.created_at AS `开单时间1`, b.created_at AS `开单时间2`,
       TIMESTAMPDIFF(SECOND, a.created_at, b.created_at) AS `相隔秒数`,
       a.total_amount AS `金额`, acc.display_name AS `业务员`, st.name AS `门店`
FROM wh_sale_doc a
JOIN wh_sale_doc b ON b.store_id = a.store_id AND b.salesperson_id = a.salesperson_id
  AND b.total_amount = a.total_amount AND b.status = 'posted'
  AND (b.created_at > a.created_at OR (b.created_at = a.created_at AND b.id > a.id))
  AND b.created_at <= a.created_at + INTERVAL 120 SECOND
LEFT JOIN wh_account acc ON acc.id = a.salesperson_id
LEFT JOIN wh_store st ON st.id = a.store_id
WHERE a.status = 'posted'
  AND (SELECT GROUP_CONCAT(CONCAT(product_id, ':', qty) ORDER BY product_id, qty) FROM wh_sale_line WHERE doc_id = a.id)
    = (SELECT GROUP_CONCAT(CONCAT(product_id, ':', qty) ORDER BY product_id, qty) FROM wh_sale_line WHERE doc_id = b.id)
ORDER BY a.created_at DESC;

-- 3. 一张退单同时被多张有效销单关联（同一笔退货可能在两张单上都被抵扣）
SELECT r.code AS `退单号`, r.status AS `退单状态`, COUNT(*) AS `关联的有效销单数`,
       GROUP_CONCAT(s.code ORDER BY s.created_at SEPARATOR ', ') AS `销单号`
FROM wh_sale_doc s
JOIN wh_return_doc r ON r.id = s.return_doc_id
WHERE s.status <> 'voided'
GROUP BY r.id, r.code, r.status
HAVING COUNT(*) > 1;

-- 4. 放了 3 天以上的销单草稿（开单页自动保存留下的，不影响库存和金额）
--    明细行数 = 0 的可以直接删除；有明细的先问业务员是不是还要用。
SELECT d.code AS `单号`, d.doc_date AS `单据日期`, d.created_at AS `创建时间`, a.display_name AS `业务员`, st.name AS `门店`,
       (SELECT COUNT(*) FROM wh_sale_line l WHERE l.doc_id = d.id) AS `明细行数`, d.total_amount AS `金额`
FROM wh_sale_doc d
LEFT JOIN wh_account a ON a.id = d.salesperson_id
LEFT JOIN wh_store st ON st.id = d.store_id
WHERE d.status = 'draft' AND d.created_at < NOW() - INTERVAL 3 DAY
ORDER BY d.created_at DESC;

-- 5. 汇总
SELECT '已作废销单仍挂着已过账退单' AS `检查项`, COUNT(*) AS `数量`
  FROM wh_sale_doc s JOIN wh_return_doc r ON r.id = s.return_doc_id WHERE s.status = 'voided' AND r.status = 'posted'
UNION ALL
SELECT '  其中疑似重复退货（同店同日另有内容相同的有效退单）', COUNT(*)
  FROM wh_sale_doc s JOIN wh_return_doc r ON r.id = s.return_doc_id
  WHERE s.status = 'voided' AND r.status = 'posted'
    AND EXISTS (
      SELECT 1 FROM wh_sale_doc s3 JOIN wh_return_doc r3 ON r3.id = s3.return_doc_id
      WHERE s3.store_id = s.store_id AND s3.doc_date = s.doc_date AND s3.status <> 'voided'
        AND r3.status = 'posted' AND r3.id <> r.id
        AND (SELECT GROUP_CONCAT(CONCAT(product_id, ':', qty) ORDER BY product_id, qty) FROM wh_return_line WHERE doc_id = r3.id)
          = (SELECT GROUP_CONCAT(CONCAT(product_id, ':', qty) ORDER BY product_id, qty) FROM wh_return_line WHERE doc_id = r.id))
UNION ALL
SELECT '  其中退单没有挂到其他有效销单', COUNT(*)
  FROM wh_sale_doc s JOIN wh_return_doc r ON r.id = s.return_doc_id
  WHERE s.status = 'voided' AND r.status = 'posted'
    AND NOT EXISTS (SELECT 1 FROM wh_sale_doc s2 WHERE s2.return_doc_id = r.id AND s2.id <> s.id AND s2.status <> 'voided')
UNION ALL
SELECT '疑似重复提交的销单（对数）', COUNT(*)
  FROM wh_sale_doc a
  JOIN wh_sale_doc b ON b.store_id = a.store_id AND b.salesperson_id = a.salesperson_id
    AND b.total_amount = a.total_amount AND b.status = 'posted'
    AND (b.created_at > a.created_at OR (b.created_at = a.created_at AND b.id > a.id))
    AND b.created_at <= a.created_at + INTERVAL 120 SECOND
  WHERE a.status = 'posted'
    AND (SELECT GROUP_CONCAT(CONCAT(product_id, ':', qty) ORDER BY product_id, qty) FROM wh_sale_line WHERE doc_id = a.id)
      = (SELECT GROUP_CONCAT(CONCAT(product_id, ':', qty) ORDER BY product_id, qty) FROM wh_sale_line WHERE doc_id = b.id)
UNION ALL
SELECT '一张退单被多张有效销单关联', COUNT(*) FROM (
  SELECT s.return_doc_id FROM wh_sale_doc s WHERE s.status <> 'voided' AND s.return_doc_id IS NOT NULL
  GROUP BY s.return_doc_id HAVING COUNT(*) > 1) x
UNION ALL
SELECT '3 天以上的销单草稿', COUNT(*) FROM wh_sale_doc WHERE status = 'draft' AND created_at < NOW() - INTERVAL 3 DAY;
