package com.yeqifu.warehouse.controller;

import com.yeqifu.warehouse.common.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * 测试/维护工具接口 —— 仅供管理员使用。
 *
 * 提供：
 *   1. 一键填满业务员车库库存
 *   2. 一键清空业务数据（销单/退单/入库/出库/调拨/库存/台账/提成），自动保留基础资料
 *   3. 全量备份 / 定时备份 / 备份文件列表
 *
 * 明确保留：wh_store（超市）、wh_product（商品）、wh_supplier（供应商）、
 *         wh_warehouse（仓库定义）、wh_account（账户）、wh_static_json（静态配置）
 */
@RestController
@RequestMapping("/api/test")
public class TestToolController {
    private static final Logger log = LoggerFactory.getLogger(TestToolController.class);

    @Autowired
    private JdbcTemplate jdbc;

    @Value("${app.backup-dir:./backup}")
    private String backupDir;

    /** 需要清空的业务数据表，顺序是"先明细后主表"以避免外键/逻辑冲突 */
    private static final String[] CLEAR_TABLES = {
        "wh_sale_line", "wh_sale_doc",
        "wh_return_line", "wh_return_doc",
        "wh_inbound_line", "wh_inbound_doc",
        "wh_transfer_line", "wh_transfer_doc",
        "wh_outbound_line", "wh_outbound_doc",
        "wh_stock",
        "wh_ledger",
        "wh_commission_ledger",
        "wh_commission_settlement",
    };

    /** 全量备份的表（含基础资料），按恢复时的插入顺序排列 */
    private static final String[] FULL_BACKUP_TABLES = {
        "wh_account",
        "wh_supplier",
        "wh_product",
        "wh_store",
        "wh_warehouse",
        "wh_static_json",
        "wh_inbound_doc", "wh_inbound_line",
        "wh_transfer_doc", "wh_transfer_line",
        "wh_outbound_doc", "wh_outbound_line",
        "wh_sale_doc", "wh_sale_line",
        "wh_return_doc", "wh_return_line",
        "wh_stock",
        "wh_ledger",
        "wh_commission_ledger",
        "wh_commission_settlement",
    };

    // ============================================================
    // 1. 一键填满业务员车库库存
    // ============================================================
    @PostMapping("/fill-vehicle-stock")
    public Result<Map<String, Object>> fillVehicleStock(@RequestParam(defaultValue = "999999") int qty) {
        int rows = jdbc.update(
            "INSERT INTO wh_stock (warehouse_id, product_id, qty) " +
            "SELECT w.id, p.id, ? FROM wh_warehouse w CROSS JOIN wh_product p " +
            "WHERE w.type = 'vehicle' AND p.status = 'active' " +
            "ON DUPLICATE KEY UPDATE qty = VALUES(qty)",
            qty);
        List<Map<String, Object>> summary = jdbc.queryForList(
            "SELECT w.name AS name, COUNT(s.product_id) AS productCount, COALESCE(SUM(s.qty), 0) AS totalQty " +
            "FROM wh_warehouse w LEFT JOIN wh_stock s ON s.warehouse_id = w.id " +
            "WHERE w.type = 'vehicle' GROUP BY w.id, w.name ORDER BY w.name");
        Map<String, Object> data = new HashMap<>();
        data.put("affected", rows);
        data.put("perQty", qty);
        data.put("summary", summary);
        return Result.ok(data);
    }

    // ============================================================
    // 2. 一键清空业务数据（先自动备份）
    // ============================================================
    @PostMapping("/clear-business-data")
    @Transactional
    public Result<Map<String, Object>> clearBusinessData() throws IOException {
        String filename = "pre_clear_" + timestamp() + ".sql";
        File backupFile = new File(resolveBackupDir(), filename);
        exportTables(backupFile, CLEAR_TABLES);

        int totalDeleted = 0;
        Map<String, Integer> tableRows = new LinkedHashMap<>();
        for (String table : CLEAR_TABLES) {
            int deleted = jdbc.update("DELETE FROM " + table);
            tableRows.put(table, deleted);
            totalDeleted += deleted;
        }

        Map<String, Object> data = new HashMap<>();
        data.put("backupFile", filename);
        data.put("backupSize", backupFile.length());
        data.put("deletedRows", totalDeleted);
        data.put("tableRows", tableRows);
        return Result.ok(data);
    }

    // ============================================================
    // 3. 列出备份文件
    // ============================================================
    @GetMapping("/backups")
    public Result<List<Map<String, Object>>> listBackups() {
        File dir = resolveBackupDir();
        File[] files = dir.listFiles((f, name) -> name.endsWith(".sql"));
        List<Map<String, Object>> list = new ArrayList<>();
        if (files != null) {
            Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (File f : files) {
                Map<String, Object> m = new HashMap<>();
                m.put("filename", f.getName());
                m.put("size", f.length());
                m.put("modifiedAt", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date(f.lastModified())));
                list.add(m);
            }
        }
        return Result.ok(list);
    }

    // ============================================================
    // 4. 手动全量备份
    // ============================================================
    @PostMapping("/backup-now")
    public Result<Map<String, Object>> backupNow() throws IOException {
        String filename = "full_" + timestamp() + ".sql";
        File backupFile = new File(resolveBackupDir(), filename);
        exportTables(backupFile, FULL_BACKUP_TABLES);
        Map<String, Object> data = new HashMap<>();
        data.put("filename", filename);
        data.put("size", backupFile.length());
        return Result.ok(data);
    }

    // ============================================================
    // 5. 定时自动备份：每天凌晨 2 点
    // ============================================================
    @Scheduled(cron = "0 0 2 * * ?")
    public void scheduledBackup() {
        try {
            File dir = resolveBackupDir();
            File backupFile = new File(dir, "auto_" + timestamp() + ".sql");
            exportTables(backupFile, FULL_BACKUP_TABLES);
            cleanOldAutoBackups(dir, 30);
            log.info("[定时备份] 完成: {} ({} bytes)", backupFile.getName(), backupFile.length());
        } catch (Exception e) {
            log.error("[定时备份] 失败", e);
        }
    }

    private void cleanOldAutoBackups(File dir, int keep) {
        File[] autos = dir.listFiles((f, name) -> name.startsWith("auto_") && name.endsWith(".sql"));
        if (autos == null || autos.length <= keep) return;
        Arrays.sort(autos, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        for (int i = keep; i < autos.length; i++) {
            if (!autos[i].delete()) {
                log.warn("[定时备份] 清理旧文件失败: {}", autos[i].getName());
            }
        }
    }

    // ============================================================
    // 内部工具
    // ============================================================
    private File resolveBackupDir() {
        File dir = new File(backupDir);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new RuntimeException("无法创建备份目录: " + dir.getAbsolutePath());
        }
        return dir;
    }

    private String timestamp() {
        return new SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
    }

    private void exportTables(File file, String[] tables) throws IOException {
        try (BufferedWriter out = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8))) {
            out.write("-- Warehouse backup generated at " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date()) + "\n");
            out.write("SET NAMES utf8mb4;\n");
            out.write("SET FOREIGN_KEY_CHECKS = 0;\n\n");
            for (String table : tables) {
                exportTable(out, table);
            }
            out.write("SET FOREIGN_KEY_CHECKS = 1;\n");
        }
    }

    private void exportTable(BufferedWriter out, String table) throws IOException {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM " + table);
        out.write("-- Table: " + table + " (" + rows.size() + " rows)\n");
        out.write("DELETE FROM " + table + ";\n");
        if (rows.isEmpty()) {
            out.write("\n");
            return;
        }
        List<String> columns = new ArrayList<>(rows.get(0).keySet());
        StringBuilder colSql = new StringBuilder();
        for (int i = 0; i < columns.size(); i++) {
            if (i > 0) colSql.append(", ");
            colSql.append("`").append(columns.get(i)).append("`");
        }
        for (Map<String, Object> row : rows) {
            StringBuilder vals = new StringBuilder();
            for (int i = 0; i < columns.size(); i++) {
                if (i > 0) vals.append(", ");
                vals.append(sqlLiteral(row.get(columns.get(i))));
            }
            out.write("INSERT INTO " + table + " (" + colSql + ") VALUES (" + vals + ");\n");
        }
        out.write("\n");
    }

    private String sqlLiteral(Object v) {
        if (v == null) return "NULL";
        if (v instanceof Number || v instanceof Boolean) return v.toString();
        String s;
        if (v instanceof Timestamp || v instanceof java.util.Date) {
            s = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format((java.util.Date) v);
        } else {
            s = v.toString();
        }
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
