package com.yeqifu.warehouse.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yeqifu.warehouse.entity.StaticJson;
import com.yeqifu.warehouse.mapper.StaticJsonMapper;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.text.SimpleDateFormat;
import java.util.Date;

@Component
public class RuntimeModeManager {

    public static final String MODE_TEST = "TEST";
    public static final String MODE_LIVE = "LIVE";
    public static final int UNLIMITED_QTY = 999999;
    private static final String CONFIG_KEY = "warehouseRuntimeConfig";
    private static final String DATETIME_PATTERN = "yyyy-MM-dd HH:mm:ss";

    @Autowired
    private StaticJsonMapper staticJsonMapper;

    @Autowired
    private ObjectMapper objectMapper;

    public RuntimeState getState() {
        StaticJson record = staticJsonMapper.selectById(CONFIG_KEY);
        if (record == null || record.getContent() == null || record.getContent().trim().isEmpty()) {
            return defaultState();
        }
        try {
            RuntimeState state = objectMapper.readValue(record.getContent(), RuntimeState.class);
            if (state.getMode() == null || state.getMode().trim().isEmpty()) {
                state.setMode(MODE_LIVE);
            }
            return state;
        } catch (Exception ignored) {
            return defaultState();
        }
    }

    public RuntimeState switchMode(String mode, String updatedBy) {
        RuntimeState state = getState();
        state.setMode(normalizeMode(mode));
        state.setUpdatedAt(nowText());
        state.setUpdatedBy(updatedBy);
        saveState(state);
        return state;
    }

    public RuntimeState markReset(String updatedBy) {
        RuntimeState state = getState();
        String now = nowText();
        state.setLastResetAt(now);
        state.setLastResetBy(updatedBy);
        state.setUpdatedAt(now);
        state.setUpdatedBy(updatedBy);
        saveState(state);
        return state;
    }

    public boolean isTestMode() {
        return MODE_TEST.equalsIgnoreCase(getState().getMode());
    }

    public boolean useUnlimitedInventory(String warehouseId) {
        return isTestMode() && warehouseId != null && !warehouseId.trim().isEmpty();
    }

    /** 初始化模式：出库单过账只给目标仓加库存，不扣来源仓（用于盘点初始化） */
    public boolean isInitMode() {
        RuntimeState state = getState();
        return Boolean.TRUE.equals(state.getInitMode());
    }

    public RuntimeState enableInitMode(String updatedBy) {
        RuntimeState state = getState();
        state.setInitMode(true);
        state.setUpdatedAt(nowText());
        state.setUpdatedBy(updatedBy);
        saveState(state);
        return state;
    }

    public RuntimeState disableInitMode(String updatedBy) {
        RuntimeState state = getState();
        state.setInitMode(false);
        state.setUpdatedAt(nowText());
        state.setUpdatedBy(updatedBy);
        saveState(state);
        return state;
    }

    public int getUnlimitedQty() {
        return UNLIMITED_QTY;
    }

    private void saveState(RuntimeState state) {
        try {
            StaticJson record = staticJsonMapper.selectById(CONFIG_KEY);
            if (record == null) {
                record = new StaticJson();
                record.setJsonKey(CONFIG_KEY);
            }
            record.setContent(objectMapper.writeValueAsString(state));
            record.setUpdatedAt(new Date());
            if (staticJsonMapper.selectById(CONFIG_KEY) == null) {
                staticJsonMapper.insert(record);
            } else {
                staticJsonMapper.updateById(record);
            }
        } catch (Exception e) {
            throw new RuntimeException("保存运行模式失败", e);
        }
    }

    private RuntimeState defaultState() {
        RuntimeState state = new RuntimeState();
        state.setMode(MODE_LIVE);
        return state;
    }

    private String normalizeMode(String mode) {
        return MODE_TEST.equalsIgnoreCase(mode) ? MODE_TEST : MODE_LIVE;
    }

    private String nowText() {
        return new SimpleDateFormat(DATETIME_PATTERN).format(new Date());
    }

    @Data
    public static class RuntimeState {
        private String mode;
        private String updatedAt;
        private String updatedBy;
        private String lastResetAt;
        private String lastResetBy;
        private Boolean initMode;  // 初始化模式：出库只加目标仓，不扣来源仓
    }
}
