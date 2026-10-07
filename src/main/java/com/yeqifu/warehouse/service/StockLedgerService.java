package com.yeqifu.warehouse.service;

import com.yeqifu.warehouse.common.BizException;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.RuntimeModeManager;
import com.yeqifu.warehouse.entity.Ledger;
import com.yeqifu.warehouse.mapper.LedgerMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 库存增减与库存流水。所有单据过账/作废都走这里。
 */
@Service
public class StockLedgerService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private LedgerMapper ledgerMapper;

    @Autowired
    private RuntimeModeManager runtimeModeManager;

    /**
     * 原子地增减库存：并发过账同一仓库同一商品时，旧的“先读再写绝对值”会丢失其中一笔扣减，
     * 这里直接在数据库里做 qty = qty + delta，并保证结果不为负。
     */
    public void applyStockDelta(String warehouseId, String productId, Integer delta) {
        if (runtimeModeManager.useUnlimitedInventory(warehouseId)) {
            return;
        }
        int d = delta == null ? 0 : delta;
        int updated = jdbcTemplate.update(
            "UPDATE wh_stock SET qty = qty + ? WHERE warehouse_id = ? AND product_id = ? AND qty + ? >= 0",
            d, warehouseId, productId, d);
        if (updated > 0) {
            return;
        }
        List<Integer> current = jdbcTemplate.queryForList(
            "SELECT qty FROM wh_stock WHERE warehouse_id = ? AND product_id = ? FOR UPDATE",
            Integer.class, warehouseId, productId);
        if (!current.isEmpty() || d < 0) {
            throw new BizException("库存不足");
        }
        jdbcTemplate.update(
            "INSERT INTO wh_stock (warehouse_id, product_id, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)",
            warehouseId, productId, d);
    }

    public void insertLedger(String bizType, String docId, String warehouseId, String productId, Integer qty) {
        Ledger ledger = new Ledger();
        ledger.setId(IdUtils.randomId());
        ledger.setBizType(bizType);
        ledger.setDocId(docId);
        ledger.setWarehouseId(warehouseId);
        ledger.setProductId(productId);
        ledger.setQty(qty);
        ledgerMapper.insert(ledger);
    }
}
