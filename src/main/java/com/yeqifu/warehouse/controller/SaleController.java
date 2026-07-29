package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.common.RuntimeModeManager;
import com.yeqifu.warehouse.entity.SaleDoc;
import com.yeqifu.warehouse.entity.SaleLine;
import com.yeqifu.warehouse.entity.Ledger;
import com.yeqifu.warehouse.entity.Product;
import com.yeqifu.warehouse.entity.Stock;
import com.yeqifu.warehouse.mapper.LedgerMapper;
import com.yeqifu.warehouse.mapper.ProductMapper;
import com.yeqifu.warehouse.mapper.SaleDocMapper;
import com.yeqifu.warehouse.mapper.SaleLineMapper;
import com.yeqifu.warehouse.mapper.StockMapper;
import com.yeqifu.warehouse.mapper.AccountMapper;
import com.yeqifu.warehouse.entity.Account;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import com.yeqifu.warehouse.entity.CommissionLedger;
import com.yeqifu.warehouse.mapper.CommissionLedgerMapper;

@RestController
@RequestMapping("/api/sale")
public class SaleController {

    private static final String MAIN_WAREHOUSE_ID = "main";

    @Autowired
    private SaleDocMapper saleDocMapper;

    @Autowired
    private SaleLineMapper saleLineMapper;

    @Autowired
    private StockMapper stockMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private LedgerMapper ledgerMapper;
    @Autowired
    private CommissionLedgerMapper commissionLedgerMapper;
    @Autowired
    private AccountMapper accountMapper;
    @Autowired
    private com.yeqifu.warehouse.mapper.ReturnDocMapper returnDocMapper;
    @Autowired
    private com.yeqifu.warehouse.mapper.ReturnLineMapper returnLineMapper;
    @Autowired
    private com.yeqifu.warehouse.mapper.StoreMapper storeMapper;

    @Autowired
    private RuntimeModeManager runtimeModeManager;

    private static final java.math.BigDecimal COMMISSION_RATE = new java.math.BigDecimal("0.06");

    @GetMapping("/list")
    public Result<List<SaleDoc>> list(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer limit,
            @RequestParam(required = false) String storeId) {
        try {
            Page<SaleDoc> pageObj = new Page<>(page, limit);
            LambdaQueryWrapper<SaleDoc> qw = new LambdaQueryWrapper<SaleDoc>()
                    .orderByDesc(SaleDoc::getCreatedAt);
            if (storeId != null && !storeId.isEmpty()) {
                qw.eq(SaleDoc::getStoreId, storeId);
            }
            IPage<SaleDoc> result = saleDocMapper.selectPage(pageObj, qw);
            List<SaleDoc> records = result.getRecords();
            java.util.logging.Logger.getLogger("SaleController").info(
                "[sale/list] page=" + page + " limit=" + limit + " total=" + result.getTotal() + " records=" + records.size());
            for (SaleDoc doc : records) {
                try {
                    List<SaleLine> lines = saleLineMapper.selectList(
                        new LambdaQueryWrapper<SaleLine>()
                            .eq(SaleLine::getDocId, doc.getId())
                            .orderByAsc(SaleLine::getLineNo).orderByAsc(SaleLine::getId)
                    );
                    doc.setLines(lines);
                } catch (Exception lineEx) {
                    java.util.logging.Logger.getLogger("SaleController").severe(
                        "[sale/list] ERROR loading lines for doc " + doc.getId() + ": " + lineEx.getMessage());
                    doc.setLines(java.util.Collections.emptyList());
                }
            }
            return Result.ok(records, result.getTotal());
        } catch (Exception e) {
            java.util.logging.Logger.getLogger("SaleController").severe("[sale/list] FATAL: " + e.getMessage() + " | " + e.getClass().getName());
            e.printStackTrace();
            return Result.error("查询失败: " + e.getMessage());
        }
    }

    @GetMapping("/detail/{id}")
    public Result<SaleDoc> detail(@PathVariable String id) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc != null) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, id)
                    .orderByAsc(SaleLine::getLineNo).orderByAsc(SaleLine::getId)
            );
            doc.setLines(lines);
        }
        return Result.ok(doc);
    }

    @PostMapping("/save")
    @Transactional
    public Result<SaleDoc> save(@RequestBody SaleDocVO vo) {
        java.util.logging.Logger log = java.util.logging.Logger.getLogger("SaleController");
        try {
        SaleDoc doc = vo.getDoc();
        log.info("[sale/save] salespersonId=" + (doc != null ? doc.getSalespersonId() : "null") + " storeId=" + (doc != null ? doc.getStoreId() : "null"));
        List<SaleLine> lines = vo.getLines();
        if (lines == null) {
            lines = java.util.Collections.emptyList();
        }
        vo.setLines(lines);

        normalizeLines(lines);

        if (doc.getPaymentType() == null || doc.getPaymentType().isEmpty()) {
            doc.setPaymentType("bill");
        }

        // 计算总数量和总金额
        int totalQty = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (SaleLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            totalQty += qty;
            if (line.getAmount() == null) {
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                line.setAmount(price.multiply(new BigDecimal(qty)));
            }
            totalAmount = totalAmount.add(line.getAmount());
        }
        doc.setTotalQty(totalQty);
        doc.setTotalAmount(totalAmount);

        if (doc.getId() == null || doc.getId().isEmpty()) {
            doc.setId(IdUtils.randomId());
            doc.setCode(generateSaleCode(doc));
            saleDocMapper.insert(doc);
        } else {
            SaleDoc existingDoc = saleDocMapper.selectById(doc.getId());
            if ((doc.getCode() == null || doc.getCode().isEmpty()) && existingDoc != null) {
                doc.setCode(existingDoc.getCode() == null || existingDoc.getCode().isEmpty() ? generateSaleCode(doc) : existingDoc.getCode());
            } else if (doc.getCode() == null || doc.getCode().isEmpty()) {
                doc.setCode(generateSaleCode(doc));
            }
            saleDocMapper.updateById(doc);
            // 仅当前端传入了明细时才更新明细，避免仅更新单头字段时意外清空明细
            if (!lines.isEmpty()) {
                saleLineMapper.delete(
                    new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, doc.getId())
                );
            }
        }

        // 保存明细（lines 为空时跳过）
        int lineIdx = 0;
        for (SaleLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
            // 行号：前端传了则保留，否则用录入顺序兜底（打印/重建排序依赖）
            if (line.getLineNo() == null || line.getLineNo() <= 0) {
                line.setLineNo(lineIdx + 1);
            }
            lineIdx++;
            if (line.getAmount() == null) {
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                line.setAmount(price.multiply(new BigDecimal(qty)));
            }
            saleLineMapper.insert(line);
        }

        return Result.ok(doc);
        } catch (Exception e) {
            java.util.logging.Logger.getLogger("SaleController").severe("[sale/save] ERROR: " + e.getMessage() + " | " + e.getClass().getName());
            e.printStackTrace();
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error("保存失败: " + e.getMessage());
        }
    }

    private String generateSaleCode(SaleDoc doc) {
        Date docDate = doc.getDocDate() == null ? new Date() : doc.getDocDate();
        String datePart = new SimpleDateFormat("yyyy-MM-dd").format(docDate);
        String vehicleNo = resolveVehicleNo(doc.getSalespersonId());
        String prefix = "XS-" + datePart + "-" + vehicleNo + "-";
        // 查出当天同业务员所有单（排除当前单），取编号最大值，避免 count 因删除/作废导致偏差
        List<SaleDoc> existing = saleDocMapper.selectList(
            new LambdaQueryWrapper<SaleDoc>()
                .eq(SaleDoc::getSalespersonId, doc.getSalespersonId())
                .eq(SaleDoc::getDocDate, docDate)
                .likeRight(SaleDoc::getCode, prefix)
                .ne(doc.getId() != null && !doc.getId().isEmpty(), SaleDoc::getId,
                    doc.getId() != null ? doc.getId() : "")
        );
        long maxSeq = 0;
        for (SaleDoc d : existing) {
            String code = d.getCode();
            if (code != null && code.startsWith(prefix)) {
                try {
                    long seq = Long.parseLong(code.substring(prefix.length()));
                    if (seq > maxSeq) maxSeq = seq;
                } catch (NumberFormatException ignored) {}
            }
        }
        return prefix + (maxSeq + 1);
    }

    private String resolveVehicleNo(String salespersonId) {
        if (salespersonId == null || salespersonId.isEmpty()) {
            return "0";
        }
        Account account = accountMapper.selectById(salespersonId);
        if (account == null || account.getDisplayName() == null) {
            return "0";
        }
        switch (account.getDisplayName()) {
            case "大车":
                return "1";
            case "小车":
                return "2";
            case "三车":
                return "3";
            default:
                return "0";
        }
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        try {
            SaleDoc doc = saleDocMapper.selectById(id);
            if (doc == null || !"draft".equals(doc.getStatus())) {
                return Result.error("单据状态异常");
            }
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, id)
            );
            String fromWarehouseId = doc.getWarehouseId() == null || doc.getWarehouseId().isEmpty() ? MAIN_WAREHOUSE_ID : doc.getWarehouseId();
            String stockError = validateSaleStock(fromWarehouseId, lines);
            if (stockError != null) {
                return Result.error(stockError);
            }
            for (SaleLine line : lines) {
                int qty = line.getQty() == null ? 0 : line.getQty();
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                BigDecimal amount = price.multiply(new BigDecimal(qty));

                applyStockDelta(fromWarehouseId, line.getProductId(), -qty);
                insertLedger("sale", id, fromWarehouseId, line.getProductId(), -qty);

                // 赠送单按进价从工资中扣除（相当于业务员自购赠出）
                boolean isGift = "gift".equals(doc.getDocType());
                if (!isGift) {
                    BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP);
                    CommissionLedger ledger = new CommissionLedger();
                    ledger.setId(IdUtils.randomId());
                    ledger.setBizType("sale");
                    ledger.setDocId(id);
                    ledger.setSalespersonId(doc.getSalespersonId());
                    ledger.setStoreId(doc.getStoreId());
                    ledger.setProductId(line.getProductId());
                    ledger.setQty(qty);
                    ledger.setPrice(price);
                    ledger.setAmount(amount);
                    ledger.setCommissionRate(COMMISSION_RATE);
                    ledger.setCommissionAmount(commissionAmount);
                    commissionLedgerMapper.insert(ledger);
                } else {
                    // 赠送：按进价（purchasePrice）从工资中扣除
                    Product product = productMapper.selectById(line.getProductId());
                    BigDecimal purchasePrice = (product != null && product.getPurchasePrice() != null) ? product.getPurchasePrice() : BigDecimal.ZERO;
                    BigDecimal giftDeduction = purchasePrice.multiply(new BigDecimal(qty)).negate();
                    CommissionLedger ledger = new CommissionLedger();
                    ledger.setId(IdUtils.randomId());
                    ledger.setBizType("gift");
                    ledger.setDocId(id);
                    ledger.setSalespersonId(doc.getSalespersonId());
                    ledger.setStoreId(doc.getStoreId());
                    ledger.setProductId(line.getProductId());
                    ledger.setQty(qty);
                    ledger.setPrice(purchasePrice);
                    ledger.setAmount(purchasePrice.multiply(new BigDecimal(qty)));
                    ledger.setCommissionRate(BigDecimal.ZERO);
                    ledger.setCommissionAmount(giftDeduction);
                    commissionLedgerMapper.insert(ledger);
                }
            }
            doc.setStatus("posted");
            if ("cash".equals(doc.getPaymentType())) {
                doc.setSettled(1);
                doc.setSettledAt(new Date());
                doc.setSettledBy(String.valueOf(doc.getSalespersonId()));
            }
            saleDocMapper.updateById(doc);
            return Result.ok();
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/void/{id}")
    @Transactional
    public Result<Void> voidDoc(@PathVariable String id) {
        try {
            SaleDoc doc = saleDocMapper.selectById(id);
            if (doc == null || !"posted".equals(doc.getStatus())) {
                return Result.error("只能作废已过账单据");
            }
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, id)
            );
            String fromWarehouseId = doc.getWarehouseId() == null || doc.getWarehouseId().isEmpty() ? MAIN_WAREHOUSE_ID : doc.getWarehouseId();
            for (SaleLine line : lines) {
                int qty = line.getQty() == null ? 0 : line.getQty();
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                BigDecimal amount = price.multiply(new BigDecimal(qty));

                applyStockDelta(fromWarehouseId, line.getProductId(), qty);
                insertLedger("sale", id, fromWarehouseId, line.getProductId(), qty);

                // 赠送单作废：返还扣除的进价
                boolean isGift = "gift".equals(doc.getDocType());
                if (!isGift) {
                    BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP).negate();
                    CommissionLedger ledger = new CommissionLedger();
                    ledger.setId(IdUtils.randomId());
                    ledger.setBizType("void_sale");
                    ledger.setDocId(id);
                    ledger.setSalespersonId(doc.getSalespersonId());
                    ledger.setStoreId(doc.getStoreId());
                    ledger.setProductId(line.getProductId());
                    ledger.setQty(qty);
                    ledger.setPrice(price);
                    ledger.setAmount(amount);
                    ledger.setCommissionRate(COMMISSION_RATE);
                    ledger.setCommissionAmount(commissionAmount);
                    commissionLedgerMapper.insert(ledger);
                } else {
                    // 赠送单作废：返还按进价扣除的金额（正值）
                    Product product = productMapper.selectById(line.getProductId());
                    BigDecimal purchasePrice = (product != null && product.getPurchasePrice() != null) ? product.getPurchasePrice() : BigDecimal.ZERO;
                    BigDecimal giftRefund = purchasePrice.multiply(new BigDecimal(qty));
                    CommissionLedger ledger = new CommissionLedger();
                    ledger.setId(IdUtils.randomId());
                    ledger.setBizType("void_gift");
                    ledger.setDocId(id);
                    ledger.setSalespersonId(doc.getSalespersonId());
                    ledger.setStoreId(doc.getStoreId());
                    ledger.setProductId(line.getProductId());
                    ledger.setQty(qty);
                    ledger.setPrice(purchasePrice);
                    ledger.setAmount(purchasePrice.multiply(new BigDecimal(qty)));
                    ledger.setCommissionRate(BigDecimal.ZERO);
                    ledger.setCommissionAmount(giftRefund);
                    commissionLedgerMapper.insert(ledger);
                }
            }
            doc.setStatus("voided");
            int updated = saleDocMapper.update(doc,
                new LambdaQueryWrapper<SaleDoc>().eq(SaleDoc::getId, id).eq(SaleDoc::getStatus, "posted"));
            // 必须抛异常：直接 return 会让事务正常提交，而上面已写入的库存流水/提成冲账会被保留，
            // 造成并发双击作废时重复冲账。抛出后由下方 catch 统一 setRollbackOnly 回滚。
            if (updated == 0) throw new RuntimeException("单据状态已变更，请刷新");
            return Result.ok();
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/linkReturn/{id}")
    public Result<Void> linkReturn(@PathVariable String id, @RequestParam String returnDocId) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc == null) {
            return Result.error("销单不存在");
        }
        doc.setReturnDocId(returnDocId);
        saleDocMapper.updateById(doc);
        return Result.ok();
    }

    @PostMapping("/delete/{id}")
    @Transactional
    public Result<Void> delete(@PathVariable String id) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc == null) return Result.error("单据不存在");
        if (!"draft".equals(doc.getStatus())) return Result.error("仅草稿状态可删除");
        saleDocMapper.deleteById(id);
        saleLineMapper.delete(
            new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, id)
        );
        return Result.ok();
    }

    @GetMapping("/unsettled")
    public Result<List<SaleDoc>> unsettled(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer limit) {
        Page<SaleDoc> pageObj = new Page<>(page, limit);
        IPage<SaleDoc> result = saleDocMapper.selectPage(pageObj,
            new LambdaQueryWrapper<SaleDoc>()
                .eq(SaleDoc::getStatus, "posted")
                .and(w -> w.isNull(SaleDoc::getSettled).or().eq(SaleDoc::getSettled, 0))
                .orderByDesc(SaleDoc::getCreatedAt)
        );
        List<SaleDoc> records = result.getRecords();
        for (SaleDoc doc : records) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>()
                    .eq(SaleLine::getDocId, doc.getId())
                    .orderByAsc(SaleLine::getLineNo).orderByAsc(SaleLine::getId)
            );
            doc.setLines(lines);
        }
        return Result.ok(records, result.getTotal());
    }

    @PostMapping("/settle/{id}")
    public Result<Void> settle(@PathVariable String id, javax.servlet.http.HttpSession session) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc == null || !"posted".equals(doc.getStatus())) {
            return Result.error("单据状态异常");
        }
        doc.setSettled(1);
        doc.setSettledAt(new java.util.Date());
        Object operatorId = session.getAttribute("warehouseAccountId");
        doc.setSettledBy(operatorId instanceof String ? (String) operatorId : null);
        saleDocMapper.updateById(doc);
        return Result.ok();
    }

    @PostMapping("/unsettle/{id}")
    public Result<Void> unsettle(@PathVariable String id) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc == null) {
            return Result.error("单据不存在");
        }
        doc.setSettled(0);
        doc.setSettledAt(null);
        doc.setSettledBy(null);
        saleDocMapper.updateById(doc);
        return Result.ok();
    }

    /**
     * 按超市统计净销售袋数（销售袋数 - 退货袋数），首页看板颜色分级用
     * GET /api/sale/storeNetQty 或 GET /api/sale/storeNetQty?startDate=2026-05-01&endDate=2026-05-31
     */
    @GetMapping("/storeNetQty")
    public Result<java.util.Map<String, Integer>> storeNetQty(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        java.sql.Date sqlStart = null;
        java.sql.Date sqlEnd = null;
        if (startDate != null && !startDate.isEmpty() && endDate != null && !endDate.isEmpty()) {
            sqlStart = java.sql.Date.valueOf(java.time.LocalDate.parse(startDate));
            sqlEnd = java.sql.Date.valueOf(java.time.LocalDate.parse(endDate));
        }

        // 销售袋数
        java.util.Map<String, Integer> saleMap = new java.util.HashMap<>();
        LambdaQueryWrapper<SaleDoc> saleQuery = new LambdaQueryWrapper<SaleDoc>()
                .eq(SaleDoc::getStatus, "posted");
        excludeGift(saleQuery);
        if (sqlStart != null) {
            saleQuery.ge(SaleDoc::getDocDate, sqlStart).le(SaleDoc::getDocDate, sqlEnd);
        }
        List<SaleDoc> saleDocs = saleDocMapper.selectList(saleQuery);
        for (SaleDoc doc : saleDocs) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, doc.getId()));
            int qty = lines.stream().mapToInt(l -> l.getQty() == null ? 0 : l.getQty()).sum();
            String sid = doc.getStoreId() != null ? doc.getStoreId() : "";
            saleMap.put(sid, saleMap.getOrDefault(sid, 0) + qty);
        }

        // 退货袋数（vehicle_return，按超市扣除）
        java.util.Map<String, Integer> returnMap = new java.util.HashMap<>();
        if (returnDocMapper != null) {
            LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnDoc> retQuery =
                new LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnDoc>()
                    .eq(com.yeqifu.warehouse.entity.ReturnDoc::getStatus, "posted")
                    .eq(com.yeqifu.warehouse.entity.ReturnDoc::getReturnType, "vehicle_return");
            if (sqlStart != null) {
                retQuery.ge(com.yeqifu.warehouse.entity.ReturnDoc::getDocDate, sqlStart)
                        .le(com.yeqifu.warehouse.entity.ReturnDoc::getDocDate, sqlEnd);
            }
            java.util.List<com.yeqifu.warehouse.entity.ReturnDoc> rets = returnDocMapper.selectList(retQuery);
            for (com.yeqifu.warehouse.entity.ReturnDoc ret : rets) {
                String sid = ret.getStoreId() != null ? ret.getStoreId() : "";
                java.util.List<com.yeqifu.warehouse.entity.ReturnLine> retLines = returnLineMapper.selectList(
                    new LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnLine>()
                        .eq(com.yeqifu.warehouse.entity.ReturnLine::getDocId, ret.getId()));
                int qty = retLines.stream().mapToInt(l -> l.getQty() == null ? 0 : l.getQty()).sum();
                returnMap.put(sid, returnMap.getOrDefault(sid, 0) + qty);
            }
        }

        // 净销售袋数 = 销售 - 退货
        java.util.Map<String, Integer> result = new java.util.HashMap<>();
        for (String sid : saleMap.keySet()) {
            int net = saleMap.getOrDefault(sid, 0) - returnMap.getOrDefault(sid, 0);
            result.put(sid, Math.max(0, net));
        }
        return Result.ok(result);
    }

    @GetMapping("/storeSaleQty")
    public Result<java.util.Map<String, Integer>> storeSaleQty(@RequestParam(defaultValue = "30") Integer days) {
        java.time.LocalDate start = java.time.LocalDate.now().minusDays(days);
        LambdaQueryWrapper<SaleDoc> qw = new LambdaQueryWrapper<SaleDoc>()
                .eq(SaleDoc::getStatus, "posted")
                .ge(SaleDoc::getDocDate, java.sql.Date.valueOf(start));
        excludeGift(qw); // 原为 eq(docType,'sale')，会漏掉 docType 为 NULL 的历史单
        List<SaleDoc> docs = saleDocMapper.selectList(qw);
        java.util.Map<String, Integer> map = new java.util.HashMap<>();
        for (SaleDoc doc : docs) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>()
                    .eq(SaleLine::getDocId, doc.getId())
                    .orderByAsc(SaleLine::getLineNo).orderByAsc(SaleLine::getId)
            );
            int sum = 0;
            for (SaleLine line : lines) sum += line.getQty() == null ? 0 : line.getQty();
            map.put(doc.getStoreId(), map.getOrDefault(doc.getStoreId(), 0) + sum);
        }
        return Result.ok(map);
    }

    /**
     * 按超市统计区间内净销售额（销售额 - 退货额），前端超市流水排行用
     * GET /api/sale/storeRangeSummary?startDate=2026-01-01&endDate=2026-05-31
     */
    @GetMapping("/storeRangeSummary")
    public Result<java.util.List<java.util.Map<String, Object>>> storeRangeSummary(
            @RequestParam String startDate,
            @RequestParam String endDate) {
        java.time.LocalDate start = java.time.LocalDate.parse(startDate);
        java.time.LocalDate end = java.time.LocalDate.parse(endDate);
        java.sql.Date sqlStart = java.sql.Date.valueOf(start);
        java.sql.Date sqlEnd = java.sql.Date.valueOf(end);

        // 1. 查区间内所有已过账销单（排除赠送单，口径与 storeSaleQty 一致）
        LambdaQueryWrapper<SaleDoc> summaryQw = new LambdaQueryWrapper<SaleDoc>()
                .eq(SaleDoc::getStatus, "posted")
                .ge(SaleDoc::getDocDate, sqlStart)
                .le(SaleDoc::getDocDate, sqlEnd);
        excludeGift(summaryQw);
        java.util.List<SaleDoc> saleDocs = saleDocMapper.selectList(summaryQw);

        // 按超市聚合销售额
        java.util.Map<String, java.math.BigDecimal> saleMap = new java.util.LinkedHashMap<>();
        java.util.Map<String, Integer> saleDocCountMap = new java.util.LinkedHashMap<>();
        for (SaleDoc doc : saleDocs) {
            String sid = doc.getStoreId() != null ? doc.getStoreId() : "";
            java.math.BigDecimal amt = doc.getTotalAmount() != null ? doc.getTotalAmount() : java.math.BigDecimal.ZERO;
            saleMap.put(sid, saleMap.getOrDefault(sid, java.math.BigDecimal.ZERO).add(amt));
            saleDocCountMap.put(sid, saleDocCountMap.getOrDefault(sid, 0) + 1);
        }

        // 2. 查区间内所有已过账退单（vehicle_return，按超市扣除）
        java.util.Map<String, java.math.BigDecimal> returnMap = new java.util.LinkedHashMap<>();
        if (returnDocMapper != null) {
            java.util.List<com.yeqifu.warehouse.entity.ReturnDoc> rets = returnDocMapper.selectList(
                new LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnDoc>()
                    .eq(com.yeqifu.warehouse.entity.ReturnDoc::getStatus, "posted")
                    .eq(com.yeqifu.warehouse.entity.ReturnDoc::getReturnType, "vehicle_return")
                    .ge(com.yeqifu.warehouse.entity.ReturnDoc::getDocDate, sqlStart)
                    .le(com.yeqifu.warehouse.entity.ReturnDoc::getDocDate, sqlEnd)
            );
            for (com.yeqifu.warehouse.entity.ReturnDoc ret : rets) {
                String sid = ret.getStoreId() != null ? ret.getStoreId() : "";
                java.math.BigDecimal amt = ret.getTotalAmount() != null ? ret.getTotalAmount() : java.math.BigDecimal.ZERO;
                returnMap.put(sid, returnMap.getOrDefault(sid, java.math.BigDecimal.ZERO).add(amt));
            }
        }

        // 查超市名称
        java.util.Set<String> storeIds = new java.util.LinkedHashSet<>(saleMap.keySet());
        java.util.Map<String, String> storeNameMap = new java.util.LinkedHashMap<>();
        if (!storeIds.isEmpty()) {
            com.yeqifu.warehouse.mapper.StoreMapper sm = storeMapper;
            if (sm != null) {
                for (com.yeqifu.warehouse.entity.Store s : sm.selectBatchIds(storeIds)) {
                    storeNameMap.put(s.getId(), s.getName());
                }
            }
        }

        // 组装结果，按净销售额倒序
        java.util.List<java.util.Map<String, Object>> result = new java.util.ArrayList<>();
        for (String sid : saleMap.keySet()) {
            java.math.BigDecimal saleAmt = saleMap.getOrDefault(sid, java.math.BigDecimal.ZERO);
            java.math.BigDecimal retAmt = returnMap.getOrDefault(sid, java.math.BigDecimal.ZERO);
            java.math.BigDecimal netAmt = saleAmt.subtract(retAmt);
            java.util.Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("storeId", sid);
            row.put("storeName", storeNameMap.getOrDefault(sid, sid.isEmpty() ? "未知门店" : sid));
            row.put("saleAmount", saleAmt);
            row.put("returnAmount", retAmt);
            row.put("netAmount", netAmt);
            row.put("saleDocCount", saleDocCountMap.getOrDefault(sid, 0));
            result.add(row);
        }
        result.sort((a, b) -> ((java.math.BigDecimal) b.get("netAmount")).compareTo((java.math.BigDecimal) a.get("netAmount")));
        return Result.ok(result);
    }

    @GetMapping("/productSaleQty")
    public Result<java.util.Map<String, Integer>> productSaleQty(@RequestParam(defaultValue = "30") Integer days) {
        java.time.LocalDate start = java.time.LocalDate.now().minusDays(days);
        LambdaQueryWrapper<SaleDoc> pQw = new LambdaQueryWrapper<SaleDoc>()
                .eq(SaleDoc::getStatus, "posted")
                .ge(SaleDoc::getDocDate, java.sql.Date.valueOf(start));
        excludeGift(pQw); // 赠送不计入销量排序
        List<SaleDoc> docs = saleDocMapper.selectList(pQw);
        java.util.Map<String, Integer> map = new java.util.HashMap<>();
        for (SaleDoc doc : docs) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>()
                    .eq(SaleLine::getDocId, doc.getId())
                    .orderByAsc(SaleLine::getLineNo).orderByAsc(SaleLine::getId)
            );
            for (SaleLine line : lines) {
                int qty = line.getQty() == null ? 0 : line.getQty();
                map.put(line.getProductId(), map.getOrDefault(line.getProductId(), 0) + qty);
            }
        }
        return Result.ok(map);
    }

    /**
     * 单商品进退统计：某商品在区间内累计销售袋数、退货袋数（分车库退/回仓退）、净销售
     * GET /api/sale/productStat?productId=X[&startDate=&endDate=]
     * 不传日期则统计全部历史。排除赠送单(docType=gift)的销售数，赠送数单独返回。
     */
    @GetMapping("/productStat")
    public Result<java.util.Map<String, Object>> productStat(
            @RequestParam String productId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        java.sql.Date sqlStart = null, sqlEnd = null;
        if (startDate != null && !startDate.isEmpty() && endDate != null && !endDate.isEmpty()) {
            sqlStart = java.sql.Date.valueOf(java.time.LocalDate.parse(startDate));
            sqlEnd = java.sql.Date.valueOf(java.time.LocalDate.parse(endDate));
        }

        // 1) 销售单（已过账），按 docId 分组区分赠送
        LambdaQueryWrapper<SaleDoc> saleQ = new LambdaQueryWrapper<SaleDoc>()
                .eq(SaleDoc::getStatus, "posted");
        if (sqlStart != null) saleQ.ge(SaleDoc::getDocDate, sqlStart).le(SaleDoc::getDocDate, sqlEnd);
        List<SaleDoc> saleDocs = saleDocMapper.selectList(saleQ);
        java.util.Map<String, String> docTypeMap = new java.util.HashMap<>();
        java.util.List<String> saleDocIds = new java.util.ArrayList<>();
        for (SaleDoc d : saleDocs) { saleDocIds.add(d.getId()); docTypeMap.put(d.getId(), d.getDocType()); }

        int saleQty = 0, giftQty = 0;
        java.math.BigDecimal saleAmount = java.math.BigDecimal.ZERO;
        if (!saleDocIds.isEmpty()) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>()
                    .in(SaleLine::getDocId, saleDocIds)
                    .eq(SaleLine::getProductId, productId));
            for (SaleLine l : lines) {
                int q = l.getQty() == null ? 0 : l.getQty();
                java.math.BigDecimal amt = l.getAmount() == null ? java.math.BigDecimal.ZERO : l.getAmount();
                if ("gift".equals(docTypeMap.get(l.getDocId()))) {
                    giftQty += q;
                } else {
                    saleQty += q;
                    saleAmount = saleAmount.add(amt);
                }
            }
        }

        // 2) 退货单（已过账），分车库退/回仓退
        LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnDoc> retQ =
            new LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnDoc>()
                .eq(com.yeqifu.warehouse.entity.ReturnDoc::getStatus, "posted");
        if (sqlStart != null) retQ.ge(com.yeqifu.warehouse.entity.ReturnDoc::getDocDate, sqlStart)
                                 .le(com.yeqifu.warehouse.entity.ReturnDoc::getDocDate, sqlEnd);
        List<com.yeqifu.warehouse.entity.ReturnDoc> retDocs = returnDocMapper.selectList(retQ);
        java.util.Map<String, String> retTypeMap = new java.util.HashMap<>();
        java.util.List<String> retDocIds = new java.util.ArrayList<>();
        for (com.yeqifu.warehouse.entity.ReturnDoc d : retDocs) {
            retDocIds.add(d.getId()); retTypeMap.put(d.getId(), d.getReturnType());
        }

        int vehicleReturnQty = 0, warehouseReturnQty = 0;
        java.math.BigDecimal returnAmount = java.math.BigDecimal.ZERO;
        if (!retDocIds.isEmpty()) {
            List<com.yeqifu.warehouse.entity.ReturnLine> rlines = returnLineMapper.selectList(
                new LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnLine>()
                    .in(com.yeqifu.warehouse.entity.ReturnLine::getDocId, retDocIds)
                    .eq(com.yeqifu.warehouse.entity.ReturnLine::getProductId, productId));
            for (com.yeqifu.warehouse.entity.ReturnLine l : rlines) {
                int q = l.getQty() == null ? 0 : l.getQty();
                java.math.BigDecimal amt = l.getAmount() == null ? java.math.BigDecimal.ZERO : l.getAmount();
                returnAmount = returnAmount.add(amt);
                if ("warehouse_return".equals(retTypeMap.get(l.getDocId()))) warehouseReturnQty += q;
                else vehicleReturnQty += q;
            }
        }

        java.util.Map<String, Object> res = new java.util.HashMap<>();
        res.put("saleQty", saleQty);
        res.put("giftQty", giftQty);
        res.put("saleAmount", saleAmount);
        res.put("vehicleReturnQty", vehicleReturnQty);
        res.put("warehouseReturnQty", warehouseReturnQty);
        res.put("returnQty", vehicleReturnQty + warehouseReturnQty);
        res.put("returnAmount", returnAmount);
        // 净销售 = 销售 - 超市退货。
        // 超市退回车上的货会再卖给别家，销售额被重复计入，减掉车库退货正好抵消这部分转手，
        // 得到「超市最终留下的数量」——等价于「出库量 - 回仓量」（车上还没卖的除外）。
        // 回仓退货不能再减：那批货从来没算进销售，减了等于扣了没加过的数。
        res.put("netQty", saleQty - vehicleReturnQty);
        return Result.ok(res);
    }

    /**
     * 统计口径统一：排除赠送单。
     * 兼容历史数据——docType 为 NULL 的老单据视为普通销售单，不会被漏统计。
     */
    private static void excludeGift(LambdaQueryWrapper<SaleDoc> wrapper) {
        wrapper.and(w -> w.isNull(SaleDoc::getDocType).or().ne(SaleDoc::getDocType, "gift"));
    }

    private void normalizeLines(List<SaleLine> lines) {
        for (SaleLine line : lines) {
            if (line.getBoxQty() == null || line.getBoxQty() < 0) {
                line.setBoxQty(0);
            }
            if (line.getQty() == null || line.getQty() < 0) {
                line.setQty(0);
            }
        }
    }

    private String validateSaleStock(String warehouseId, List<SaleLine> lines) {
        if (runtimeModeManager.useUnlimitedInventory(warehouseId)) {
            return null;
        }
        java.util.Map<String, Integer> requiredQtyMap = new java.util.HashMap<>();
        for (SaleLine line : lines) {
            if (line.getProductId() == null || line.getProductId().isEmpty()) {
                continue;
            }
            int qty = line.getQty() == null ? 0 : line.getQty();
            requiredQtyMap.put(line.getProductId(), requiredQtyMap.getOrDefault(line.getProductId(), 0) + qty);
        }
        for (java.util.Map.Entry<String, Integer> entry : requiredQtyMap.entrySet()) {
            String productId = entry.getKey();
            int requiredQty = entry.getValue();
            LambdaQueryWrapper<Stock> qw = new LambdaQueryWrapper<Stock>()
                .eq(Stock::getWarehouseId, warehouseId)
                .eq(Stock::getProductId, productId);
            Stock stock = stockMapper.selectOne(qw);
            int currentQty = stock == null || stock.getQty() == null ? 0 : stock.getQty();
            if (currentQty >= requiredQty) {
                continue;
            }
            Product product = productMapper.selectById(productId);
            String productName = product == null || product.getName() == null || product.getName().isEmpty()
                ? productId
                : product.getName();
            return productName + "库存不足，车库现有" + currentQty + "袋，销单需要" + requiredQty + "袋";
        }
        return null;
    }

    private void applyStockDelta(String warehouseId, String productId, Integer delta) {
        if (runtimeModeManager.useUnlimitedInventory(warehouseId)) {
            return;
        }
        LambdaQueryWrapper<Stock> qw = new LambdaQueryWrapper<Stock>()
            .eq(Stock::getWarehouseId, warehouseId)
            .eq(Stock::getProductId, productId);
        Stock stock = stockMapper.selectOne(qw);
        int cur = stock == null || stock.getQty() == null ? 0 : stock.getQty();
        int next = cur + (delta == null ? 0 : delta);
        if (next < 0) throw new RuntimeException("库存不足");
        if (stock == null) {
            Stock s = new Stock();
            s.setWarehouseId(warehouseId);
            s.setProductId(productId);
            s.setQty(next);
            stockMapper.insert(s);
        } else {
            stock.setQty(next);
            stockMapper.update(stock, qw);
        }
    }

    private void insertLedger(String bizType, String docId, String warehouseId, String productId, Integer qty) {
        Ledger ledger = new Ledger();
        ledger.setId(IdUtils.randomId());
        ledger.setBizType(bizType);
        ledger.setDocId(docId);
        ledger.setWarehouseId(warehouseId);
        ledger.setProductId(productId);
        ledger.setQty(qty);
        ledgerMapper.insert(ledger);
    }

    // 内部VO类
    @lombok.Data
    public static class SaleDocVO {
        private SaleDoc doc;
        private List<SaleLine> lines;
    }
}
