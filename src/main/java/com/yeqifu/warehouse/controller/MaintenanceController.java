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
