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
        
        // 测试模式：所有仓库显示无限库存
        if (runtimeModeManager.isTestMode()) {
            return Result.ok(buildUnlimitedStocks(visibleWarehouses));
        }
        
        // 车库无限模式：仅车库显示无限库存
        if (runtimeModeManager.isVehicleUnlimitedMode()) {
            return Result.ok(buildMixedStocks(visibleWarehouses, salespersonId));
        }

        // 正常模式：查询真实库存
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

    /**
     * 车库无限模式：车库显示无限库存，主仓/退货仓显示真实库存
     */
    private List<Stock> buildMixedStocks(List<Warehouse> warehouses, String salespersonId) {
        List<Stock> stocks = new ArrayList<>();
        if (warehouses.isEmpty()) {
            return stocks;
        }
        
        List<Product> products = productMapper.selectList(new LambdaQueryWrapper<Product>()
                .eq(Product::getStatus, "active")
                .orderByAsc(Product::getCreatedAt));
        Date now = new Date();
        
        // 分离车库和非车库仓库
        List<Warehouse> vehicleWarehouses = new ArrayList<>();
        List<Warehouse> normalWarehouses = new ArrayList<>();
        for (Warehouse wh : warehouses) {
            if ("vehicle".equals(wh.getType())) {
                vehicleWarehouses.add(wh);
            } else {
                normalWarehouses.add(wh);
            }
        }
        
        // 车库：显示无限库存
        for (Warehouse warehouse : vehicleWarehouses) {
            for (Product product : products) {
                Stock stock = new Stock();
                stock.setWarehouseId(warehouse.getId());
                stock.setProductId(product.getId());
                stock.setQty(runtimeModeManager.getUnlimitedQty());
                stock.setUpdatedAt(now);
                stocks.add(stock);
            }
        }
        
        // 非车库（主仓/退货仓）：查询真实库存
        for (Warehouse warehouse : normalWarehouses) {
            List<Stock> realStocks = stockMapper.selectList(
                new LambdaQueryWrapper<Stock>().eq(Stock::getWarehouseId, warehouse.getId())
            );
            for (Product product : products) {
                Stock stock = new Stock();
                stock.setWarehouseId(warehouse.getId());
                stock.setProductId(product.getId());
                // 查找真实库存，没有则显示0
                int qty = 0;
                for (Stock s : realStocks) {
                    if (product.getId().equals(s.getProductId())) {
                        qty = s.getQty();
                        break;
                    }
                }
                stock.setQty(qty);
                stock.setUpdatedAt(now);
                stocks.add(stock);
            }
        }
        
        return stocks;
    }
}
