package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.Result;
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
@CrossOrigin
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

    private static final java.math.BigDecimal COMMISSION_RATE = new java.math.BigDecimal("0.06");

    @GetMapping("/list")
    public Result<List<ReturnDoc>> list() {
        List<ReturnDoc> docs = returnDocMapper.selectList(new LambdaQueryWrapper<ReturnDoc>().orderByDesc(ReturnDoc::getCreatedAt));
        for (ReturnDoc doc : docs) {
            List<ReturnLine> lines = returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, doc.getId()));
            doc.setLines(lines);
        }
        return Result.ok(docs);
    }

    @GetMapping("/detail/{id}")
    public Result<ReturnDoc> detail(@PathVariable String id) {
        ReturnDoc doc = returnDocMapper.selectById(id);
        if (doc != null) {
            List<ReturnLine> lines = returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, id));
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
            doc.setCode(IdUtils.genCode("RT"));
            returnDocMapper.insert(doc);
        } else {
            returnDocMapper.updateById(doc);
            returnLineMapper.delete(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, doc.getId()));
        }
        for (ReturnLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
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
            List<ReturnLine> lines = returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, id));
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

                // 退单扣提成（按退货金额 * 6%）
                BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP).negate();
                CommissionLedger ledger = new CommissionLedger();
                ledger.setId(IdUtils.randomId());
                ledger.setBizType("return");
                ledger.setDocId(id);
                ledger.setEmployeeId(doc.getEmployeeId());
                ledger.setStoreId(doc.getStoreId());
                ledger.setProductId(line.getProductId());
                ledger.setQty(qty);
                ledger.setPrice(price);
                ledger.setAmount(amount);
                ledger.setCommissionRate(COMMISSION_RATE);
                ledger.setCommissionAmount(commissionAmount);
                commissionLedgerMapper.insert(ledger);
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
            List<ReturnLine> lines = returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, id));
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
                BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP);
                CommissionLedger ledger = new CommissionLedger();
                ledger.setId(IdUtils.randomId());
                ledger.setBizType("void_return");
                ledger.setDocId(id);
                ledger.setEmployeeId(doc.getEmployeeId());
                ledger.setStoreId(doc.getStoreId());
                ledger.setProductId(line.getProductId());
                ledger.setQty(qty);
                ledger.setPrice(price);
                ledger.setAmount(amount);
                ledger.setCommissionRate(COMMISSION_RATE);
                ledger.setCommissionAmount(commissionAmount);
                commissionLedgerMapper.insert(ledger);
            }
            doc.setStatus("voided");
            returnDocMapper.updateById(doc);
            return Result.ok();
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    private void applyStockDelta(String warehouseId, String productId, Integer delta) {
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
