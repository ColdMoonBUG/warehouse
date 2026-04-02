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

import java.util.Date;
import java.util.List;

@RestController
@RequestMapping("/api/transfer")
@CrossOrigin
public class TransferController {

    @Autowired
    private TransferDocMapper transferDocMapper;
    @Autowired
    private TransferLineMapper transferLineMapper;
    @Autowired
    private StockMapper stockMapper;
    @Autowired
    private LedgerMapper ledgerMapper;

    @GetMapping("/list")
    public Result<List<TransferDoc>> list() {
        List<TransferDoc> docs = transferDocMapper.selectList(new LambdaQueryWrapper<TransferDoc>().orderByDesc(TransferDoc::getCreatedAt));
        for (TransferDoc doc : docs) {
            List<TransferLine> lines = transferLineMapper.selectList(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, doc.getId()));
            doc.setLines(lines);
        }
        return Result.ok(docs);
    }

    @GetMapping("/detail/{id}")
    public Result<TransferDoc> detail(@PathVariable String id) {
        TransferDoc doc = transferDocMapper.selectById(id);
        if (doc != null) {
            List<TransferLine> lines = transferLineMapper.selectList(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, id));
            doc.setLines(lines);
        }
        return Result.ok(doc);
    }

    @PostMapping("/save")
    @Transactional
    public Result<TransferDoc> save(@RequestBody TransferDocVO vo) {
        TransferDoc doc = vo.getDoc();
        List<TransferLine> lines = vo.getLines();
        if (lines == null) {
            lines = java.util.Collections.emptyList();
        }
        vo.setLines(lines);
        normalizeLines(lines);
        if (doc.getStatus() == null || doc.getStatus().isEmpty()) doc.setStatus("draft");
        if (doc.getDocDate() == null) doc.setDocDate(new Date());

        if (doc.getId() == null || doc.getId().isEmpty()) {
            doc.setId(IdUtils.randomId());
            doc.setCode(IdUtils.genCode("TR"));
            transferDocMapper.insert(doc);
        } else {
            transferDocMapper.updateById(doc);
            transferLineMapper.delete(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, doc.getId()));
        }
        for (TransferLine line : lines) {
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
            transferLineMapper.insert(line);
        }
        return Result.ok(doc);
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        try {
            TransferDoc doc = transferDocMapper.selectById(id);
            if (doc == null || !"draft".equals(doc.getStatus())) {
                return Result.error("单据状态异常");
            }
            List<TransferLine> lines = transferLineMapper.selectList(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, id));
            for (TransferLine line : lines) {
                applyStockDelta(doc.getFromWarehouseId(), line.getProductId(), -line.getQty());
                applyStockDelta(doc.getToWarehouseId(), line.getProductId(), line.getQty());
                insertLedger("transfer", id, doc.getFromWarehouseId(), line.getProductId(), -line.getQty());
                insertLedger("transfer", id, doc.getToWarehouseId(), line.getProductId(), line.getQty());
            }
            doc.setStatus("posted");
            transferDocMapper.updateById(doc);
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
            TransferDoc doc = transferDocMapper.selectById(id);
            if (doc == null || !"posted".equals(doc.getStatus())) {
                return Result.error("只能作废已过账单据");
            }
            List<TransferLine> lines = transferLineMapper.selectList(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, id));
            for (TransferLine line : lines) {
                applyStockDelta(doc.getFromWarehouseId(), line.getProductId(), line.getQty());
                applyStockDelta(doc.getToWarehouseId(), line.getProductId(), -line.getQty());
                insertLedger("transfer", id, doc.getFromWarehouseId(), line.getProductId(), line.getQty());
                insertLedger("transfer", id, doc.getToWarehouseId(), line.getProductId(), -line.getQty());
            }
            doc.setStatus("voided");
            transferDocMapper.updateById(doc);
            return Result.ok();
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    private void normalizeLines(List<TransferLine> lines) {
        for (TransferLine line : lines) {
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
    public static class TransferDocVO {
        private TransferDoc doc;
        private List<TransferLine> lines;
    }
}
