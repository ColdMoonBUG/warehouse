package com.yeqifu.warehouse.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.PinyinMatcher;
import com.yeqifu.warehouse.common.QueryUtils;
import com.yeqifu.warehouse.entity.ReturnDoc;
import com.yeqifu.warehouse.entity.ReturnLine;
import com.yeqifu.warehouse.entity.SaleDoc;
import com.yeqifu.warehouse.entity.SaleLine;
import com.yeqifu.warehouse.mapper.ReturnDocMapper;
import com.yeqifu.warehouse.mapper.ReturnLineMapper;
import com.yeqifu.warehouse.mapper.SaleDocMapper;
import com.yeqifu.warehouse.mapper.SaleLineMapper;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 销单 / 退单列表查询：服务端筛选、批量加载明细、补充关联单号。
 * 不传任何筛选参数时与旧接口返回完全一致。
 */
@Service
public class DocQueryService {

    private static final Set<String> SALE_STATES = new HashSet<>(Arrays.asList("draft", "posted", "voided", "unsettled", "settled"));
    private static final Set<String> RETURN_STATES = new HashSet<>(Arrays.asList("draft", "posted", "voided"));

    @Autowired
    private SaleDocMapper saleDocMapper;
    @Autowired
    private SaleLineMapper saleLineMapper;
    @Autowired
    private ReturnDocMapper returnDocMapper;
    @Autowired
    private ReturnLineMapper returnLineMapper;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Data
    public static class DocFilter {
        private String storeId;
        private String salespersonId;
        /** 逗号分隔：draft / posted / voided；销单另支持 unsettled（已过账未收款）/ settled（已收款） */
        private String status;
        /** 销单：sale / gift */
        private String docType;
        /** 销单：cash / bill */
        private String paymentType;
        /** 退单：vehicle_return / warehouse_return */
        private String returnType;
        private String startDate;
        private String endDate;
        /** 单号、备注、门店名（含拼音首字母），空格分隔多个词时需同时命中 */
        private String keyword;
    }

    // ---------------------------------------------------------------- 销单

    public LambdaQueryWrapper<SaleDoc> saleQuery(DocFilter f) {
        LambdaQueryWrapper<SaleDoc> qw = new LambdaQueryWrapper<>();
        if (f == null) {
            return qw;
        }
        qw.eq(QueryUtils.hasText(f.getStoreId()), SaleDoc::getStoreId, f.getStoreId());
        qw.eq(QueryUtils.hasText(f.getSalespersonId()), SaleDoc::getSalespersonId, f.getSalespersonId());
        qw.eq(QueryUtils.hasText(f.getPaymentType()), SaleDoc::getPaymentType, f.getPaymentType());
        java.sql.Date start = QueryUtils.parseDate(f.getStartDate(), "开始日期");
        java.sql.Date end = QueryUtils.parseDate(f.getEndDate(), "结束日期");
        qw.ge(start != null, SaleDoc::getDocDate, start);
        qw.le(end != null, SaleDoc::getDocDate, end);

        List<String> states = QueryUtils.csv(f.getStatus()).stream().filter(SALE_STATES::contains).collect(Collectors.toList());
        if (!states.isEmpty()) {
            qw.and(w -> {
                boolean first = true;
                for (String s : states) {
                    if (!first) {
                        w.or();
                    }
                    first = false;
                    if ("unsettled".equals(s)) {
                        w.nested(n -> n.eq(SaleDoc::getStatus, "posted").and(m -> m.isNull(SaleDoc::getSettled).or().eq(SaleDoc::getSettled, 0)));
                    } else if ("settled".equals(s)) {
                        w.nested(n -> n.eq(SaleDoc::getStatus, "posted").eq(SaleDoc::getSettled, 1));
                    } else {
                        w.eq(SaleDoc::getStatus, s);
                    }
                }
            });
        }
        if ("gift".equals(f.getDocType())) {
            qw.eq(SaleDoc::getDocType, "gift");
        } else if ("sale".equals(f.getDocType())) {
            qw.and(w -> w.isNull(SaleDoc::getDocType).or().ne(SaleDoc::getDocType, "gift"));
        }
        for (String token : QueryUtils.tokens(f.getKeyword())) {
            List<String> storeIds = storeIdsMatching(token);
            qw.and(w -> {
                w.like(SaleDoc::getCode, token).or().like(SaleDoc::getRemark, token);
                if (!storeIds.isEmpty()) {
                    w.or().in(SaleDoc::getStoreId, storeIds);
                }
            });
        }
        return qw;
    }

    public void fillSaleLines(List<SaleDoc> docs) {
        if (docs.isEmpty()) {
            return;
        }
        List<String> ids = docs.stream().map(SaleDoc::getId).collect(Collectors.toList());
        Map<String, List<SaleLine>> byDoc = new HashMap<>();
        for (List<String> chunk : chunks(ids)) {
            saleLineMapper.selectList(new LambdaQueryWrapper<SaleLine>()
                    .in(SaleLine::getDocId, chunk)
                    .orderByAsc(SaleLine::getLineNo).orderByAsc(SaleLine::getId))
                .forEach(l -> byDoc.computeIfAbsent(l.getDocId(), k -> new ArrayList<>()).add(l));
        }
        for (SaleDoc doc : docs) {
            doc.setLines(byDoc.getOrDefault(doc.getId(), Collections.emptyList()));
        }
    }

    /** 列表不带明细时，用明细汇总回填总数量/金额与品种数，保证与带明细时算出的数字一致。 */
    public void fillSaleSummaries(List<SaleDoc> docs) {
        Map<String, Object[]> sums = lineSums("wh_sale_line", docs.stream().map(SaleDoc::getId).collect(Collectors.toList()));
        for (SaleDoc doc : docs) {
            Object[] s = sums.get(doc.getId());
            doc.setLines(Collections.emptyList());
            doc.setLineCount(s == null ? 0 : (Integer) s[0]);
            doc.setTotalQty(s == null ? 0 : (Integer) s[1]);
            doc.setTotalAmount(s == null ? BigDecimal.ZERO : (BigDecimal) s[2]);
        }
    }

    /** 回填销单关联退单的单号和状态，前端可以直接显示并跳转。 */
    public void fillReturnLinks(List<SaleDoc> docs) {
        Set<String> returnIds = docs.stream().map(SaleDoc::getReturnDocId).filter(QueryUtils::hasText).collect(Collectors.toSet());
        if (returnIds.isEmpty()) {
            return;
        }
        Map<String, ReturnDoc> byId = new HashMap<>();
        for (List<String> chunk : chunks(new ArrayList<>(returnIds))) {
            returnDocMapper.selectList(new LambdaQueryWrapper<ReturnDoc>()
                    .select(ReturnDoc::getId, ReturnDoc::getCode, ReturnDoc::getStatus)
                    .in(ReturnDoc::getId, chunk))
                .forEach(r -> byId.put(r.getId(), r));
        }
        for (SaleDoc doc : docs) {
            ReturnDoc r = byId.get(doc.getReturnDocId());
            if (r != null) {
                doc.setReturnDocCode(r.getCode());
                doc.setReturnDocStatus(r.getStatus());
            }
        }
    }

    // ---------------------------------------------------------------- 退单

    public LambdaQueryWrapper<ReturnDoc> returnQuery(DocFilter f) {
        LambdaQueryWrapper<ReturnDoc> qw = new LambdaQueryWrapper<>();
        if (f == null) {
            return qw;
        }
        qw.eq(QueryUtils.hasText(f.getStoreId()), ReturnDoc::getStoreId, f.getStoreId());
        qw.eq(QueryUtils.hasText(f.getSalespersonId()), ReturnDoc::getSalespersonId, f.getSalespersonId());
        qw.eq(QueryUtils.hasText(f.getReturnType()), ReturnDoc::getReturnType, f.getReturnType());
        java.sql.Date start = QueryUtils.parseDate(f.getStartDate(), "开始日期");
        java.sql.Date end = QueryUtils.parseDate(f.getEndDate(), "结束日期");
        qw.ge(start != null, ReturnDoc::getDocDate, start);
        qw.le(end != null, ReturnDoc::getDocDate, end);
        List<String> states = QueryUtils.csv(f.getStatus()).stream().filter(RETURN_STATES::contains).collect(Collectors.toList());
        qw.in(!states.isEmpty(), ReturnDoc::getStatus, states);
        for (String token : QueryUtils.tokens(f.getKeyword())) {
            List<String> storeIds = storeIdsMatching(token);
            qw.and(w -> {
                w.like(ReturnDoc::getCode, token).or().like(ReturnDoc::getRemark, token);
                if (!storeIds.isEmpty()) {
                    w.or().in(ReturnDoc::getStoreId, storeIds);
                }
            });
        }
        return qw;
    }

    public void fillReturnLines(List<ReturnDoc> docs) {
        if (docs.isEmpty()) {
            return;
        }
        List<String> ids = docs.stream().map(ReturnDoc::getId).collect(Collectors.toList());
        Map<String, List<ReturnLine>> byDoc = new HashMap<>();
        for (List<String> chunk : chunks(ids)) {
            returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>()
                    .in(ReturnLine::getDocId, chunk)
                    .orderByAsc(ReturnLine::getLineNo).orderByAsc(ReturnLine::getId))
                .forEach(l -> byDoc.computeIfAbsent(l.getDocId(), k -> new ArrayList<>()).add(l));
        }
        for (ReturnDoc doc : docs) {
            doc.setLines(byDoc.getOrDefault(doc.getId(), Collections.emptyList()));
        }
    }

    public void fillReturnSummaries(List<ReturnDoc> docs) {
        Map<String, Object[]> sums = lineSums("wh_return_line", docs.stream().map(ReturnDoc::getId).collect(Collectors.toList()));
        for (ReturnDoc doc : docs) {
            Object[] s = sums.get(doc.getId());
            doc.setLines(Collections.emptyList());
            doc.setLineCount(s == null ? 0 : (Integer) s[0]);
            doc.setTotalQty(s == null ? 0 : (Integer) s[1]);
            doc.setTotalAmount(s == null ? BigDecimal.ZERO : (BigDecimal) s[2]);
        }
    }

    /** 回填退单对应的销单（销单表 return_doc_id 指向本退单）。 */
    public void fillSaleLinks(List<ReturnDoc> docs) {
        if (docs.isEmpty()) {
            return;
        }
        List<String> ids = docs.stream().map(ReturnDoc::getId).collect(Collectors.toList());
        Map<String, SaleDoc> byReturnId = new HashMap<>();
        for (List<String> chunk : chunks(ids)) {
            saleDocMapper.selectList(new LambdaQueryWrapper<SaleDoc>()
                    .select(SaleDoc::getId, SaleDoc::getCode, SaleDoc::getStatus, SaleDoc::getReturnDocId)
                    .in(SaleDoc::getReturnDocId, chunk)
                    .orderByAsc(SaleDoc::getCreatedAt))
                .forEach(s -> {
                    // 同一退单被多张销单引用时，优先展示仍有效的那张
                    SaleDoc prev = byReturnId.get(s.getReturnDocId());
                    if (prev == null || "voided".equals(prev.getStatus())) {
                        byReturnId.put(s.getReturnDocId(), s);
                    }
                });
        }
        for (ReturnDoc doc : docs) {
            SaleDoc s = byReturnId.get(doc.getId());
            if (s != null) {
                doc.setSaleDocId(s.getId());
                doc.setSaleDocCode(s.getCode());
                doc.setSaleDocStatus(s.getStatus());
            }
        }
    }

    // ---------------------------------------------------------------- 工具

    /** 门店名称或拼音命中搜索词的门店 id。 */
    public List<String> storeIdsMatching(String token) {
        String t = token.toLowerCase();
        List<String> ids = new ArrayList<>();
        jdbcTemplate.query("SELECT id, name FROM wh_store", rs -> {
            String name = rs.getString("name");
            if (name != null && (name.toLowerCase().contains(t) || PinyinMatcher.matches(name, token))) {
                ids.add(rs.getString("id"));
            }
        });
        return ids;
    }

    private Map<String, Object[]> lineSums(String table, List<String> docIds) {
        Map<String, Object[]> result = new LinkedHashMap<>();
        for (List<String> chunk : chunks(docIds)) {
            String placeholders = String.join(",", Collections.nCopies(chunk.size(), "?"));
            jdbcTemplate.query(
                "SELECT doc_id, COUNT(*) c, COALESCE(SUM(qty), 0) q, COALESCE(SUM(amount), 0) a FROM " + table
                    + " WHERE doc_id IN (" + placeholders + ") GROUP BY doc_id",
                rs -> {
                    result.put(rs.getString("doc_id"), new Object[]{rs.getInt("c"), rs.getInt("q"), rs.getBigDecimal("a")});
                },
                chunk.toArray());
        }
        return result;
    }

    private static <T> List<List<T>> chunks(Collection<T> items) {
        List<T> list = new ArrayList<>(items);
        List<List<T>> result = new ArrayList<>();
        for (int i = 0; i < list.size(); i += 500) {
            result.add(list.subList(i, Math.min(list.size(), i + 500)));
        }
        return result;
    }
}
