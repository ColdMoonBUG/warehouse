package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Stock;
import com.yeqifu.warehouse.mapper.StockMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/stock")
@CrossOrigin
public class StockController {

    @Autowired
    private StockMapper stockMapper;

    @GetMapping("/list")
    public Result<List<Stock>> list(@RequestParam(required = false) String warehouseId) {
        LambdaQueryWrapper<Stock> qw = new LambdaQueryWrapper<>();
        if (warehouseId != null && !warehouseId.isEmpty()) {
            qw.eq(Stock::getWarehouseId, warehouseId);
        }
        List<Stock> list = stockMapper.selectList(qw);
        return Result.ok(list);
    }
}
