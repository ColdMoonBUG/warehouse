package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.yeqifu.warehouse.common.QueryUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.ReturnDoc;
import com.yeqifu.warehouse.entity.ReturnLine;
import com.yeqifu.warehouse.entity.SaleDoc;
import com.yeqifu.warehouse.entity.SaleLine;
import com.yeqifu.warehouse.mapper.SaleDocMapper;
import com.yeqifu.warehouse.mapper.SaleLineMapper;
import com.yeqifu.warehouse.mapper.StoreMapper;
import com.yeqifu.warehouse.service.DocPostingService;
import com.yeqifu.warehouse.service.DocQueryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/sale")
public class SaleController {

    /** 统计口径：排除赠送单；doc_type 为 NULL 的历史单视为普通销售单。 */
    private static final String NOT_GIFT = "(d.doc_type IS NULL OR d.doc_type <> 'gift')";

    @Autowired
    private SaleDocMapper saleDocMapper;
    @Autowired
    private SaleLineMapper saleLineMapper;
    @Autowired
    private StoreMapper storeMapper;
    @Autowired
    private com.yeqifu.warehouse.mapper.ReturnDocMapper returnDocMapper;
    @Autowired
    private DocPostingService postingService;
    @Autowired
    private DocQueryService queryService;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * 销单列表。不带筛选参数时与旧版一致（按创建时间倒序分页，含明细）。
     * 可选：salespersonId、status（draft/posted/voided/unsettled/settled，逗号分隔）、docType、
     * startDate/endDate（单据日期）、keyword；withLines=false 时不返回明细，只带汇总数量/金额/品种数。
     */
    @GetMapping("/list")
    public Result<List<SaleDoc>> list(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer limit,
            DocQueryService.DocFilter filter,
            @RequestParam(defaultValue = "true") boolean withLines) {
        LambdaQueryWrapper<SaleDoc> qw = queryService.saleQuery(filter)
            .orderByDesc(SaleDoc::getCreatedAt).orderByDesc(SaleDoc::getId);
        IPage<SaleDoc> result = saleDocMapper.selectPage(new Page<>(page, limit), qw);
        List<SaleDoc> records = result.getRecords();
        if (withLines) {
            queryService.fillSaleLines(records);
        } else {
            queryService.fillSaleSummaries(records);
        }
        queryService.fillReturnLinks(records);
        return Result.ok(records, result.getTotal());
    }

    @GetMapping("/detail/{id}")
    public Result<SaleDoc> detail(@PathVariable String id) {
        SaleDoc doc = postingService.loadSale(id);
        if (doc != null) {
            queryService.fillReturnLinks(Collections.singletonList(doc));
        }
        return Result.ok(doc);
    }

    // 业务校验失败抛 BizException，由事务拦截器回滚、ApiExceptionHandler 转成 {code:-1,msg}。
    // 不能在这里 catch 后 setRollbackOnly 再 return：控制器被 Shiro 的 DefaultAdvisorAutoProxyCreator
    // 重复代理，那样会在提交时抛 UnexpectedRollbackException，前端只能看到 HTTP 500。
    @PostMapping("/save")
    @Transactional
    public Result<SaleDoc> save(@RequestBody SaleDocVO vo) {
        return Result.ok(postingService.saveSaleDraft(vo.getDoc(), vo.getLines()));
    }

    /**
     * 一次完成：保存并过账销单、可选现金收款、可选随单退货（保存+过账+关联）。
     * 两张单都由客户端预先生成 id，超时后用同一请求重试不会重复开单。
     */
    @PostMapping("/submit")
    @Transactional
    public Result<Map<String, Object>> submit(@RequestBody SubmitVO vo) {
        if (vo == null || vo.getDoc() == null) {
            return Result.error("单据数据为空");
        }
        ReturnDoc ret = vo.getReturnDoc();
        if (ret != null && vo.getReturnLines() != null && !vo.getReturnLines().isEmpty()) {
            if (!QueryUtils.hasText(ret.getSalespersonId())) ret.setSalespersonId(vo.getDoc().getSalespersonId());
            if (!QueryUtils.hasText(ret.getStoreId())) ret.setStoreId(vo.getDoc().getStoreId());
            if (!QueryUtils.hasText(ret.getFromWarehouseId())) ret.setFromWarehouseId(vo.getDoc().getWarehouseId());
            if (ret.getDocDate() == null) ret.setDocDate(vo.getDoc().getDocDate());
        }
        return Result.ok(postingService.submitSale(vo.getDoc(), vo.getLines(), ret, vo.getReturnLines()));
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        postingService.postSale(id);
        return Result.ok();
    }

    /**
     * 作废销单。默认连同关联的已过账退单一起作废（与 App“作废销单”“根据此单重建”的预期一致）；
     * 关联退单作废失败时仍作废销单，并在 msg 中返回提示。cascadeReturn=false 只作废销单。
     */
    @PostMapping("/void/{id}")
    @Transactional
    public Result<Void> voidDoc(@PathVariable String id,
                                @RequestParam(defaultValue = "true") boolean cascadeReturn) {
        String warning = postingService.voidSale(id, cascadeReturn);
        Result<Void> result = Result.ok();
        if (warning != null) {
            result.setMsg("销单已作废；" + warning);
        }
        return result;
    }

    @PostMapping("/linkReturn/{id}")
    @Transactional
    public Result<Void> linkReturn(@PathVariable String id, @RequestParam String returnDocId) {
        postingService.linkReturnToSale(id, returnDocId);
        return Result.ok();
    }

    @PostMapping("/delete/{id}")
    @Transactional
    public Result<Void> delete(@PathVariable String id) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc == null) return Result.error("单据不存在");
        if (!"draft".equals(doc.getStatus())) return Result.error("仅草稿状态可删除");
        int deleted = saleDocMapper.delete(new LambdaQueryWrapper<SaleDoc>().eq(SaleDoc::getId, id).eq(SaleDoc::getStatus, "draft"));
        if (deleted == 0) return Result.error("单据状态已变更，请刷新");
        saleLineMapper.delete(new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, id));
        return Result.ok();
    }

    @GetMapping("/unsettled")
    public Result<List<SaleDoc>> unsettled(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer limit,
            @RequestParam(required = false) String salespersonId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "true") boolean withLines) {
        DocQueryService.DocFilter filter = new DocQueryService.DocFilter();
        filter.setSalespersonId(salespersonId);
        filter.setStartDate(startDate);
        filter.setEndDate(endDate);
        filter.setStatus("unsettled");
        IPage<SaleDoc> result = saleDocMapper.selectPage(new Page<>(page, limit),
            queryService.saleQuery(filter).orderByDesc(SaleDoc::getCreatedAt).orderByDesc(SaleDoc::getId));
        List<SaleDoc> records = result.getRecords();
        if (withLines) {
            queryService.fillSaleLines(records);
        } else {
            queryService.fillSaleSummaries(records);
        }
        queryService.fillReturnLinks(records);
        return Result.ok(records, result.getTotal());
    }

    @PostMapping("/settle/{id}")
    public Result<Void> settle(@PathVariable String id, javax.servlet.http.HttpSession session) {
        Object operatorId = session.getAttribute("warehouseAccountId");
        int updated = saleDocMapper.update(null, new LambdaUpdateWrapper<SaleDoc>()
            .set(SaleDoc::getSettled, 1)
            .set(SaleDoc::getSettledAt, new Date())
            .set(SaleDoc::getSettledBy, operatorId instanceof String ? (String) operatorId : null)
            .eq(SaleDoc::getId, id)
            .eq(SaleDoc::getStatus, "posted"));
        return updated > 0 ? Result.ok() : Result.error("单据状态异常");
    }

    @PostMapping("/unsettle/{id}")
    public Result<Void> unsettle(@PathVariable String id) {
        int updated = saleDocMapper.update(null, new LambdaUpdateWrapper<SaleDoc>()
            .set(SaleDoc::getSettled, 0)
            .set(SaleDoc::getSettledAt, null)
            .set(SaleDoc::getSettledBy, null)
            .eq(SaleDoc::getId, id));
        return updated > 0 ? Result.ok() : Result.error("单据不存在");
    }

    /**
     * 按超市统计净销售袋数（销售袋数 - 退货袋数），首页看板颜色分级用
     * GET /api/sale/storeNetQty 或 GET /api/sale/storeNetQty?startDate=2026-05-01&endDate=2026-05-31
     */
    @GetMapping("/storeNetQty")
    public Result<Map<String, Integer>> storeNetQty(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        java.sql.Date sqlStart = null;
        java.sql.Date sqlEnd = null;
        if (QueryUtils.hasText(startDate) && QueryUtils.hasText(endDate)) {
            sqlStart = java.sql.Date.valueOf(java.time.LocalDate.parse(startDate));
            sqlEnd = java.sql.Date.valueOf(java.time.LocalDate.parse(endDate));
        }
        List<Object> saleArgs = new ArrayList<>();
        String saleSql = "SELECT COALESCE(d.store_id, '') sid, COALESCE(SUM(l.qty), 0) q FROM wh_sale_doc d"
            + " LEFT JOIN wh_sale_line l ON l.doc_id = d.id WHERE d.status = 'posted' AND " + NOT_GIFT
            + dateRange("d", sqlStart, sqlEnd, saleArgs) + " GROUP BY COALESCE(d.store_id, '')";
        Map<String, Integer> saleMap = sumByKey(saleSql, saleArgs);

        // 退货袋数（vehicle_return，按超市扣除）
        List<Object> retArgs = new ArrayList<>();
        String retSql = "SELECT COALESCE(d.store_id, '') sid, COALESCE(SUM(l.qty), 0) q FROM wh_return_doc d"
            + " LEFT JOIN wh_return_line l ON l.doc_id = d.id WHERE d.status = 'posted' AND d.return_type = 'vehicle_return'"
            + dateRange("d", sqlStart, sqlEnd, retArgs) + " GROUP BY COALESCE(d.store_id, '')";
        Map<String, Integer> returnMap = sumByKey(retSql, retArgs);

        // 净销售袋数 = 销售 - 退货
        Map<String, Integer> result = new HashMap<>();
        for (String sid : saleMap.keySet()) {
            int net = saleMap.getOrDefault(sid, 0) - returnMap.getOrDefault(sid, 0);
            result.put(sid, Math.max(0, net));
        }
        return Result.ok(result);
    }

    @GetMapping("/storeSaleQty")
    public Result<Map<String, Integer>> storeSaleQty(@RequestParam(defaultValue = "30") Integer days) {
        java.sql.Date start = java.sql.Date.valueOf(java.time.LocalDate.now().minusDays(days));
        // 原为 eq(docType,'sale')，会漏掉 docType 为 NULL 的历史单
        String sql = "SELECT d.store_id sid, COALESCE(SUM(l.qty), 0) q FROM wh_sale_doc d"
            + " LEFT JOIN wh_sale_line l ON l.doc_id = d.id"
            + " WHERE d.status = 'posted' AND d.doc_date >= ? AND " + NOT_GIFT + " GROUP BY d.store_id";
        return Result.ok(sumByKey(sql, Collections.singletonList(start)));
    }

    /**
     * 按超市统计区间内净销售额（销售额 - 退货额），前端超市流水排行用
     * GET /api/sale/storeRangeSummary?startDate=2026-01-01&endDate=2026-05-31
     */
    @GetMapping("/storeRangeSummary")
    public Result<List<Map<String, Object>>> storeRangeSummary(
            @RequestParam String startDate,
            @RequestParam String endDate) {
        java.sql.Date sqlStart = java.sql.Date.valueOf(java.time.LocalDate.parse(startDate));
        java.sql.Date sqlEnd = java.sql.Date.valueOf(java.time.LocalDate.parse(endDate));

        // 1. 区间内所有已过账销单（排除赠送单，口径与 storeSaleQty 一致）
        LambdaQueryWrapper<SaleDoc> summaryQw = new LambdaQueryWrapper<SaleDoc>()
                .select(SaleDoc::getId, SaleDoc::getStoreId, SaleDoc::getTotalAmount)
                .eq(SaleDoc::getStatus, "posted")
                .ge(SaleDoc::getDocDate, sqlStart)
                .le(SaleDoc::getDocDate, sqlEnd)
                .and(w -> w.isNull(SaleDoc::getDocType).or().ne(SaleDoc::getDocType, "gift"));
        List<SaleDoc> saleDocs = saleDocMapper.selectList(summaryQw);

        Map<String, BigDecimal> saleMap = new LinkedHashMap<>();
        Map<String, Integer> saleDocCountMap = new LinkedHashMap<>();
        for (SaleDoc doc : saleDocs) {
            String sid = doc.getStoreId() != null ? doc.getStoreId() : "";
            BigDecimal amt = doc.getTotalAmount() != null ? doc.getTotalAmount() : BigDecimal.ZERO;
            saleMap.put(sid, saleMap.getOrDefault(sid, BigDecimal.ZERO).add(amt));
            saleDocCountMap.put(sid, saleDocCountMap.getOrDefault(sid, 0) + 1);
        }

        // 2. 区间内所有已过账退单（vehicle_return，按超市扣除）
        Map<String, BigDecimal> returnMap = new LinkedHashMap<>();
        List<ReturnDoc> rets = returnDocMapper.selectList(
            new LambdaQueryWrapper<ReturnDoc>()
                .select(ReturnDoc::getId, ReturnDoc::getStoreId, ReturnDoc::getTotalAmount)
                .eq(ReturnDoc::getStatus, "posted")
                .eq(ReturnDoc::getReturnType, "vehicle_return")
                .ge(ReturnDoc::getDocDate, sqlStart)
                .le(ReturnDoc::getDocDate, sqlEnd)
        );
        for (ReturnDoc ret : rets) {
            String sid = ret.getStoreId() != null ? ret.getStoreId() : "";
            BigDecimal amt = ret.getTotalAmount() != null ? ret.getTotalAmount() : BigDecimal.ZERO;
            returnMap.put(sid, returnMap.getOrDefault(sid, BigDecimal.ZERO).add(amt));
        }

        Set<String> storeIds = new LinkedHashSet<>(saleMap.keySet());
        Map<String, String> storeNameMap = new LinkedHashMap<>();
        if (!storeIds.isEmpty()) {
            for (com.yeqifu.warehouse.entity.Store s : storeMapper.selectBatchIds(storeIds)) {
                storeNameMap.put(s.getId(), s.getName());
            }
        }

        // 组装结果，按净销售额倒序
        List<Map<String, Object>> result = new ArrayList<>();
        for (String sid : saleMap.keySet()) {
            BigDecimal saleAmt = saleMap.getOrDefault(sid, BigDecimal.ZERO);
            BigDecimal retAmt = returnMap.getOrDefault(sid, BigDecimal.ZERO);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("storeId", sid);
            row.put("storeName", storeNameMap.getOrDefault(sid, sid.isEmpty() ? "未知门店" : sid));
            row.put("saleAmount", saleAmt);
            row.put("returnAmount", retAmt);
            row.put("netAmount", saleAmt.subtract(retAmt));
            row.put("saleDocCount", saleDocCountMap.getOrDefault(sid, 0));
            result.add(row);
        }
        result.sort((a, b) -> ((BigDecimal) b.get("netAmount")).compareTo((BigDecimal) a.get("netAmount")));
        return Result.ok(result);
    }

    @GetMapping("/productSaleQty")
    public Result<Map<String, Integer>> productSaleQty(@RequestParam(defaultValue = "30") Integer days) {
        java.sql.Date start = java.sql.Date.valueOf(java.time.LocalDate.now().minusDays(days));
        // 赠送不计入销量排序
        String sql = "SELECT l.product_id sid, COALESCE(SUM(l.qty), 0) q FROM wh_sale_line l"
            + " JOIN wh_sale_doc d ON d.id = l.doc_id"
            + " WHERE d.status = 'posted' AND d.doc_date >= ? AND " + NOT_GIFT + " GROUP BY l.product_id";
        return Result.ok(sumByKey(sql, Collections.singletonList(start)));
    }

    /**
     * 单商品进退统计：某商品在区间内累计销售袋数、退货袋数（分车库退/回仓退）、净销售
     * GET /api/sale/productStat?productId=X[&startDate=&endDate=]
     * 不传日期则统计全部历史。排除赠送单(docType=gift)的销售数，赠送数单独返回。
     */
    @GetMapping("/productStat")
    public Result<Map<String, Object>> productStat(
            @RequestParam String productId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        java.sql.Date sqlStart = null, sqlEnd = null;
        if (QueryUtils.hasText(startDate) && QueryUtils.hasText(endDate)) {
            sqlStart = java.sql.Date.valueOf(java.time.LocalDate.parse(startDate));
            sqlEnd = java.sql.Date.valueOf(java.time.LocalDate.parse(endDate));
        }

        List<Object> saleArgs = new ArrayList<>();
        saleArgs.add(productId);
        Map<String, Object> sale = jdbcTemplate.queryForMap(
            "SELECT COALESCE(SUM(CASE WHEN d.doc_type = 'gift' THEN 0 ELSE l.qty END), 0) sale_qty,"
                + " COALESCE(SUM(CASE WHEN d.doc_type = 'gift' THEN l.qty ELSE 0 END), 0) gift_qty,"
                + " COALESCE(SUM(CASE WHEN d.doc_type = 'gift' THEN 0 ELSE COALESCE(l.amount, 0) END), 0) sale_amount"
                + " FROM wh_sale_line l JOIN wh_sale_doc d ON d.id = l.doc_id"
                + " WHERE d.status = 'posted' AND l.product_id = ?" + dateRange("d", sqlStart, sqlEnd, saleArgs),
            saleArgs.toArray());

        List<Object> retArgs = new ArrayList<>();
        retArgs.add(productId);
        Map<String, Object> ret = jdbcTemplate.queryForMap(
            "SELECT COALESCE(SUM(CASE WHEN d.return_type = 'warehouse_return' THEN 0 ELSE l.qty END), 0) vehicle_qty,"
                + " COALESCE(SUM(CASE WHEN d.return_type = 'warehouse_return' THEN l.qty ELSE 0 END), 0) warehouse_qty,"
                + " COALESCE(SUM(COALESCE(l.amount, 0)), 0) return_amount"
                + " FROM wh_return_line l JOIN wh_return_doc d ON d.id = l.doc_id"
                + " WHERE d.status = 'posted' AND l.product_id = ?" + dateRange("d", sqlStart, sqlEnd, retArgs),
            retArgs.toArray());

        int saleQty = toInt(sale.get("sale_qty"));
        int giftQty = toInt(sale.get("gift_qty"));
        int vehicleReturnQty = toInt(ret.get("vehicle_qty"));
        int warehouseReturnQty = toInt(ret.get("warehouse_qty"));

        Map<String, Object> res = new HashMap<>();
        res.put("saleQty", saleQty);
        res.put("giftQty", giftQty);
        res.put("saleAmount", toDecimal(sale.get("sale_amount")));
        res.put("vehicleReturnQty", vehicleReturnQty);
        res.put("warehouseReturnQty", warehouseReturnQty);
        res.put("returnQty", vehicleReturnQty + warehouseReturnQty);
        res.put("returnAmount", toDecimal(ret.get("return_amount")));
        // 净销售 = 销售 - 超市退货。
        // 超市退回车上的货会再卖给别家，销售额被重复计入，减掉车库退货正好抵消这部分转手，
        // 得到「超市最终留下的数量」——等价于「出库量 - 回仓量」（车上还没卖的除外）。
        // 回仓退货不能再减：那批货从来没算进销售，减了等于扣了没加过的数。
        res.put("netQty", saleQty - vehicleReturnQty);
        return Result.ok(res);
    }

    private String dateRange(String alias, java.sql.Date start, java.sql.Date end, List<Object> args) {
        if (start == null) {
            return "";
        }
        args.add(start);
        args.add(end);
        return " AND " + alias + ".doc_date >= ? AND " + alias + ".doc_date <= ?";
    }

    private Map<String, Integer> sumByKey(String sql, List<Object> args) {
        Map<String, Integer> map = new HashMap<>();
        jdbcTemplate.query(sql, rs -> {
            map.put(rs.getString("sid"), rs.getInt("q"));
        }, args.toArray());
        return map;
    }

    private static int toInt(Object v) {
        return v == null ? 0 : ((Number) v).intValue();
    }

    private static BigDecimal toDecimal(Object v) {
        if (v == null) return BigDecimal.ZERO;
        return v instanceof BigDecimal ? (BigDecimal) v : new BigDecimal(v.toString());
    }

    // 内部VO类
    @lombok.Data
    public static class SaleDocVO {
        private SaleDoc doc;
        private List<SaleLine> lines;
    }

    @lombok.Data
    public static class SubmitVO {
        private SaleDoc doc;
        private List<SaleLine> lines;
        private ReturnDoc returnDoc;
        private List<ReturnLine> returnLines;
    }
}
