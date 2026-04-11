package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Stock;
import com.yeqifu.warehouse.entity.Warehouse;
import com.yeqifu.warehouse.mapper.StockMapper;
import com.yeqifu.warehouse.mapper.WarehouseMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpSession;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/stock")
public class StockController {

    @Autowired
    private StockMapper stockMapper;

    @Autowired
    private WarehouseMapper warehouseMapper;

    @GetMapping("/list")
    public Result<List<Stock>> list(@RequestParam(required = false) String warehouseId, HttpSession session) {
        LambdaQueryWrapper<Stock> qw = new LambdaQueryWrapper<>();
        if (warehouseId != null && !warehouseId.isEmpty()) {
            qw.eq(Stock::getWarehouseId, warehouseId);
        }
        List<Stock> list = stockMapper.selectList(qw);
        Object role = session.getAttribute("warehouseAccountRole");
        Object accountId = session.getAttribute("warehouseAccountId");
        if (!"salesperson".equals(role) || !(accountId instanceof String)) {
            return Result.ok(list);
        }
        String salespersonId = (String) accountId;
        List<Stock> filtered = new ArrayList<>();
        for (Stock item : list) {
            if (item == null || item.getWarehouseId() == null || item.getWarehouseId().isEmpty()) {
                continue;
            }
            Warehouse warehouse = warehouseMapper.selectById(item.getWarehouseId());
            if (warehouse == null) {
                continue;
            }
            if ("main".equals(warehouse.getType())) {
                filtered.add(item);
                continue;
            }
            if ("vehicle".equals(warehouse.getType()) && salespersonId.equals(warehouse.getSalespersonId())) {
                filtered.add(item);
            }
        }
        return Result.ok(filtered);
    }
}
