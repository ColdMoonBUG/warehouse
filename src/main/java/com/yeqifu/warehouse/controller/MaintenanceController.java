package com.yeqifu.warehouse.controller;

import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.common.RuntimeModeManager;
import com.yeqifu.warehouse.entity.Warehouse;
import com.yeqifu.warehouse.mapper.WarehouseMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpSession;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/maintenance")
public class MaintenanceController {

    private static final String[] CLEAR_TABLES = {
            "wh_outbound_line",
            "wh_outbound_doc",
            "wh_return_line",
            "wh_return_doc",
            "wh_sale_line",
            "wh_sale_doc",
            "wh_transfer_line",
            "wh_transfer_doc",
            "wh_inbound_line",
            "wh_inbound_doc",
            "wh_ledger",
            "wh_stock",
            "wh_commission_ledger",
            "wh_commission_settlement"
    };

    // 仅清库存相关数据，保留销单/退单/提成记录
    private static final String[] CLEAR_STOCK_ONLY_TABLES = {
            "wh_transfer_line",
            "wh_transfer_doc",
            "wh_inbound_line",
            "wh_inbound_doc",
            "wh_ledger",
            "wh_stock",
    };

    @Autowired
    private RuntimeModeManager runtimeModeManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private WarehouseMapper warehouseMapper;

    @GetMapping("/state")
    public Result<RuntimeModeManager.RuntimeState> state(HttpSession session) {
        if (!isAdmin(session)) return Result.error("仅管理员可操作");
        return Result.ok(runtimeModeManager.getState());
    }

    @PostMapping("/mode/test")
    public Result<RuntimeModeManager.RuntimeState> switchToTest(HttpSession session) {
        if (!isAdmin(session)) return Result.error("仅管理员可操作");
        return Result.ok(runtimeModeManager.switchMode(RuntimeModeManager.MODE_TEST, currentOperator(session)));
    }

    @PostMapping("/mode/live")
    public Result<RuntimeModeManager.RuntimeState> switchToLive(HttpSession session) {
        if (!isAdmin(session)) return Result.error("仅管理员可操作");
        return Result.ok(runtimeModeManager.switchMode(RuntimeModeManager.MODE_LIVE, currentOperator(session)));
    }

    @PostMapping("/mode/init/enable")
    public Result<RuntimeModeManager.RuntimeState> enableInitMode(HttpSession session) {
        if (!isAdmin(session)) return Result.error("仅管理员可操作");
        return Result.ok(runtimeModeManager.enableInitMode(currentOperator(session)));
    }

    @PostMapping("/mode/init/disable")
    public Result<RuntimeModeManager.RuntimeState> disableInitMode(HttpSession session) {
        if (!isAdmin(session)) return Result.error("仅管理员可操作");
        return Result.ok(runtimeModeManager.disableInitMode(currentOperator(session)));
    }

    @PostMapping("/reset")
    @Transactional
    public Result<Map<String, Object>> resetBusinessData(HttpSession session) {
        if (!isAdmin(session)) return Result.error("仅管理员可操作");

        Map<String, Integer> tableRows = new LinkedHashMap<>();
        int deletedRows = 0;
        for (String table : CLEAR_TABLES) {
            int affected = jdbcTemplate.update("DELETE FROM " + table);
            tableRows.put(table, affected);
            deletedRows += affected;
        }

        int deletedWarehouses = jdbcTemplate.update("DELETE FROM wh_warehouse");
        tableRows.put("wh_warehouse", deletedWarehouses);
        deletedRows += deletedWarehouses;

        rebuildStandardWarehouses();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("deletedRows", deletedRows);
        data.put("tableRows", tableRows);
        data.put("rebuiltWarehouses", 5);
        data.put("state", runtimeModeManager.markReset(currentOperator(session)));
        return Result.ok(data);
    }

    /**
     * 仅清库存：删除入库单、出库单（调拨）、台账、库存、重建仓库
     * 保留：销单、退单、提成流水、结清记录
     */
    @PostMapping("/reset-stock-only")
    @Transactional
    public Result<Map<String, Object>> resetStockOnly(HttpSession session) {
        if (!isAdmin(session)) return Result.error("仅管理员可操作");

        Map<String, Integer> tableRows = new LinkedHashMap<>();
        int deletedRows = 0;
        for (String table : CLEAR_STOCK_ONLY_TABLES) {
            int affected = jdbcTemplate.update("DELETE FROM " + table);
            tableRows.put(table, affected);
            deletedRows += affected;
        }

        // 重建仓库（不删仓库表，只清库存记录即可，这里幂等重建）
        // 仓库本身不删，仅确保标准仓库存在
        ensureStandardWarehouses();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("deletedRows", deletedRows);
        data.put("tableRows", tableRows);
        data.put("rebuiltWarehouses", 0);
        data.put("note", "销单、退单、提成记录已保留");
        data.put("state", runtimeModeManager.markReset(currentOperator(session)));
        return Result.ok(data);
    }

    private void ensureStandardWarehouses() {
        ensureWarehouse("main", "主仓库", "main", null);
        ensureWarehouse("return", "退货仓库", "return", null);
        ensureWarehouse("veh_sp_big", "大车(车库)", "vehicle", "sp_big");
        ensureWarehouse("veh_sp_small", "小车(车库)", "vehicle", "sp_small");
        ensureWarehouse("veh_sp_third", "三车(车库)", "vehicle", "sp_third");
    }

    private void ensureWarehouse(String id, String name, String type, String salespersonId) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM wh_warehouse WHERE id = ?", Integer.class, id);
        if (count == null || count == 0) {
            insertWarehouse(id, name, type, salespersonId);
        }
    }

    private void rebuildStandardWarehouses() {
        insertWarehouse("main", "主仓库", "main", null);
        insertWarehouse("return", "退货仓库", "return", null);
        insertWarehouse("veh_sp_big", "大车(车库)", "vehicle", "sp_big");
        insertWarehouse("veh_sp_small", "小车(车库)", "vehicle", "sp_small");
        insertWarehouse("veh_sp_third", "三车(车库)", "vehicle", "sp_third");
    }

    private void insertWarehouse(String id, String name, String type, String salespersonId) {
        Warehouse warehouse = new Warehouse();
        warehouse.setId(id);
        warehouse.setName(name);
        warehouse.setType(type);
        warehouse.setSalespersonId(salespersonId);
        warehouse.setCreatedAt(new Date());
        warehouseMapper.insert(warehouse);
    }

    private boolean isAdmin(HttpSession session) {
        return "admin".equals(session.getAttribute("warehouseAccountRole"));
    }

    private String currentOperator(HttpSession session) {
        Object name = session.getAttribute("warehouseAccountName");
        return name instanceof String && !((String) name).trim().isEmpty() ? (String) name : "管理员";
    }
}
