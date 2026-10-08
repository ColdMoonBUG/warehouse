package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.yeqifu.warehouse.common.BizException;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.QueryUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.*;
import com.yeqifu.warehouse.mapper.*;
import com.yeqifu.warehouse.service.StockLedgerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/outbound")
public class OutboundController {

    @Autowired
    private OutboundDocMapper outboundDocMapper;
    @Autowired
    private OutboundLineMapper outboundLineMapper;
    @Autowired
    private StockLedgerService stockLedgerService;

    @GetMapping("/list")
    public Result<List<OutboundDoc>> list() {
        List<OutboundDoc> docs = outboundDocMapper.selectList(new LambdaQueryWrapper<OutboundDoc>().orderByDesc(OutboundDoc::getCreatedAt));
        if (!docs.isEmpty()) {
            Map<String, List<OutboundLine>> byDoc = new HashMap<>();
            List<String> ids = docs.stream().map(OutboundDoc::getId).collect(Collectors.toList());
            for (int i = 0; i < ids.size(); i += 500) {
                outboundLineMapper.selectList(new LambdaQueryWrapper<OutboundLine>()
                        .in(OutboundLine::getDocId, ids.subList(i, Math.min(ids.size(), i + 500)))
                        .orderByAsc(OutboundLine::getId))
                    .forEach(l -> byDoc.computeIfAbsent(l.getDocId(), k -> new ArrayList<>()).add(l));
            }
            for (OutboundDoc doc : docs) {
                doc.setLines(byDoc.getOrDefault(doc.getId(), Collections.emptyList()));
            }
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
        if (doc.getDocDate() == null) doc.setDocDate(new Date());
        doc.setStatus("draft");
        doc.setCreatedAt(null);
        doc.setUpdatedAt(null);

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

        OutboundDoc existing = QueryUtils.hasText(doc.getId()) ? outboundDocMapper.selectById(doc.getId()) : null;
        if (existing == null) {
            if (!QueryUtils.hasText(doc.getId())) {
                doc.setId(IdUtils.randomId());
            }
            doc.setCode(IdUtils.genCode("OUT"));
            outboundDocMapper.insert(doc);
        } else {
            if (!"draft".equals(existing.getStatus())) {
                return Result.error("单据" + existing.getCode() + "已" + ("posted".equals(existing.getStatus()) ? "过账" : "作废") + "，不能再修改");
            }
            outboundDocMapper.updateById(doc);
            outboundLineMapper.delete(new LambdaQueryWrapper<OutboundLine>().eq(OutboundLine::getDocId, doc.getId()));
        }
        for (OutboundLine line : lines) {
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
            outboundLineMapper.insert(line);
        }
        return Result.ok();
    }

    // 业务校验失败抛 BizException，由事务拦截器回滚、ApiExceptionHandler 转成 {code:-1,msg}（原因见 SaleController）
    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        OutboundDoc doc = outboundDocMapper.selectById(id);
        if (doc == null || !"draft".equals(doc.getStatus())) {
            return Result.error("单据状态异常");
        }
        claimStatus(id, "draft", "posted");
        List<OutboundLine> lines = outboundLineMapper.selectList(new LambdaQueryWrapper<OutboundLine>().eq(OutboundLine::getDocId, id));
        for (OutboundLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            stockLedgerService.applyStockDelta(doc.getWarehouseId(), line.getProductId(), -qty);
            stockLedgerService.insertLedger("outbound", id, doc.getWarehouseId(), line.getProductId(), -qty);
        }
        return Result.ok();
    }

    @PostMapping("/void/{id}")
    @Transactional
    public Result<Void> voidDoc(@PathVariable String id) {
        OutboundDoc doc = outboundDocMapper.selectById(id);
        if (doc == null || !"posted".equals(doc.getStatus())) {
            return Result.error("只能作废已过账单据");
        }
        claimStatus(id, "posted", "voided");
        List<OutboundLine> lines = outboundLineMapper.selectList(new LambdaQueryWrapper<OutboundLine>().eq(OutboundLine::getDocId, id));
        for (OutboundLine line : lines) {
            stockLedgerService.applyStockDelta(doc.getWarehouseId(), line.getProductId(), line.getQty());
            stockLedgerService.insertLedger("outbound", id, doc.getWarehouseId(), line.getProductId(), line.getQty());
        }
        return Result.ok();
    }

    private void claimStatus(String id, String from, String to) {
        int updated = outboundDocMapper.update(null, new LambdaUpdateWrapper<OutboundDoc>()
            .set(OutboundDoc::getStatus, to)
            .eq(OutboundDoc::getId, id)
            .eq(OutboundDoc::getStatus, from));
        if (updated == 0) throw new BizException("单据状态已变更，请刷新");
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

    @lombok.Data
    public static class OutboundDocVO {
        private OutboundDoc doc;
        private List<OutboundLine> lines;
    }
}
