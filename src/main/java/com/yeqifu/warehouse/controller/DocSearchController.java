package com.yeqifu.warehouse.controller;

import com.yeqifu.warehouse.common.PinyinMatcher;
import com.yeqifu.warehouse.common.QueryUtils;
import com.yeqifu.warehouse.common.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 单据模糊搜索（销售/退货/入库/出库）。在数据库里分页查询，不再把全部单据拉到浏览器里过滤。
 * 关键词按空格拆成多个词，每个词都要命中下面任一字段：
 * 单号（忽略“-”，如 0514 可命中 XS-2026-05-14-…）、日期、门店/厂家/仓库名（含拼音首字母和全拼）、
 * 业务员、备注、明细里的商品名称/条码/拼音、金额。
 */
@RestController
@RequestMapping("/api/doc")
public class DocSearchController {

    private static final List<String> TYPES = Arrays.asList("sale", "return", "inbound", "transfer");
    private static final List<String> STATES = Arrays.asList("draft", "posted", "voided");
    private static final Pattern AMOUNT = Pattern.compile("^\\d+(\\.\\d{1,2})?$");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @GetMapping("/search")
    public Result<List<Map<String, Object>>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String salespersonId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer limit) {
        java.sql.Date start = QueryUtils.parseDate(startDate, "开始日期");
        java.sql.Date end = QueryUtils.parseDate(endDate, "结束日期");
        List<String> tokens = QueryUtils.tokens(keyword);
        int size = QueryUtils.clamp(limit, 50, 1, 200);
        int offset = (QueryUtils.clamp(page, 1, 1, 100000) - 1) * size;
        String state = STATES.contains(status) ? status : null;

        Map<String, List<String>> storeHits = new HashMap<>();
        Map<String, List<String>> productHits = new HashMap<>();
        Map<String, List<String>> supplierHits = new HashMap<>();
        Map<String, List<String>> warehouseHits = new HashMap<>();
        for (String t : tokens) {
            if (PinyinMatcher.isPinyinToken(t)) {
                storeHits.put(t, pinyinIds("SELECT id, name FROM wh_store", t));
                productHits.put(t, pinyinIds("SELECT id, name FROM wh_product", t));
                supplierHits.put(t, pinyinIds("SELECT id, name FROM wh_supplier", t));
                warehouseHits.put(t, pinyinIds("SELECT id, name FROM wh_warehouse", t));
            }
        }

        List<String> parts = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (String kind : TYPES) {
            if (QueryUtils.hasText(type) && !kind.equals(type)) continue;
            if (QueryUtils.hasText(salespersonId) && (kind.equals("inbound") || kind.equals("transfer"))) continue;
            List<Object> selectArgs = new ArrayList<>();
            String relevance = relevance(tokens, selectArgs);
            List<Object> whereArgs = new ArrayList<>();
            List<String> where = new ArrayList<>();
            if (start != null) { where.add("d.doc_date >= ?"); whereArgs.add(start); }
            if (end != null) { where.add("d.doc_date <= ?"); whereArgs.add(end); }
            if (state != null) { where.add("d.status = ?"); whereArgs.add(state); }
            if (QueryUtils.hasText(salespersonId)) { where.add("d.salesperson_id = ?"); whereArgs.add(salespersonId); }
            for (String t : tokens) {
                where.add("(" + tokenCondition(kind, t, whereArgs, storeHits.get(t), productHits.get(t),
                    supplierHits.get(t), warehouseHits.get(t)) + ")");
            }
            parts.add(selectPart(kind, relevance) + (where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where)));
            args.addAll(selectArgs);
            args.addAll(whereArgs);
        }
        if (parts.isEmpty()) {
            return Result.ok(Collections.emptyList(), 0L);
        }
        String union = String.join(" UNION ALL ", parts);
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM (" + union + ") x", Long.class, args.toArray());

        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(offset);
        pageArgs.add(size);
        List<Map<String, Object>> rows = new ArrayList<>();
        jdbcTemplate.query("SELECT * FROM (" + union + ") x ORDER BY x.relevance DESC, x.doc_date DESC, x.created_at DESC, x.id DESC LIMIT ?, ?",
            rs -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("type", rs.getString("type"));
                row.put("id", rs.getString("id"));
                row.put("code", rs.getString("code"));
                row.put("status", rs.getString("status"));
                row.put("settled", rs.getObject("settled") == null ? null : rs.getInt("settled"));
                row.put("docType", rs.getString("doc_type"));
                row.put("date", rs.getString("doc_date"));
                row.put("createdAt", rs.getString("created_at"));
                row.put("salespersonId", rs.getString("salesperson_id"));
                row.put("salespersonName", rs.getString("salesperson_name"));
                row.put("partyName", rs.getString("party_name"));
                row.put("totalQty", rs.getInt("total_qty"));
                row.put("totalAmount", rs.getBigDecimal("total_amount"));
                row.put("remark", rs.getString("remark"));
                row.put("linkedId", rs.getString("link_id"));
                rows.add(row);
            }, pageArgs.toArray());
        fillLinks(rows);
        return Result.ok(rows, total == null ? 0L : total);
    }

    /**
     * 排序权重：单号完全一致 > 单据日期就是输入的日期（2026-05-14 / 20260514 / 0514 / 05-14 / 5-14）> 单号包含输入；
     * 其余命中（门店、商品、备注……）按日期倒序排在后面。
     */
    private String relevance(List<String> tokens, List<Object> args) {
        if (tokens.isEmpty()) {
            return "0";
        }
        List<String> scores = new ArrayList<>();
        for (String t : tokens) {
            scores.add("(CASE WHEN d.code = ? THEN 8"
                + " WHEN DATE_FORMAT(d.doc_date, '%Y-%m-%d') = ? OR DATE_FORMAT(d.doc_date, '%Y%m%d') = ?"
                + " OR DATE_FORMAT(d.doc_date, '%m%d') = ? OR DATE_FORMAT(d.doc_date, '%m-%d') = ?"
                + " OR DATE_FORMAT(d.doc_date, '%c-%e') = ? THEN 4"
                + " WHEN d.code LIKE ? THEN 2 ELSE 0 END)");
            for (int i = 0; i < 6; i++) {
                args.add(t);
            }
            args.add(QueryUtils.likeContains(t));
        }
        return String.join(" + ", scores);
    }

    private String selectPart(String kind, String relevance) {
        return "SELECT (" + relevance + ") relevance, " + selectColumns(kind).substring("SELECT ".length());
    }

    private String selectColumns(String kind) {
        switch (kind) {
            case "sale":
                return "SELECT 'sale' type, d.id, d.code, d.status, d.settled, d.doc_type, d.doc_date, d.created_at,"
                    + " d.salesperson_id, a.display_name salesperson_name, s.name party_name, d.total_qty, d.total_amount,"
                    + " d.remark, d.return_doc_id link_id"
                    + " FROM wh_sale_doc d LEFT JOIN wh_store s ON s.id = d.store_id LEFT JOIN wh_account a ON a.id = d.salesperson_id";
            case "return":
                return "SELECT 'return' type, d.id, d.code, d.status, NULL settled, d.return_type doc_type, d.doc_date, d.created_at,"
                    + " d.salesperson_id, a.display_name salesperson_name,"
                    + " CASE WHEN d.return_type = 'warehouse_return' THEN COALESCE(s.name, '回仓') ELSE s.name END party_name,"
                    + " d.total_qty, d.total_amount, d.remark, NULL link_id"
                    + " FROM wh_return_doc d LEFT JOIN wh_store s ON s.id = d.store_id LEFT JOIN wh_account a ON a.id = d.salesperson_id";
            case "inbound":
                return "SELECT 'inbound' type, d.id, d.code, d.status, NULL settled, NULL doc_type, d.doc_date, d.created_at,"
                    + " NULL salesperson_id, NULL salesperson_name, sup.name party_name,"
                    + " (SELECT COALESCE(SUM(l.qty), 0) FROM wh_inbound_line l WHERE l.doc_id = d.id) total_qty,"
                    + " (SELECT COALESCE(SUM(l.amount), 0) FROM wh_inbound_line l WHERE l.doc_id = d.id) total_amount,"
                    + " d.remark, NULL link_id"
                    + " FROM wh_inbound_doc d LEFT JOIN wh_supplier sup ON sup.id = d.supplier_id";
            default:
                return "SELECT 'transfer' type, d.id, d.code, d.status, NULL settled, NULL doc_type, d.doc_date, d.created_at,"
                    + " NULL salesperson_id, NULL salesperson_name,"
                    + " CONCAT(COALESCE(wf.name, d.from_warehouse_id), ' → ', COALESCE(wt.name, d.to_warehouse_id)) party_name,"
                    + " (SELECT COALESCE(SUM(l.qty), 0) FROM wh_transfer_line l WHERE l.doc_id = d.id) total_qty,"
                    + " NULL total_amount, d.remark, NULL link_id"
                    + " FROM wh_transfer_doc d LEFT JOIN wh_warehouse wf ON wf.id = d.from_warehouse_id"
                    + " LEFT JOIN wh_warehouse wt ON wt.id = d.to_warehouse_id";
        }
    }

    private String tokenCondition(String kind, String token, List<Object> args, List<String> storeIds, List<String> productIds,
                                  List<String> supplierIds, List<String> warehouseIds) {
        String like = QueryUtils.likeContains(token);
        String compact = token.replace("-", "");
        List<String> ors = new ArrayList<>();
        ors.add("d.code LIKE ?"); args.add(like);
        if (!compact.isEmpty()) {
            ors.add("REPLACE(d.code, '-', '') LIKE ?"); args.add(QueryUtils.likeContains(compact));
        }
        ors.add("d.remark LIKE ?"); args.add(like);
        ors.add("DATE_FORMAT(d.doc_date, '%Y-%m-%d') LIKE ?"); args.add(like);

        String lineTable;
        switch (kind) {
            case "sale":
            case "return":
                ors.add("s.name LIKE ?"); args.add(like);
                ors.add("a.display_name LIKE ?"); args.add(like);
                addIn(ors, args, "d.store_id", storeIds);
                lineTable = "sale".equals(kind) ? "wh_sale_line" : "wh_return_line";
                break;
            case "inbound":
                ors.add("sup.name LIKE ?"); args.add(like);
                addIn(ors, args, "d.supplier_id", supplierIds);
                lineTable = "wh_inbound_line";
                break;
            default:
                ors.add("wf.name LIKE ?"); args.add(like);
                ors.add("wt.name LIKE ?"); args.add(like);
                addIn(ors, args, "d.from_warehouse_id", warehouseIds);
                addIn(ors, args, "d.to_warehouse_id", warehouseIds);
                lineTable = "wh_transfer_line";
        }
        if (AMOUNT.matcher(token).matches() && !"transfer".equals(kind) && !"inbound".equals(kind)) {
            ors.add("d.total_amount = ?"); args.add(new java.math.BigDecimal(token));
        }
        StringBuilder product = new StringBuilder("EXISTS (SELECT 1 FROM " + lineTable
            + " l JOIN wh_product p ON p.id = l.product_id WHERE l.doc_id = d.id AND (p.name LIKE ? OR p.barcode LIKE ?");
        args.add(like);
        args.add(like);
        if (productIds != null && !productIds.isEmpty()) {
            product.append(" OR l.product_id IN (").append(String.join(",", Collections.nCopies(productIds.size(), "?"))).append(")");
            args.addAll(productIds);
        }
        product.append("))");
        ors.add(product.toString());
        return String.join(" OR ", ors);
    }

    private void addIn(List<String> ors, List<Object> args, String column, List<String> ids) {
        if (ids == null || ids.isEmpty()) return;
        ors.add(column + " IN (" + String.join(",", Collections.nCopies(ids.size(), "?")) + ")");
        args.addAll(ids);
    }

    private List<String> pinyinIds(String sql, String token) {
        List<String> ids = new ArrayList<>();
        jdbcTemplate.query(sql, rs -> {
            if (PinyinMatcher.matches(rs.getString("name"), token)) {
                ids.add(rs.getString("id"));
            }
        });
        return ids;
    }

    /** 销单 → 关联退单单号；退单 → 引用它的销单单号。 */
    private void fillLinks(List<Map<String, Object>> rows) {
        List<String> returnIds = new ArrayList<>();
        List<String> saleLinkedReturns = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if ("sale".equals(row.get("type")) && QueryUtils.hasText((String) row.get("linkedId"))) {
                saleLinkedReturns.add((String) row.get("linkedId"));
            } else if ("return".equals(row.get("type"))) {
                returnIds.add((String) row.get("id"));
            }
        }
        Map<String, String[]> returnInfo = new HashMap<>();
        if (!saleLinkedReturns.isEmpty()) {
            jdbcTemplate.query("SELECT id, code, status FROM wh_return_doc WHERE id IN ("
                    + String.join(",", Collections.nCopies(saleLinkedReturns.size(), "?")) + ")",
                rs -> {
                    returnInfo.put(rs.getString("id"), new String[]{rs.getString("code"), rs.getString("status")});
                }, saleLinkedReturns.toArray());
        }
        Map<String, String[]> saleByReturn = new HashMap<>();
        if (!returnIds.isEmpty()) {
            jdbcTemplate.query("SELECT id, code, status, return_doc_id FROM wh_sale_doc WHERE return_doc_id IN ("
                    + String.join(",", Collections.nCopies(returnIds.size(), "?")) + ") ORDER BY created_at",
                rs -> {
                    String[] prev = saleByReturn.get(rs.getString("return_doc_id"));
                    if (prev == null || "voided".equals(prev[2])) {
                        saleByReturn.put(rs.getString("return_doc_id"), new String[]{rs.getString("id"), rs.getString("code"), rs.getString("status")});
                    }
                }, returnIds.toArray());
        }
        for (Map<String, Object> row : rows) {
            if ("sale".equals(row.get("type"))) {
                String[] info = returnInfo.get(row.get("linkedId"));
                if (info != null) {
                    row.put("linkedCode", info[0]);
                    row.put("linkedStatus", info[1]);
                }
            } else if ("return".equals(row.get("type"))) {
                String[] info = saleByReturn.get(row.get("id"));
                if (info != null) {
                    row.put("linkedId", info[0]);
                    row.put("linkedCode", info[1]);
                    row.put("linkedStatus", info[2]);
                }
            }
        }
    }
}
