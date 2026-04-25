package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.common.RuntimeModeManager;
import com.yeqifu.warehouse.entity.Product;
import com.yeqifu.warehouse.entity.Stock;
import com.yeqifu.warehouse.entity.Warehouse;
import com.yeqifu.warehouse.mapper.ProductMapper;
import com.yeqifu.warehouse.mapper.StockMapper;
import com.yeqifu.warehouse.mapper.WarehouseMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpSession;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@RestController
@RequestMapping("/api/stock")
public class StockController {

    @Autowired
    private StockMapper stockMapper;

    @Autowired
    private WarehouseMapper warehouseMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private RuntimeModeManager runtimeModeManager;

    @GetMapping("/list")
    public Result<List<Stock>> list(@RequestParam(required = false) String warehouseId, HttpSession session) {
        Object role = session.getAttribute("warehouseAccountRole");
        Object accountId = session.getAttribute("warehouseAccountId");
        String salespersonId = "salesperson".equals(role) && accountId instanceof String ? (String) accountId : "";

        List<Warehouse> visibleWarehouses = resolveVisibleWarehouses(warehouseId, role, salespersonId);
        if (runtimeModeManager.isTestMode()) {
            return Result.ok(buildUnlimitedStocks(visibleWarehouses));
        }

        LambdaQueryWrapper<Stock> query = new LambdaQueryWrapper<>();
        if (warehouseId != null && !warehouseId.isEmpty()) {
            query.eq(Stock::getWarehouseId, warehouseId);
        }
        List<Stock> list = stockMapper.selectList(query);
        if (!"salesperson".equals(role) || salespersonId.isEmpty()) {
            return Result.ok(list);
        }

        List<Stock> filtered = new ArrayList<>();
        for (Stock item : list) {
            if (item == null || item.getWarehouseId() == null || item.getWarehouseId().isEmpty()) {
                continue;
            }
            Warehouse warehouse = warehouseMapper.selectById(item.getWarehouseId());
            if (warehouse == null) {
                continue;
            }
            if ("main".equals(warehouse.getType()) || "return".equals(warehouse.getType())) {
                filtered.add(item);
                continue;
            }
            if ("vehicle".equals(warehouse.getType()) && salespersonId.equals(warehouse.getSalespersonId())) {
                filtered.add(item);
            }
        }
        return Result.ok(filtered);
    }

    private List<Warehouse> resolveVisibleWarehouses(String warehouseId, Object role, String salespersonId) {
        List<Warehouse> warehouses = warehouseMapper.selectList(new LambdaQueryWrapper<Warehouse>().orderByAsc(Warehouse::getCreatedAt));
        List<Warehouse> filtered = new ArrayList<>();
        for (Warehouse warehouse : warehouses) {
            if (warehouse == null || warehouse.getId() == null || warehouse.getId().isEmpty()) {
                continue;
            }
            if (warehouseId != null && !warehouseId.isEmpty() && !warehouseId.equals(warehouse.getId())) {
                continue;
            }
            if (!"salesperson".equals(role) || salespersonId.isEmpty()) {
                filtered.add(warehouse);
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
        return filtered;
    }

    private List<Stock> buildUnlimitedStocks(List<Warehouse> warehouses) {
        List<Stock> stocks = new ArrayList<>();
        if (warehouses.isEmpty()) {
            return stocks;
        }
        List<Product> products = productMapper.selectList(new LambdaQueryWrapper<Product>()
                .eq(Product::getStatus, "active")
                .orderByAsc(Product::getCreatedAt));
        Date now = new Date();
        for (Warehouse warehouse : warehouses) {
            for (Product product : products) {
                Stock stock = new Stock();
                stock.setWarehouseId(warehouse.getId());
                stock.setProductId(product.getId());
                stock.setQty(runtimeModeManager.getUnlimitedQty());
                stock.setUpdatedAt(now);
                stocks.add(stock);
            }
        }
        return stocks;
    }
}
