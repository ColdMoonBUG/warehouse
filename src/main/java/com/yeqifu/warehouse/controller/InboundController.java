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

@RestController
@RequestMapping("/api/inbound")
@CrossOrigin
public class InboundController {

    private static final String MAIN_WAREHOUSE_ID = "main";

    @Autowired
    private InboundDocMapper inboundDocMapper;
    @Autowired
    private InboundLineMapper inboundLineMapper;
    @Autowired
    private StockMapper stockMapper;
    @Autowired
    private LedgerMapper ledgerMapper;

    @GetMapping("/list")
    public Result<List<InboundDoc>> list() {
        List<InboundDoc> docs = inboundDocMapper.selectList(new LambdaQueryWrapper<InboundDoc>().orderByDesc(InboundDoc::getCreatedAt));
        for (InboundDoc doc : docs) {
            List<InboundLine> lines = inboundLineMapper.selectList(new LambdaQueryWrapper<InboundLine>().eq(InboundLine::getDocId, doc.getId()));
            doc.setLines(lines);
        }
        return Result.ok(docs);
    }

    @GetMapping("/detail/{id}")
    public Result<InboundDoc> detail(@PathVariable String id) {
        InboundDoc doc = inboundDocMapper.selectById(id);
        if (doc != null) {
            List<InboundLine> lines = inboundLineMapper.selectList(new LambdaQueryWrapper<InboundLine>().eq(InboundLine::getDocId, id));
            doc.setLines(lines);
        }
        return Result.ok(doc);
    }

    @PostMapping("/save")
    @Transactional
    public Result<InboundDoc> save(@RequestBody InboundDocVO vo) {
        InboundDoc doc = vo.getDoc();
        List<InboundLine> lines = vo.getLines();
        if (lines == null) {
            lines = java.util.Collections.emptyList();
        }
        vo.setLines(lines);
        normalizeLines(lines);
        if (doc.getStatus() == null || doc.getStatus().isEmpty()) doc.setStatus("draft");
        if (doc.getDocDate() == null) doc.setDocDate(new Date());

        if (doc.getId() == null || doc.getId().isEmpty()) {
            doc.setId(IdUtils.randomId());
            doc.setCode(IdUtils.genCode("IN"));
            inboundDocMapper.insert(doc);
        } else {
            inboundDocMapper.updateById(doc);
            inboundLineMapper.delete(new LambdaQueryWrapper<InboundLine>().eq(InboundLine::getDocId, doc.getId()));
        }
        for (InboundLine line : lines) {
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
            BigDecimal amount = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice().multiply(new BigDecimal(line.getQty() == null ? 0 : line.getQty()));
            line.setAmount(amount);
            inboundLineMapper.insert(line);
        }
        return Result.ok(doc);
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        try {
            InboundDoc doc = inboundDocMapper.selectById(id);
            if (doc == null || !"draft".equals(doc.getStatus())) {
                return Result.error("单据状态异常");
            }
            List<InboundLine> lines = inboundLineMapper.selectList(new LambdaQueryWrapper<InboundLine>().eq(InboundLine::getDocId, id));
            for (InboundLine line : lines) {
                applyStockDelta(MAIN_WAREHOUSE_ID, line.getProductId(), line.getQty());
                insertLedger("inbound", id, MAIN_WAREHOUSE_ID, line.getProductId(), line.getQty());
            }
            doc.setStatus("posted");
            inboundDocMapper.updateById(doc);
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
            InboundDoc doc = inboundDocMapper.selectById(id);
            if (doc == null || !"posted".equals(doc.getStatus())) {
                return Result.error("只能作废已过账单据");
            }
            List<InboundLine> lines = inboundLineMapper.selectList(new LambdaQueryWrapper<InboundLine>().eq(InboundLine::getDocId, id));
            for (InboundLine line : lines) {
                applyStockDelta(MAIN_WAREHOUSE_ID, line.getProductId(), -line.getQty());
                insertLedger("inbound", id, MAIN_WAREHOUSE_ID, line.getProductId(), -line.getQty());
            }
            doc.setStatus("voided");
            inboundDocMapper.updateById(doc);
            return Result.ok();
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    private void normalizeLines(List<InboundLine> lines) {
        for (InboundLine line : lines) {
            if (line.getBoxQty() == null || line.getBoxQty() < 0) {
                line.setBoxQty(0);
            }
            if (line.getQty() == null || line.getQty() < 0) {
                line.setQty(0);
            }
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
    public static class InboundDocVO {
        private InboundDoc doc;
        private List<InboundLine> lines;
    }
}
