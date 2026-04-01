package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Ledger;
import com.yeqifu.warehouse.mapper.LedgerMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ledger")
@CrossOrigin
public class LedgerController {

    @Autowired
    private LedgerMapper ledgerMapper;

    @GetMapping("/list")
    public Result<List<Ledger>> list(@RequestParam(required = false) String warehouseId,
                                     @RequestParam(required = false) String productId) {
        LambdaQueryWrapper<Ledger> qw = new LambdaQueryWrapper<>();
        if (warehouseId != null && !warehouseId.isEmpty()) {
            qw.eq(Ledger::getWarehouseId, warehouseId);
        }
        if (productId != null && !productId.isEmpty()) {
            qw.eq(Ledger::getProductId, productId);
        }
        qw.orderByDesc(Ledger::getCreatedAt);
        List<Ledger> list = ledgerMapper.selectList(qw);
        return Result.ok(list);
    }
}
