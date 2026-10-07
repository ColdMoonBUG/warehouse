package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.yeqifu.warehouse.common.BizException;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.QueryUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.common.RuntimeModeManager;
import com.yeqifu.warehouse.entity.*;
import com.yeqifu.warehouse.mapper.*;
import com.yeqifu.warehouse.service.StockLedgerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
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
    private StockLedgerService stockLedgerService;

    @Autowired
    private RuntimeModeManager runtimeModeManager;

    /**
     * 不带参数时返回全部（与旧版一致）。可选：startDate/endDate（单据日期）、warehouseId（调出或调入）、
     * status；withRemaining=false 时跳过“出库后剩余”计算（报表只需要数量时用）。
     */
    @GetMapping("/list")
    public Result<List<TransferDoc>> list(@RequestParam(required = false) String startDate,
                                          @RequestParam(required = false) String endDate,
                                          @RequestParam(required = false) String warehouseId,
                                          @RequestParam(required = false) String status,
                                          @RequestParam(defaultValue = "true") boolean withRemaining) {
        java.sql.Date start = QueryUtils.parseDate(startDate, "开始日期");
        java.sql.Date end = QueryUtils.parseDate(endDate, "结束日期");
        List<String> states = QueryUtils.csv(status);
        LambdaQueryWrapper<TransferDoc> qw = new LambdaQueryWrapper<TransferDoc>()
            .ge(start != null, TransferDoc::getDocDate, start)
            .le(end != null, TransferDoc::getDocDate, end)
            .in(!states.isEmpty(), TransferDoc::getStatus, states)
            .orderByDesc(TransferDoc::getCreatedAt);
        if (QueryUtils.hasText(warehouseId)) {
            qw.and(w -> w.eq(TransferDoc::getFromWarehouseId, warehouseId).or().eq(TransferDoc::getToWarehouseId, warehouseId));
        }
        List<TransferDoc> docs = transferDocMapper.selectList(qw);
        if (!docs.isEmpty()) {
            List<String> allDocIds = docs.stream().map(TransferDoc::getId).collect(Collectors.toList());
            Map<String, List<TransferLine>> linesByDocId = new HashMap<>();
            for (int i = 0; i < allDocIds.size(); i += 500) {
                transferLineMapper.selectList(new LambdaQueryWrapper<TransferLine>()
                        .in(TransferLine::getDocId, allDocIds.subList(i, Math.min(allDocIds.size(), i + 500)))
                        .orderByAsc(TransferLine::getId))
                    .forEach(l -> linesByDocId.computeIfAbsent(l.getDocId(), k -> new ArrayList<>()).add(l));
            }
            for (TransferDoc doc : docs) {
                doc.setLines(linesByDocId.getOrDefault(doc.getId(), Collections.emptyList()));
            }
            if (withRemaining) {
                batchFillRemainingQty(docs);
            } else {
                docs.forEach(this::nullifyRemainingQty);
            }
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

    // 业务校验失败抛 BizException，由事务拦截器回滚、ApiExceptionHandler 转成 {code:-1,msg}（原因见 SaleController）
    @PostMapping("/save")
    @Transactional
    public Result<TransferDoc> save(@RequestBody TransferDocVO vo) {
        TransferDoc doc = vo.getDoc();
        List<TransferLine> lines = vo.getLines();
        boolean linesProvided = lines != null;
        if (lines == null) {
            lines = java.util.Collections.emptyList();
        }
        vo.setLines(lines);
        normalizeLines(lines);
        doc.setStatus("draft");
        if (doc.getDocDate() == null) doc.setDocDate(new Date());
        doc.setCreatedAt(null);
        doc.setUpdatedAt(null);

        TransferDoc existing = null;
        if (doc.getId() != null && !doc.getId().isEmpty()) {
            existing = transferDocMapper.selectById(doc.getId());
        }
        if (existing != null && !"draft".equals(existing.getStatus())) {
            return Result.error("单据" + existing.getCode() + "已" + ("posted".equals(existing.getStatus()) ? "过账" : "作废") + "，不能再修改");
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
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        TransferDoc doc = transferDocMapper.selectById(id);
        if (doc == null || !"draft".equals(doc.getStatus())) {
            return Result.error("单据状态异常");
        }
        if (doc.getFromWarehouseId() != null && doc.getFromWarehouseId().equals(doc.getToWarehouseId())) {
            return Result.error("调出仓库和调入仓库不能相同");
        }
        claimStatus(id, "draft", "posted");
        List<TransferLine> lines = transferLineMapper.selectList(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, id));
        boolean initMode = runtimeModeManager.isInitMode();
        for (TransferLine line : lines) {
            if (!initMode) {
                // 正常模式：来源仓扣减
                stockLedgerService.applyStockDelta(doc.getFromWarehouseId(), line.getProductId(), -line.getQty());
                stockLedgerService.insertLedger("transfer", id, doc.getFromWarehouseId(), line.getProductId(), -line.getQty());
            }
            // 两种模式都给目标仓加库存
            stockLedgerService.applyStockDelta(doc.getToWarehouseId(), line.getProductId(), line.getQty());
            stockLedgerService.insertLedger("transfer", id, doc.getToWarehouseId(), line.getProductId(), line.getQty());
        }
        return Result.ok();
    }

    @PostMapping("/void/{id}")
    @Transactional
    public Result<Void> voidDoc(@PathVariable String id) {
        TransferDoc doc = transferDocMapper.selectById(id);
        if (doc == null || !"posted".equals(doc.getStatus())) {
            return Result.error("只能作废已过账单据");
        }
        claimStatus(id, "posted", "voided");
        List<TransferLine> lines = transferLineMapper.selectList(new LambdaQueryWrapper<TransferLine>().eq(TransferLine::getDocId, id));
        // 过账时若处于初始化模式，源仓并未扣减；作废若无条件加回会凭空多出库存。
        // 以账本为事实来源：该单在源仓有扣减流水才回补。查询异常时退回旧行为，保证作废不被阻断。
        boolean restoreFrom = true;
        try {
            List<Ledger> fromLedgers = ledgerMapper.selectList(
                new LambdaQueryWrapper<Ledger>()
                    .eq(Ledger::getDocId, id)
                    .eq(Ledger::getWarehouseId, doc.getFromWarehouseId())
                    .lt(Ledger::getQty, 0));
            restoreFrom = fromLedgers != null && !fromLedgers.isEmpty();
        } catch (Exception ignore) {
            restoreFrom = true;
        }
        for (TransferLine line : lines) {
            if (restoreFrom) {
                stockLedgerService.applyStockDelta(doc.getFromWarehouseId(), line.getProductId(), line.getQty());
                stockLedgerService.insertLedger("transfer", id, doc.getFromWarehouseId(), line.getProductId(), line.getQty());
            }
            stockLedgerService.applyStockDelta(doc.getToWarehouseId(), line.getProductId(), -line.getQty());
            stockLedgerService.insertLedger("transfer", id, doc.getToWarehouseId(), line.getProductId(), -line.getQty());
        }
        return Result.ok();
    }

    private void claimStatus(String id, String from, String to) {
        int updated = transferDocMapper.update(null, new LambdaUpdateWrapper<TransferDoc>()
            .set(TransferDoc::getStatus, to)
            .eq(TransferDoc::getId, id)
            .eq(TransferDoc::getStatus, from));
        if (updated == 0) throw new BizException("单据状态已变更，请刷新");
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

    /**
     * 计算已过账出库单每行“出库后剩余”：同仓同日按创建顺序依次扣减当日日初库存。
     * 日初库存 = 当前库存 - 当日起的流水合计；同一仓库只查一次流水，再按日倒推。
     */
    private void batchFillRemainingQty(List<TransferDoc> docs) {
        Map<String, Map<LocalDate, List<TransferDoc>>> byWarehouse = new LinkedHashMap<>();
        for (TransferDoc doc : docs) {
            if (!"posted".equals(doc.getStatus()) || doc.getFromWarehouseId() == null || doc.getDocDate() == null) {
                nullifyRemainingQty(doc);
                continue;
            }
            byWarehouse.computeIfAbsent(doc.getFromWarehouseId(), k -> new TreeMap<>())
                .computeIfAbsent(toLocalDate(doc.getDocDate()), k -> new ArrayList<>()).add(doc);
        }

        for (Map.Entry<String, Map<LocalDate, List<TransferDoc>>> whEntry : byWarehouse.entrySet()) {
            String warehouseId = whEntry.getKey();
            Map<LocalDate, List<TransferDoc>> byDay = whEntry.getValue();
            Set<String> allProductIds = new HashSet<>();
            for (List<TransferDoc> group : byDay.values()) {
                for (TransferDoc doc : group) {
                    for (TransferLine line : doc.getLines()) {
                        if (line.getProductId() != null && !line.getProductId().isEmpty()) {
                            allProductIds.add(line.getProductId());
                        }
                    }
                }
            }
            if (allProductIds.isEmpty()) continue;
            Map<LocalDate, Map<String, Integer>> dayStartStock = loadStockAtDayStarts(warehouseId, allProductIds, byDay.keySet());

            for (Map.Entry<LocalDate, List<TransferDoc>> dayEntry : byDay.entrySet()) {
                List<TransferDoc> group = dayEntry.getValue();
                group.sort(Comparator
                    .comparing((TransferDoc d) -> d.getCreatedAt() == null ? new Date(0) : d.getCreatedAt())
                    .thenComparing(TransferDoc::getId));
                Map<String, Integer> stockAtDayStart = dayStartStock.get(dayEntry.getKey());
                Map<String, Integer> running = new HashMap<>();
                for (TransferDoc doc : group) {
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
    }

    private void nullifyRemainingQty(TransferDoc doc) {
        if (doc.getLines() == null) return;
        for (TransferLine line : doc.getLines()) {
            line.setRemainingQty(null);
        }
    }

    private Map<String, Integer> loadStockBatch(String warehouseId, Set<String> productIds) {
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

    /** 一次查询该仓库自最早一天起的流水，算出每一天日初的库存。 */
    private Map<LocalDate, Map<String, Integer>> loadStockAtDayStarts(String warehouseId, Set<String> productIds, Set<LocalDate> days) {
        Map<LocalDate, Map<String, Integer>> result = new HashMap<>();
        if (runtimeModeManager.useUnlimitedInventory(warehouseId)) {
            int unlimited = runtimeModeManager.getUnlimitedQty();
            Map<String, Integer> map = new HashMap<>();
            for (String pid : productIds) {
                map.put(pid, unlimited);
            }
            for (LocalDate day : days) {
                result.put(day, map);
            }
            return result;
        }
        Map<String, Integer> currentStock = loadStockBatch(warehouseId, productIds);
        LocalDate earliest = Collections.min(days);
        List<Ledger> ledgers = ledgerMapper.selectList(
            new LambdaQueryWrapper<Ledger>()
                .select(Ledger::getProductId, Ledger::getQty, Ledger::getCreatedAt)
                .eq(Ledger::getWarehouseId, warehouseId)
                .in(Ledger::getProductId, productIds)
                .ge(Ledger::getCreatedAt, dayStart(earliest))
        );
        for (LocalDate day : days) {
            Date start = dayStart(day);
            Map<String, Integer> deltaMap = new HashMap<>();
            for (Ledger l : ledgers) {
                if (l.getCreatedAt() != null && !l.getCreatedAt().before(start)) {
                    deltaMap.merge(l.getProductId(), l.getQty() == null ? 0 : l.getQty(), Integer::sum);
                }
            }
            Map<String, Integer> map = new HashMap<>();
            for (String pid : productIds) {
                map.put(pid, Math.max(currentStock.getOrDefault(pid, 0) - deltaMap.getOrDefault(pid, 0), 0));
            }
            result.put(day, map);
        }
        return result;
    }

    private Date dayStart(LocalDate day) {
        return Date.from(day.atStartOfDay(ZoneId.systemDefault()).toInstant());
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
                .eq(TransferDoc::getDocDate, java.sql.Date.valueOf(docDay))
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
            : loadStockAtDayStarts(doc.getFromWarehouseId(), allProductIds, Collections.singleton(docDay)).get(docDay);

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
