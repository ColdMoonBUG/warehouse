package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.common.RuntimeModeManager;
import com.yeqifu.warehouse.entity.*;
import com.yeqifu.warehouse.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Date;
import java.util.List;
import com.yeqifu.warehouse.entity.CommissionLedger;
import com.yeqifu.warehouse.mapper.CommissionLedgerMapper;
import java.math.RoundingMode;

@RestController
@RequestMapping("/api/return")
public class ReturnController {

    private static final String MAIN_WAREHOUSE_ID = "main";
    private static final String RETURN_WAREHOUSE_ID = "return";

    @Autowired
    private ReturnDocMapper returnDocMapper;
    @Autowired
    private ReturnLineMapper returnLineMapper;
    @Autowired
    private StockMapper stockMapper;
    @Autowired
    private LedgerMapper ledgerMapper;
    @Autowired
    private CommissionLedgerMapper commissionLedgerMapper;

    @Autowired
    private com.yeqifu.warehouse.mapper.AccountMapper accountMapper;

    @Autowired
    private RuntimeModeManager runtimeModeManager;

    private static final java.math.BigDecimal COMMISSION_RATE = new java.math.BigDecimal("0.06");

    @GetMapping("/list")
    public Result<List<ReturnDoc>> list(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer limit) {
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<ReturnDoc> pageObj =
            new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(page, limit);
        com.baomidou.mybatisplus.core.metadata.IPage<ReturnDoc> result =
            returnDocMapper.selectPage(pageObj, new LambdaQueryWrapper<ReturnDoc>().orderByDesc(ReturnDoc::getCreatedAt));
        List<ReturnDoc> docs = result.getRecords();
        if (!docs.isEmpty()) {
            java.util.Set<String> docIds = docs.stream().map(ReturnDoc::getId).collect(java.util.stream.Collectors.toSet());
            List<ReturnLine> allLines = returnLineMapper.selectList(
                new LambdaQueryWrapper<ReturnLine>().in(ReturnLine::getDocId, docIds)
                    .orderByAsc(ReturnLine::getLineNo).orderByAsc(ReturnLine::getId));
            java.util.Map<String, List<ReturnLine>> lineMap = allLines.stream()
                .collect(java.util.stream.Collectors.groupingBy(ReturnLine::getDocId));
            for (ReturnDoc doc : docs) {
                doc.setLines(lineMap.getOrDefault(doc.getId(), java.util.Collections.emptyList()));
            }
        }
        return Result.ok(docs, result.getTotal());
    }

    @GetMapping("/detail/{id}")
    public Result<ReturnDoc> detail(@PathVariable String id) {
        ReturnDoc doc = returnDocMapper.selectById(id);
        if (doc != null) {
            List<ReturnLine> lines = returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, id).orderByAsc(ReturnLine::getLineNo).orderByAsc(ReturnLine::getId));
            doc.setLines(lines);
        }
        return Result.ok(doc);
    }

    @PostMapping("/save")
    @Transactional
    public Result<ReturnDoc> save(@RequestBody ReturnDocVO vo) {
        ReturnDoc doc = vo.getDoc();
        List<ReturnLine> lines = vo.getLines();
        if (lines == null) {
            lines = java.util.Collections.emptyList();
        }
        vo.setLines(lines);
        normalizeLines(lines);
        if (doc.getStatus() == null || doc.getStatus().isEmpty()) doc.setStatus("draft");
        if (doc.getDocDate() == null) doc.setDocDate(new Date());
        if (doc.getReturnType() == null || doc.getReturnType().isEmpty()) doc.setReturnType("vehicle_return");
        if (doc.getFromWarehouseId() == null || doc.getFromWarehouseId().isEmpty()) {
            doc.setFromWarehouseId(MAIN_WAREHOUSE_ID);
        }

        int totalQty = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (ReturnLine line : lines) {
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
            doc.setCode(generateReturnCode(doc));
            returnDocMapper.insert(doc);
        } else {
            returnDocMapper.updateById(doc);
            // 仅当前端传入了明细时才更新明细，避免只更新单头时意外清空明细
            if (!lines.isEmpty()) {
                returnLineMapper.delete(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, doc.getId()));
            }
        }
        int lineIdx = 0;
        for (ReturnLine line : lines) {
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
            returnLineMapper.insert(line);
        }
        return Result.ok(doc);
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        try {
            ReturnDoc doc = returnDocMapper.selectById(id);
            if (doc == null || !"draft".equals(doc.getStatus())) {
                return Result.error("单据状态异常");
            }
            List<ReturnLine> lines = returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, id).orderByAsc(ReturnLine::getLineNo).orderByAsc(ReturnLine::getId));
            String fromWarehouseId = doc.getFromWarehouseId() == null || doc.getFromWarehouseId().isEmpty() ? MAIN_WAREHOUSE_ID : doc.getFromWarehouseId();
            String toWarehouseId = doc.getToWarehouseId() == null || doc.getToWarehouseId().isEmpty() ? RETURN_WAREHOUSE_ID : doc.getToWarehouseId();
            for (ReturnLine line : lines) {
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                int qty = line.getQty() == null ? 0 : line.getQty();
                BigDecimal amount = price.multiply(new BigDecimal(qty));
                if ("warehouse_return".equals(doc.getReturnType())) {
                    // 车库退回主仓/退货仓
                    applyStockDelta(fromWarehouseId, line.getProductId(), -qty);
                    applyStockDelta(toWarehouseId, line.getProductId(), qty);
                    insertLedger("return_warehouse", id, fromWarehouseId, line.getProductId(), -qty);
                    insertLedger("return_warehouse", id, toWarehouseId, line.getProductId(), qty);
                } else {
                    // 默认车库退货
                    applyStockDelta(fromWarehouseId, line.getProductId(), qty);
                    insertLedger("return_vehicle", id, fromWarehouseId, line.getProductId(), qty);
                }

                // 超市退货（vehicle_return）扣提成；退货回仓（warehouse_return）是仓管操作，不扣
                if (!"warehouse_return".equals(doc.getReturnType())) {
                    BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP).negate();
                    CommissionLedger ledger = new CommissionLedger();
                    ledger.setId(IdUtils.randomId());
                    ledger.setBizType("return");
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
                }
            }
            doc.setStatus("posted");
            returnDocMapper.updateById(doc);
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
            ReturnDoc doc = returnDocMapper.selectById(id);
            if (doc == null || !"posted".equals(doc.getStatus())) {
                return Result.error("只能作废已过账单据");
            }
            List<ReturnLine> lines = returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, id).orderByAsc(ReturnLine::getLineNo).orderByAsc(ReturnLine::getId));
            String fromWarehouseId = doc.getFromWarehouseId() == null || doc.getFromWarehouseId().isEmpty() ? MAIN_WAREHOUSE_ID : doc.getFromWarehouseId();
            String toWarehouseId = doc.getToWarehouseId() == null || doc.getToWarehouseId().isEmpty() ? RETURN_WAREHOUSE_ID : doc.getToWarehouseId();
            for (ReturnLine line : lines) {
                int qty = line.getQty() == null ? 0 : line.getQty();
                if ("warehouse_return".equals(doc.getReturnType())) {
                    applyStockDelta(fromWarehouseId, line.getProductId(), qty);
                    applyStockDelta(toWarehouseId, line.getProductId(), -qty);
                    insertLedger("return_warehouse", id, fromWarehouseId, line.getProductId(), qty);
                    insertLedger("return_warehouse", id, toWarehouseId, line.getProductId(), -qty);
                } else {
                    applyStockDelta(fromWarehouseId, line.getProductId(), -qty);
                    insertLedger("return_vehicle", id, fromWarehouseId, line.getProductId(), -qty);
                }
            }

            for (ReturnLine line : lines) {
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                int qty = line.getQty() == null ? 0 : line.getQty();
                BigDecimal amount = price.multiply(new BigDecimal(qty));
                // 超市退货才有提成流水需要对冲；退货回仓无提成流水
                if (!"warehouse_return".equals(doc.getReturnType())) {
                    BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP);
                    CommissionLedger ledger = new CommissionLedger();
                    ledger.setId(IdUtils.randomId());
                    ledger.setBizType("void_return");
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
                }
            }
            doc.setStatus("voided");
            int updated = returnDocMapper.update(doc,
                new LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnDoc>()
                    .eq(com.yeqifu.warehouse.entity.ReturnDoc::getId, id)
                    .eq(com.yeqifu.warehouse.entity.ReturnDoc::getStatus, "posted"));
            // 必须抛异常：直接 return 会让事务正常提交，而上面已写入的库存流水/提成冲账会被保留，
            // 造成并发双击作废时重复冲账。抛出后由下方 catch 统一 setRollbackOnly 回滚。
            if (updated == 0) throw new RuntimeException("单据状态已变更，请刷新");
            return Result.ok();
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    private String generateReturnCode(com.yeqifu.warehouse.entity.ReturnDoc doc) {
        java.util.Date docDate = doc.getDocDate() == null ? new java.util.Date() : doc.getDocDate();
        String datePart = new java.text.SimpleDateFormat("yyyy-MM-dd").format(docDate);
        String vehicleNo = resolveVehicleNo(doc.getSalespersonId());
        // 车库退货用 th，退货回仓用 tc
        String typeSuffix = "warehouse_return".equals(doc.getReturnType()) ? "tc" : "th";
        String prefix = datePart + "-" + vehicleNo + "-" + typeSuffix + "-";
        java.util.List<com.yeqifu.warehouse.entity.ReturnDoc> existing = returnDocMapper.selectList(
            new LambdaQueryWrapper<com.yeqifu.warehouse.entity.ReturnDoc>()
                .eq(com.yeqifu.warehouse.entity.ReturnDoc::getSalespersonId, doc.getSalespersonId())
                .eq(com.yeqifu.warehouse.entity.ReturnDoc::getDocDate, docDate)
                .likeRight(com.yeqifu.warehouse.entity.ReturnDoc::getCode, prefix)
                .ne(doc.getId() != null && !doc.getId().isEmpty(),
                    com.yeqifu.warehouse.entity.ReturnDoc::getId,
                    doc.getId() != null ? doc.getId() : "")
        );
        long maxSeq = 0;
        for (com.yeqifu.warehouse.entity.ReturnDoc d : existing) {
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
        if (salespersonId == null || salespersonId.isEmpty()) return "0";
        com.yeqifu.warehouse.entity.Account account = accountMapper.selectById(salespersonId);
        if (account == null || account.getDisplayName() == null) return "0";
        switch (account.getDisplayName()) {
            case "大车": return "1";
            case "小车": return "2";
            case "三车": return "3";
            default: return "0";
        }
    }

    private void normalizeLines(List<ReturnLine> lines) {
        for (ReturnLine line : lines) {
            if (line.getBoxQty() == null || line.getBoxQty() < 0) {
                line.setBoxQty(0);
            }
            if (line.getQty() == null || line.getQty() < 0) {
                line.setQty(0);
            }
        }
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

    @lombok.Data
    public static class ReturnDocVO {
        private ReturnDoc doc;
        private List<ReturnLine> lines;
    }
}
