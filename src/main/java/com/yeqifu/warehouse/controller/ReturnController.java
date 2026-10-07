package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.ReturnDoc;
import com.yeqifu.warehouse.entity.ReturnLine;
import com.yeqifu.warehouse.mapper.ReturnDocMapper;
import com.yeqifu.warehouse.service.DocPostingService;
import com.yeqifu.warehouse.service.DocQueryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 业务校验失败抛 BizException，由事务拦截器回滚、ApiExceptionHandler 转成 {code:-1,msg}（原因见 SaleController）。
 */
@RestController
@RequestMapping("/api/return")
public class ReturnController {

    @Autowired
    private ReturnDocMapper returnDocMapper;
    @Autowired
    private DocPostingService postingService;
    @Autowired
    private DocQueryService queryService;

    /**
     * 退单列表。不带筛选参数时与旧版一致（按创建时间倒序分页，含明细）。
     * 可选：salespersonId、storeId、status、returnType、startDate/endDate、keyword、withLines=false。
     */
    @GetMapping("/list")
    public Result<List<ReturnDoc>> list(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer limit,
            DocQueryService.DocFilter filter,
            @RequestParam(defaultValue = "true") boolean withLines) {
        IPage<ReturnDoc> result = returnDocMapper.selectPage(new Page<>(page, limit),
            queryService.returnQuery(filter).orderByDesc(ReturnDoc::getCreatedAt).orderByDesc(ReturnDoc::getId));
        List<ReturnDoc> docs = result.getRecords();
        if (withLines) {
            queryService.fillReturnLines(docs);
        } else {
            queryService.fillReturnSummaries(docs);
        }
        queryService.fillSaleLinks(docs);
        return Result.ok(docs, result.getTotal());
    }

    @GetMapping("/detail/{id}")
    public Result<ReturnDoc> detail(@PathVariable String id) {
        ReturnDoc doc = postingService.loadReturn(id);
        if (doc != null) {
            queryService.fillSaleLinks(Collections.singletonList(doc));
        }
        return Result.ok(doc);
    }

    @PostMapping("/save")
    @Transactional
    public Result<ReturnDoc> save(@RequestBody ReturnDocVO vo) {
        return Result.ok(postingService.saveReturnDraft(vo.getDoc(), vo.getLines()));
    }

    /**
     * 一次完成退单的保存+过账，可选关联到销单（linkSaleId）。退单 id 由客户端预先生成，可安全重试。
     */
    @PostMapping("/submit")
    @Transactional
    public Result<Map<String, Object>> submit(@RequestBody SubmitVO vo) {
        if (vo == null) {
            return Result.error("单据数据为空");
        }
        return Result.ok(postingService.submitReturn(vo.getDoc(), vo.getLines(), vo.getLinkSaleId()));
    }

    @PostMapping("/post/{id}")
    @Transactional
    public Result<Void> post(@PathVariable String id) {
        postingService.postReturn(id);
        return Result.ok();
    }

    @PostMapping("/void/{id}")
    @Transactional
    public Result<Void> voidDoc(@PathVariable String id) {
        postingService.voidReturn(id);
        return Result.ok();
    }

    @lombok.Data
    public static class ReturnDocVO {
        private ReturnDoc doc;
        private List<ReturnLine> lines;
    }

    @lombok.Data
    public static class SubmitVO {
        private ReturnDoc doc;
        private List<ReturnLine> lines;
        private String linkSaleId;
    }
}
