package com.yeqifu.warehouse.controller;

import com.yeqifu.warehouse.common.Result;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 后端能力声明。App 启动时读取，判断能否使用新接口；旧后端没有这个接口，App 自动走旧流程，
 * 所以 App 和后端可以分别升级、分别回退。
 */
@RestController
@RequestMapping("/api/meta")
public class MetaController {

    public static final int API_VERSION = 2;

    private static final List<String> FEATURES = Arrays.asList(
        "sale.list.filter",      // /api/sale/list、/api/return/list、/api/sale/unsettled 支持服务端筛选和 withLines=false
        "sale.submit",           // /api/sale/submit 销单+退单一次提交，可重试
        "return.submit",         // /api/return/submit 退单一次提交，可重试
        "sale.void.cascade",     // 作废销单时同时作废关联退单
        "doc.save.clientId",     // 保存草稿时可使用客户端预生成的 id
        "doc.search",            // /api/doc/search 服务端模糊搜索
        "transfer.list.filter",  // /api/transfer/list、/api/inbound/list 支持日期筛选
        "finance.wage"           // /api/finance/commission/wage 按单据日期统计工资
    );

    private final String startedAt = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());

    @Value("${app.version:dev}")
    private String appVersion;

    @GetMapping("/info")
    public Result<Map<String, Object>> info() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("apiVersion", API_VERSION);
        data.put("appVersion", appVersion);
        data.put("features", FEATURES);
        data.put("startedAt", startedAt);
        data.put("serverTime", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date()));
        return Result.ok(data);
    }
}
