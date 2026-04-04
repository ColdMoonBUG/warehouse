package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Warehouse;
import com.yeqifu.warehouse.mapper.WarehouseMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpSession;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/warehouse")
@CrossOrigin
public class WarehouseController {

    @Autowired
    private WarehouseMapper warehouseMapper;

    @GetMapping("/list")
    public Result<List<Warehouse>> list(HttpSession session) {
        List<Warehouse> list = warehouseMapper.selectList(new LambdaQueryWrapper<>());
        Object role = session.getAttribute("warehouseAccountRole");
        Object accountId = session.getAttribute("warehouseAccountId");
        if (!"salesperson".equals(role) || !(accountId instanceof String)) {
            return Result.ok(list);
        }
        String salespersonId = (String) accountId;
        List<Warehouse> filtered = new ArrayList<>();
        for (Warehouse warehouse : list) {
            if (warehouse == null) {
                continue;
            }
            if ("main".equals(warehouse.getType()) || "return".equals(warehouse.getType())) {
                filtered.add(warehouse);
                continue;
            }
            if ("vehicle".equals(warehouse.getType()) && salespersonId.equals(warehouse.getSalespersonId())) {
                filtered.add(warehouse);
            }
        }
        return Result.ok(filtered);
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
