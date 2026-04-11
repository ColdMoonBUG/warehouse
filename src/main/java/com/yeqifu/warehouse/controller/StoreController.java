package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Store;
import com.yeqifu.warehouse.mapper.StoreMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/store")
public class StoreController {

    @Autowired
    private StoreMapper storeMapper;

    @GetMapping("/list")
    public Result<List<Store>> list() {
        List<Store> list = storeMapper.selectList(
            new LambdaQueryWrapper<Store>().eq(Store::getStatus, "active")
        );
        return Result.ok(list);
    }

    @GetMapping("/listAll")
    public Result<List<Store>> listAll() {
        List<Store> list = storeMapper.selectList(new LambdaQueryWrapper<Store>().orderByDesc(Store::getCreatedAt));
        return Result.ok(list);
    }

    @PostMapping("/save")
    public Result<Void> save(@RequestBody Store store) {
        if (store.getId() == null || store.getId().isEmpty()) {
            store.setId(com.yeqifu.warehouse.common.IdUtils.randomId());
            if (store.getStatus() == null || store.getStatus().isEmpty()) {
                store.setStatus("active");
            }
            storeMapper.insert(store);
        } else {
            storeMapper.updateById(store);
        }
        return Result.ok();
    }

    @PostMapping("/toggle/{id}")
    public Result<Void> toggle(@PathVariable String id) {
        Store store = storeMapper.selectById(id);
        if (store != null) {
            store.setStatus("active".equals(store.getStatus()) ? "inactive" : "active");
            storeMapper.updateById(store);
        }
        return Result.ok();
    }

    @PostMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable String id) {
        storeMapper.deleteById(id);
        return Result.ok();
    }
}
