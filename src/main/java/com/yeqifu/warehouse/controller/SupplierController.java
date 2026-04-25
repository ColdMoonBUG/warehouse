package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.sys.common.PinyinUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Supplier;
import com.yeqifu.warehouse.mapper.SupplierMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/supplier")
public class SupplierController {

    @Autowired
    private SupplierMapper supplierMapper;

    @GetMapping("/list")
    public Result<List<Supplier>> list() {
        List<Supplier> list = supplierMapper.selectList(
            new LambdaQueryWrapper<Supplier>().eq(Supplier::getStatus, "active")
        );
        return Result.ok(list);
    }

    @GetMapping("/detail/{id}")
    public Result<Supplier> detail(@PathVariable String id) {
        return Result.ok(supplierMapper.selectById(id));
    }

    @PostMapping("/save")
    public Result<Void> save(@RequestBody Supplier supplier) {
        boolean isCreate = (supplier.getId() == null || supplier.getId().isEmpty());
        if (isCreate) {
            supplier.setId(com.yeqifu.warehouse.common.IdUtils.randomId());
            if (supplier.getStatus() == null || supplier.getStatus().isEmpty()) {
                supplier.setStatus("active");
            }
        }
        // 新增 / 编辑：只要 code 为空就自动生成，避免触发 NOT NULL 约束
        if (supplier.getCode() == null || supplier.getCode().trim().isEmpty()) {
            supplier.setCode(generateUniqueCode(supplier.getName()));
        }
        if (isCreate) {
            supplierMapper.insert(supplier);
        } else {
            supplierMapper.updateById(supplier);
        }
        return Result.ok();
    }

    /**
     * 由名称生成唯一编码：
     * 1. 优先使用拼音；遇到生僻字 / 空名 / pinyin4j 异常时用兜底前缀
     * 2. 仅保留 [a-z0-9_]，避免特殊字符破坏数据库
     * 3. 重复时追加自增后缀，循环上限 9999 次防止死循环，超限改用时间戳兜底
     */
    private String generateUniqueCode(String name) {
        String baseCode;
        try {
            String py = PinyinUtils.getPingYin(name);
            baseCode = py == null ? "" : py.toLowerCase().trim();
        } catch (Exception e) {
            baseCode = "";
        }
        baseCode = baseCode.replaceAll("[^a-z0-9_]", "");
        if (baseCode.isEmpty() || "*".equals(baseCode)) {
            baseCode = "sup";
        }
        if (baseCode.length() > 30) {
            baseCode = baseCode.substring(0, 30);
        }
        String code = baseCode;
        int suffix = 2;
        while (supplierMapper.selectCount(new LambdaQueryWrapper<Supplier>().eq(Supplier::getCode, code)) > 0) {
            code = baseCode + suffix;
            suffix++;
            if (suffix > 9999) {
                code = baseCode + "_" + System.currentTimeMillis();
                break;
            }
        }
        return code;
    }

    @PostMapping("/toggle/{id}")
    public Result<Void> toggle(@PathVariable String id) {
        Supplier supplier = supplierMapper.selectById(id);
        if (supplier != null) {
            supplier.setStatus("active".equals(supplier.getStatus()) ? "inactive" : "active");
            supplierMapper.updateById(supplier);
        }
        return Result.ok();
    }

    @PostMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable String id) {
        supplierMapper.deleteById(id);
        return Result.ok();
    }
}
