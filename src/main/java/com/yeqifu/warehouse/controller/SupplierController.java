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
@CrossOrigin
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
        if (supplier.getId() == null || supplier.getId().isEmpty()) {
            supplier.setId(com.yeqifu.warehouse.common.IdUtils.randomId());
            if (supplier.getStatus() == null || supplier.getStatus().isEmpty()) {
                supplier.setStatus("active");
            }
            if (supplier.getCode() == null || supplier.getCode().isEmpty()) {
                String baseCode = PinyinUtils.getPingYin(supplier.getName()).toLowerCase();
                String code = baseCode;
                int suffix = 2;
                while (supplierMapper.selectCount(new LambdaQueryWrapper<Supplier>().eq(Supplier::getCode, code)) > 0) {
                    code = baseCode + suffix;
                    suffix++;
                }
                supplier.setCode(code);
            }
            supplierMapper.insert(supplier);
        } else {
            supplierMapper.updateById(supplier);
        }
        return Result.ok();
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
