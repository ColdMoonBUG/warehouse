package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.Result;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.List;
import com.yeqifu.warehouse.entity.CommissionLedger;
import com.yeqifu.warehouse.mapper.CommissionLedgerMapper;
import java.math.RoundingMode;

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

    private static final java.math.BigDecimal COMMISSION_RATE = new java.math.BigDecimal("0.06");

    @GetMapping("/list")
    public Result<List<SaleDoc>> list(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer limit,
            @RequestParam(required = false) String storeId) {
        Page<SaleDoc> pageObj = new Page<>(page, limit);
        LambdaQueryWrapper<SaleDoc> qw = new LambdaQueryWrapper<SaleDoc>()
                .orderByDesc(SaleDoc::getCreatedAt);
        if (storeId != null && !storeId.isEmpty()) {
            qw.eq(SaleDoc::getStoreId, storeId);
        }
        IPage<SaleDoc> result = saleDocMapper.selectPage(pageObj, qw);
        List<SaleDoc> records = result.getRecords();
        for (SaleDoc doc : records) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, doc.getId())
            );
            doc.setLines(lines);
        }
        return Result.ok(records, result.getTotal());
    }

    @GetMapping("/detail/{id}")
    public Result<SaleDoc> detail(@PathVariable String id) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc != null) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, id)
            );
            doc.setLines(lines);
        }
        return Result.ok(doc);
    }

    @PostMapping("/save")
    @Transactional
    public Result<SaleDoc> save(@RequestBody SaleDocVO vo) {
        SaleDoc doc = vo.getDoc();
        List<SaleLine> lines = vo.getLines();
        if (lines == null) {
            lines = java.util.Collections.emptyList();
        }
        vo.setLines(lines);

        normalizeLines(lines);

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
            doc.setCode(IdUtils.genCode("XS"));
            saleDocMapper.insert(doc);
        } else {
            saleDocMapper.updateById(doc);
            // 删除旧明细
            saleLineMapper.delete(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, doc.getId())
            );
        }

        // 保存明细
        for (SaleLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
            if (line.getAmount() == null) {
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                line.setAmount(price.multiply(new BigDecimal(qty)));
            }
            saleLineMapper.insert(line);
        }

        return Result.ok(doc);
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

                // 赠送单不计提成
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
                }
            }
            doc.setStatus("posted");
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

                // 赠送单无提成，作废时也无需反冲提成
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
                }
            }
            doc.setStatus("voided");
            saleDocMapper.updateById(doc);
            return Result.ok();
        } catch (RuntimeException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/delete/{id}")
    @Transactional
    public Result<Void> delete(@PathVariable String id) {
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
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, doc.getId())
            );
            doc.setLines(lines);
        }
        return Result.ok(records, result.getTotal());
    }

    @PostMapping("/settle/{id}")
    public Result<Void> settle(@PathVariable String id) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc == null || !"posted".equals(doc.getStatus())) {
            return Result.error("单据状态异常");
        }
        doc.setSettled(1);
        doc.setSettledAt(new java.util.Date());
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

    @GetMapping("/storeSaleQty")
    public Result<java.util.Map<String, Integer>> storeSaleQty(@RequestParam(defaultValue = "30") Integer days) {
        java.time.LocalDate start = java.time.LocalDate.now().minusDays(days);
        List<SaleDoc> docs = saleDocMapper.selectList(
            new LambdaQueryWrapper<SaleDoc>().ge(SaleDoc::getDocDate, java.sql.Date.valueOf(start))
        );
        java.util.Map<String, Integer> map = new java.util.HashMap<>();
        for (SaleDoc doc : docs) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, doc.getId())
            );
            int sum = 0;
            for (SaleLine line : lines) sum += line.getQty() == null ? 0 : line.getQty();
            map.put(doc.getStoreId(), map.getOrDefault(doc.getStoreId(), 0) + sum);
        }
        return Result.ok(map);
    }

    @GetMapping("/productSaleQty")
    public Result<java.util.Map<String, Integer>> productSaleQty(@RequestParam(defaultValue = "30") Integer days) {
        java.time.LocalDate start = java.time.LocalDate.now().minusDays(days);
        List<SaleDoc> docs = saleDocMapper.selectList(
            new LambdaQueryWrapper<SaleDoc>()
                .eq(SaleDoc::getStatus, "posted")
                .ge(SaleDoc::getDocDate, java.sql.Date.valueOf(start))
        );
        java.util.Map<String, Integer> map = new java.util.HashMap<>();
        for (SaleDoc doc : docs) {
            List<SaleLine> lines = saleLineMapper.selectList(
                new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, doc.getId())
            );
            for (SaleLine line : lines) {
                int qty = line.getQty() == null ? 0 : line.getQty();
                map.put(line.getProductId(), map.getOrDefault(line.getProductId(), 0) + qty);
            }
        }
        return Result.ok(map);
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
