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

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

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

    /**
     * 合并门店：将 sourceId 的历史销单/退单归属到 targetId，然后删除 sourceId
     */
    @PostMapping("/merge")
    @org.springframework.transaction.annotation.Transactional
    public Result<Void> merge(@RequestBody java.util.Map<String, String> body) {
        String sourceId = body.get("sourceId");
        String targetId = body.get("targetId");
        if (sourceId == null || targetId == null || sourceId.equals(targetId)) {
            return Result.error("参数错误");
        }
        Store source = storeMapper.selectById(sourceId);
        Store target = storeMapper.selectById(targetId);
        if (source == null || target == null) {
            return Result.error("门店不存在");
        }
        org.springframework.jdbc.core.JdbcTemplate jdbc = jdbcTemplate;
        // 将销单的 store_id 更新到目标门店
        jdbc.update("UPDATE wh_sale_doc SET store_id = ? WHERE store_id = ?", targetId, sourceId);
        // 将退单的 store_id 更新到目标门店
        jdbc.update("UPDATE wh_return_doc SET store_id = ? WHERE store_id = ?", targetId, sourceId);
        // 将提成流水的 store_id 更新到目标门店
        jdbc.update("UPDATE wh_commission_ledger SET store_id = ? WHERE store_id = ?", targetId, sourceId);
        // 删除源门店
        storeMapper.deleteById(sourceId);
        return Result.ok();
    }
}
