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
@RequestMapping("/api/inbound")
public class InboundController {

    private static final String MAIN_WAREHOUSE_ID = "main";

    @Autowired
    private InboundDocMapper inboundDocMapper;
    @Autowired
    private InboundLineMapper inboundLineMapper;
    @Autowired
    private StockLedgerService stockLedgerService;

    /** 不带参数时返回全部（与旧版一致）；可选 startDate/endDate（单据日期）、status 缩小范围。 */
    @GetMapping("/list")
    public Result<List<InboundDoc>> list(@RequestParam(required = false) String startDate,
                                         @RequestParam(required = false) String endDate,
                                         @RequestParam(required = false) String status) {
        java.sql.Date start = QueryUtils.parseDate(startDate, "开始日期");
        java.sql.Date end = QueryUtils.parseDate(endDate, "结束日期");
        List<String> states = QueryUtils.csv(status);
        List<InboundDoc> docs = inboundDocMapper.selectList(new LambdaQueryWrapper<InboundDoc>()
            .ge(start != null, InboundDoc::getDocDate, start)
            .le(end != null, InboundDoc::getDocDate, end)
            .in(!states.isEmpty(), InboundDoc::getStatus, states)
            .orderByDesc(InboundDoc::getCreatedAt));
        if (!docs.isEmpty()) {
            Map<String, List<InboundLine>> byDoc = new HashMap<>();
            List<String> ids = docs.stream().map(InboundDoc::getId).collect(Collectors.toList());
            for (int i = 0; i < ids.size(); i += 500) {
                inboundLineMapper.selectList(new LambdaQueryWrapper<InboundLine>()
                        .in(InboundLine::getDocId, ids.subList(i, Math.min(ids.size(), i + 500)))
                        .orderByAsc(InboundLine::getId))
                    .forEach(l -> byDoc.computeIfAbsent(l.getDocId(), k -> new ArrayList<>()).add(l));
            }
            for (InboundDoc doc : docs) {
                doc.setLines(byDoc.getOrDefault(doc.getId(), Collections.emptyList()));
            }
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
        if (doc.getDocDate() == null) doc.setDocDate(new Date());
        doc.setStatus("draft");
        doc.setCreatedAt(null);
        doc.setUpdatedAt(null);

        InboundDoc existing = QueryUtils.hasText(doc.getId()) ? inboundDocMapper.selectById(doc.getId()) : null;
        if (existing == null) {
            if (!QueryUtils.hasText(doc.getId())) {
                doc.setId(IdUtils.randomId());
            }
            doc.setCode(IdUtils.genCode("IN"));
            inboundDocMapper.insert(doc);
        } else {
            if (!"draft".equals(existing.getStatus())) {
                return Result.error("单据" + existing.getCode() + "已" + ("posted".equals(existing.getStatus()) ? "过账" : "作废") + "，不能再修改");
            }
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

    // 业务校验失败抛 BizException，由事务拦截器回滚、ApiExceptionHandler 转成 {code:-1,msg}（原因见 SaleController）
    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        InboundDoc doc = inboundDocMapper.selectById(id);
        if (doc == null || !"draft".equals(doc.getStatus())) {
            return Result.error("单据状态异常");
        }
        claimStatus(id, "draft", "posted");
        List<InboundLine> lines = inboundLineMapper.selectList(new LambdaQueryWrapper<InboundLine>().eq(InboundLine::getDocId, id));
        for (InboundLine line : lines) {
            stockLedgerService.applyStockDelta(MAIN_WAREHOUSE_ID, line.getProductId(), line.getQty());
            stockLedgerService.insertLedger("inbound", id, MAIN_WAREHOUSE_ID, line.getProductId(), line.getQty());
        }
        return Result.ok();
    }

    @PostMapping("/void/{id}")
    @Transactional
    public Result<Void> voidDoc(@PathVariable String id) {
        InboundDoc doc = inboundDocMapper.selectById(id);
        if (doc == null || !"posted".equals(doc.getStatus())) {
            return Result.error("只能作废已过账单据");
        }
        claimStatus(id, "posted", "voided");
        List<InboundLine> lines = inboundLineMapper.selectList(new LambdaQueryWrapper<InboundLine>().eq(InboundLine::getDocId, id));
        for (InboundLine line : lines) {
            stockLedgerService.applyStockDelta(MAIN_WAREHOUSE_ID, line.getProductId(), -line.getQty());
            stockLedgerService.insertLedger("inbound", id, MAIN_WAREHOUSE_ID, line.getProductId(), -line.getQty());
        }
        return Result.ok();
    }

    /** 条件更新抢占状态：并发重复过账/作废时只有一次成功，其余抛错回滚。 */
    private void claimStatus(String id, String from, String to) {
        int updated = inboundDocMapper.update(null, new LambdaUpdateWrapper<InboundDoc>()
            .set(InboundDoc::getStatus, to)
            .eq(InboundDoc::getId, id)
            .eq(InboundDoc::getStatus, from));
        if (updated == 0) throw new BizException("单据状态已变更，请刷新");
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

    @lombok.Data
    public static class InboundDocVO {
        private InboundDoc doc;
        private List<InboundLine> lines;
    }
}
