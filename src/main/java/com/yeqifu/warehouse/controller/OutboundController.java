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
@RequestMapping("/api/outbound")
public class OutboundController {

    @Autowired
    private OutboundDocMapper outboundDocMapper;
    @Autowired
    private OutboundLineMapper outboundLineMapper;
    @Autowired
    private StockMapper stockMapper;
    @Autowired
    private LedgerMapper ledgerMapper;

    @GetMapping("/list")
    public Result<List<OutboundDoc>> list() {
        List<OutboundDoc> docs = outboundDocMapper.selectList(new LambdaQueryWrapper<OutboundDoc>().orderByDesc(OutboundDoc::getCreatedAt));
        for (OutboundDoc doc : docs) {
            List<OutboundLine> lines = outboundLineMapper.selectList(new LambdaQueryWrapper<OutboundLine>().eq(OutboundLine::getDocId, doc.getId()));
            doc.setLines(lines);
        }
        return Result.ok(docs);
    }

    @GetMapping("/detail/{id}")
    public Result<OutboundDoc> detail(@PathVariable String id) {
        OutboundDoc doc = outboundDocMapper.selectById(id);
        if (doc != null) {
            List<OutboundLine> lines = outboundLineMapper.selectList(new LambdaQueryWrapper<OutboundLine>().eq(OutboundLine::getDocId, id));
            doc.setLines(lines);
        }
        return Result.ok(doc);
    }

    @PostMapping("/save")
    @Transactional
    public Result<Void> save(@RequestBody OutboundDocVO vo) {
        OutboundDoc doc = vo.getDoc();
        List<OutboundLine> lines = vo.getLines();
        if (lines == null) {
            lines = java.util.Collections.emptyList();
        }
        vo.setLines(lines);
        normalizeLines(lines);
        if (doc.getStatus() == null) doc.setStatus("draft");
        if (doc.getDocDate() == null) doc.setDocDate(new Date());

        int totalQty = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (OutboundLine line : lines) {
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

        if (doc.getId() == null) {
            doc.setId(IdUtils.randomId());
            doc.setCode(IdUtils.genCode("OUT"));
            outboundDocMapper.insert(doc);
        } else {
            outboundDocMapper.updateById(doc);
            outboundLineMapper.delete(new LambdaQueryWrapper<OutboundLine>().eq(OutboundLine::getDocId, doc.getId()));
        }
        for (OutboundLine line : lines) {
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
            if (line.getAmount() == null) {
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                int qty = line.getQty() == null ? 0 : line.getQty();
                line.setAmount(price.multiply(new BigDecimal(qty)));
            }
            outboundLineMapper.insert(line);
        }
        return Result.ok();
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        try {
            OutboundDoc doc = outboundDocMapper.selectById(id);
            if (doc == null || !"draft".equals(doc.getStatus())) {
                return Result.error("单据状态异常");
            }
            List<OutboundLine> lines = outboundLineMapper.selectList(new LambdaQueryWrapper<OutboundLine>().eq(OutboundLine::getDocId, id));
            for (OutboundLine line : lines) {
                applyStockDelta(doc.getWarehouseId(), line.getProductId(), -(line.getQty() == null ? 0 : line.getQty()));
                insertLedger("outbound", id, doc.getWarehouseId(), line.getProductId(), -(line.getQty() == null ? 0 : line.getQty()));
            }
            doc.setStatus("posted");
            outboundDocMapper.updateById(doc);
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
            OutboundDoc doc = outboundDocMapper.selectById(id);
            if (doc == null || !"posted".equals(doc.getStatus())) {
                return Result.error("只能作废已过账单据");
            }
            List<OutboundLine> lines = outboundLineMapper.selectList(new LambdaQueryWrapper<OutboundLine>().eq(OutboundLine::getDocId, id));
            for (OutboundLine line : lines) {
                applyStockDelta(doc.getWarehouseId(), line.getProductId(), line.getQty());
                insertLedger("outbound", id, doc.getWarehouseId(), line.getProductId(), line.getQty());
            }
            doc.setStatus("voided");
            outboundDocMapper.updateById(doc);
            return Result.ok();
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    private void normalizeLines(List<OutboundLine> lines) {
        for (OutboundLine line : lines) {
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
    public static class OutboundDocVO {
        private OutboundDoc doc;
        private List<OutboundLine> lines;
    }
}
