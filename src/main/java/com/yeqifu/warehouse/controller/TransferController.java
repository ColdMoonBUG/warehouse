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

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/transfer")
public class TransferController {

    @Autowired
    private TransferDocMapper transferDocMapper;
    @Autowired
    private TransferLineMapper transferLineMapper;
    @Autowired
    private StockMapper stockMapper;
    @Autowired
    private LedgerMapper ledgerMapper;

    @Autowired
    private RuntimeModeManager runtimeModeManager;

    @Autowired
    private ProductMapper productMapper;

    @GetMapping("/list")
    public Result<List<TransferDoc>> list() {
        List<TransferDoc> docs = transferDocMapper.selectList(new LambdaQueryWrapper<TransferDoc>().orderByDesc(TransferDoc::getCreatedAt));
        if (!docs.isEmpty()) {
            List<String> allDocIds = docs.stream().map(TransferDoc::getId).collect(Collectors.toList());
            List<TransferLine> allLines = transferLineMapper.selectList(
                new LambdaQueryWrapper<TransferLine>().in(TransferLine::getDocId, allDocIds)
            );
            Map<String, List<TransferLine>> linesByDocId = allLines.stream()
                .collect(Collectors.groupingBy(TransferLine::getDocId));
            for (TransferDoc doc : docs) {
                doc.setLines(linesByDocId.getOrDefault(doc.getId(), Collections.emptyList()));
            }
            batchFillRemainingQty(docs);
        }
        return Result.ok(docs);
    }

    @GetMapping("/detail/{id}")
    public Result<TransferDoc> detail(@PathVariable String id) {
        TransferDoc doc = transferDocMapper.selectById(id);
        if (doc != null) {
            List<TransferLine> lines = transferLineMapper.selectList(
                new LambdaQueryWrapper<TransferLine>()
                    .eq(TransferLine::getDocId, id)
                    .orderByAsc(TransferLine::getId)
            );
            doc.setLines(lines);
            fillDocRemainingQty(doc);
        }
        return Result.ok(doc);
    }

    @PostMapping("/save")
    @Transactional
    public Result<TransferDoc> save(@RequestBody TransferDocVO vo) {
        try {
            TransferDoc doc = vo.getDoc();
            List<TransferLine> lines = vo.getLines();
            boolean linesProvided = lines != null;
            if (lines == null) {
                lines = java.util.Collections.emptyList();
            }
            vo.setLines(lines);
            normalizeLines(lines);
            if (doc.getStatus() == null || doc.getStatus().isEmpty()) doc.setStatus("draft");
            if (doc.getDocDate() == null) doc.setDocDate(new Date());

            TransferDoc existing = null;
            if (doc.getId() != null && !doc.getId().isEmpty()) {
                existing = transferDocMapper.selectById(doc.getId());
            }

            if (doc.getId() == null || doc.getId().isEmpty()) {
                doc.setId(IdUtils.randomId());
            }

            if (existing == null) {
                if (doc.getCode() == null || doc.getCode().isEmpty()) {
                    doc.setCode(generateTransferCode(doc));
                }
                transferDocMapper.insert(doc);
            } else {
                if (doc.getCode() == null || doc.getCode().isEmpty()) {
                    doc.setCode(existing.getCode());
                }
                transferDocMapper.updateById(doc);
            }

            if (linesProvided) {
                transferLineMapper.delete(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, doc.getId()));
            }
            for (int i = 0; i < lines.size(); i++) {
                TransferLine line = lines.get(i);
                // ID 前缀加序号，保证 ORDER BY id 时顺序与前端一致
                line.setId(String.format("%04d", i) + IdUtils.randomId().substring(4));
                line.setDocId(doc.getId());
                transferLineMapper.insert(line);
            }
            return Result.ok(doc);
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        try {
            TransferDoc doc = transferDocMapper.selectById(id);
            if (doc == null || !"draft".equals(doc.getStatus())) {
                return Result.error("单据状态异常");
            }
            if (doc.getFromWarehouseId() != null && doc.getFromWarehouseId().equals(doc.getToWarehouseId())) {
                return Result.error("调出仓库和调入仓库不能相同");
            }
            List<TransferLine> lines = transferLineMapper.selectList(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, id));
            boolean initMode = runtimeModeManager.isInitMode();
            for (TransferLine line : lines) {
                if (!initMode) {
                    // 正常模式：来源仓扣减
                    applyStockDelta(doc.getFromWarehouseId(), line.getProductId(), -line.getQty());
                    insertLedger("transfer", id, doc.getFromWarehouseId(), line.getProductId(), -line.getQty());
                }
                // 两种模式都给目标仓加库存
                applyStockDelta(doc.getToWarehouseId(), line.getProductId(), line.getQty());
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

    private String generateTransferCode(TransferDoc doc) {
        return IdUtils.genCode("TR");
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

    private void batchFillRemainingQty(List<TransferDoc> docs) {
        Map<String, List<TransferDoc>> byWarehouseAndDay = new LinkedHashMap<>();
        for (TransferDoc doc : docs) {
            if (!"posted".equals(doc.getStatus()) || doc.getFromWarehouseId() == null || doc.getDocDate() == null) {
                nullifyRemainingQty(doc);
                continue;
            }
            String key = doc.getFromWarehouseId() + "|" + toLocalDate(doc.getDocDate());
            byWarehouseAndDay.computeIfAbsent(key, k -> new ArrayList<>()).add(doc);
        }

        for (Map.Entry<String, List<TransferDoc>> entry : byWarehouseAndDay.entrySet()) {
            String[] parts = entry.getKey().split("\\|", 2);
            String warehouseId = parts[0];
            LocalDate day = LocalDate.parse(parts[1]);
            List<TransferDoc> group = entry.getValue();

            group.sort(Comparator
                .comparing((TransferDoc d) -> d.getCreatedAt() == null ? new Date(0) : d.getCreatedAt())
                .thenComparing(TransferDoc::getId));

            Set<String> allProductIds = new HashSet<>();
            for (TransferDoc doc : group) {
                if (doc.getLines() != null) {
                    for (TransferLine line : doc.getLines()) {
                        if (line.getProductId() != null && !line.getProductId().isEmpty()) {
                            allProductIds.add(line.getProductId());
                        }
                    }
                }
            }
            if (allProductIds.isEmpty()) continue;

            Map<String, Integer> stockAtDayStart = loadStockAtDayStart(warehouseId, allProductIds, day);

            Map<String, Integer> running = new HashMap<>();
            for (TransferDoc doc : group) {
                if (doc.getLines() == null) continue;
                for (TransferLine line : doc.getLines()) {
                    if (line.getProductId() == null || line.getProductId().isEmpty()) continue;
                    int cur = running.computeIfAbsent(line.getProductId(), pid -> stockAtDayStart.getOrDefault(pid, 0));
                    int next = Math.max(cur - safeQty(line.getQty()), 0);
                    running.put(line.getProductId(), next);
                    line.setRemainingQty(next);
                }
            }
        }
    }

    private void nullifyRemainingQty(TransferDoc doc) {
        if (doc.getLines() == null) return;
        for (TransferLine line : doc.getLines()) {
            line.setRemainingQty(null);
        }
    }

    private Map<String, Integer> loadStockBatch(String warehouseId, Set<String> productIds) {
        if (runtimeModeManager.useUnlimitedInventory(warehouseId)) {
            int unlimited = runtimeModeManager.getUnlimitedQty();
            Map<String, Integer> map = new HashMap<>();
            for (String pid : productIds) {
                map.put(pid, unlimited);
            }
            return map;
        }
        List<Stock> stocks = stockMapper.selectList(
            new LambdaQueryWrapper<Stock>()
                .eq(Stock::getWarehouseId, warehouseId)
                .in(Stock::getProductId, productIds)
        );
        Map<String, Integer> map = new HashMap<>();
        for (Stock s : stocks) {
            map.put(s.getProductId(), s.getQty() == null ? 0 : s.getQty());
        }
        return map;
    }

    private Map<String, Integer> loadStockAtDayStart(String warehouseId, Set<String> productIds, LocalDate day) {
        if (runtimeModeManager.useUnlimitedInventory(warehouseId)) {
            int unlimited = runtimeModeManager.getUnlimitedQty();
            Map<String, Integer> map = new HashMap<>();
            for (String pid : productIds) {
                map.put(pid, unlimited);
            }
            return map;
        }
        Map<String, Integer> currentStock = loadStockBatch(warehouseId, productIds);

        Date dayStart = Date.from(day.atStartOfDay(ZoneId.systemDefault()).toInstant());
        List<Ledger> ledgers = ledgerMapper.selectList(
            new LambdaQueryWrapper<Ledger>()
                .eq(Ledger::getWarehouseId, warehouseId)
                .in(Ledger::getProductId, productIds)
                .ge(Ledger::getCreatedAt, dayStart)
        );

        Map<String, Integer> deltaMap = new HashMap<>();
        for (Ledger l : ledgers) {
            deltaMap.merge(l.getProductId(), safeQty(l.getQty()), Integer::sum);
        }

        Map<String, Integer> result = new HashMap<>();
        for (String pid : productIds) {
            int cur = currentStock.getOrDefault(pid, 0);
            int delta = deltaMap.getOrDefault(pid, 0);
            result.put(pid, Math.max(cur - delta, 0));
        }
        return result;
    }

    private LocalDate toLocalDate(Date date) {
        return date.toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
    }

    private void fillDocRemainingQty(TransferDoc doc) {
        if (doc == null || doc.getLines() == null || doc.getLines().isEmpty()) {
            return;
        }
        if (!"posted".equals(doc.getStatus()) || doc.getFromWarehouseId() == null || doc.getFromWarehouseId().isEmpty() || doc.getDocDate() == null) {
            nullifyRemainingQty(doc);
            return;
        }

        LocalDate docDay = toLocalDate(doc.getDocDate());
        List<TransferDoc> sameDayDocs = transferDocMapper.selectList(
            new LambdaQueryWrapper<TransferDoc>()
                .eq(TransferDoc::getStatus, "posted")
                .eq(TransferDoc::getFromWarehouseId, doc.getFromWarehouseId())
                .orderByAsc(TransferDoc::getCreatedAt)
                .orderByAsc(TransferDoc::getId)
        );

        List<TransferDoc> filtered = new ArrayList<>();
        Set<String> docIds = new HashSet<>();
        for (TransferDoc d : sameDayDocs) {
            if (d.getDocDate() != null && toLocalDate(d.getDocDate()).equals(docDay)) {
                filtered.add(d);
                docIds.add(d.getId());
            }
        }
        if (filtered.isEmpty()) {
            nullifyRemainingQty(doc);
            return;
        }

        List<TransferLine> allDayLines = transferLineMapper.selectList(
            new LambdaQueryWrapper<TransferLine>()
                .in(TransferLine::getDocId, docIds)
                .orderByAsc(TransferLine::getId)
        );
        Map<String, List<TransferLine>> linesByDocId = allDayLines.stream()
            .collect(Collectors.groupingBy(TransferLine::getDocId));

        Set<String> allProductIds = new HashSet<>();
        for (TransferLine line : allDayLines) {
            if (line.getProductId() != null && !line.getProductId().isEmpty()) {
                allProductIds.add(line.getProductId());
            }
        }
        Map<String, Integer> stockAtDayStart = allProductIds.isEmpty()
            ? Collections.emptyMap()
            : loadStockAtDayStart(doc.getFromWarehouseId(), allProductIds, docDay);

        Map<String, Integer> running = new HashMap<>();
        for (TransferDoc d : filtered) {
            List<TransferLine> dLines = linesByDocId.getOrDefault(d.getId(), Collections.emptyList());
            for (TransferLine line : dLines) {
                if (line.getProductId() == null || line.getProductId().isEmpty()) continue;
                int cur = running.computeIfAbsent(line.getProductId(), pid -> stockAtDayStart.getOrDefault(pid, 0));
                int next = Math.max(cur - safeQty(line.getQty()), 0);
                running.put(line.getProductId(), next);
                if (d.getId().equals(doc.getId())) {
                    line.setRemainingQty(next);
                }
            }
            if (d.getId().equals(doc.getId())) {
                doc.setLines(dLines);
                return;
            }
        }
        nullifyRemainingQty(doc);
    }

    private int safeQty(Integer qty) {
        return qty == null || qty < 0 ? 0 : qty;
    }

    @lombok.Data
    public static class TransferDocVO {
        private TransferDoc doc;
        private List<TransferLine> lines;
    }
}