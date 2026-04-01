package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Warehouse;
import com.yeqifu.warehouse.mapper.WarehouseMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/warehouse")
@CrossOrigin
public class WarehouseController {

    @Autowired
    private WarehouseMapper warehouseMapper;

    @GetMapping("/list")
    public Result<List<Warehouse>> list() {
        List<Warehouse> list = warehouseMapper.selectList(new LambdaQueryWrapper<>());
        return Result.ok(list);
    }

    @PostMapping("/save")
    public Result<Void> save(@RequestBody Warehouse warehouse) {
        if (warehouse.getId() == null || warehouse.getId().isEmpty()) {
            warehouse.setId(com.yeqifu.warehouse.common.IdUtils.randomId());
            warehouseMapper.insert(warehouse);
        } else {
            warehouseMapper.updateById(warehouse);
        }
        return Result.ok();
    }

    @PostMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable String id) {
        warehouseMapper.deleteById(id);
        return Result.ok();
    }
}
