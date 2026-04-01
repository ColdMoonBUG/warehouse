package com.yeqifu.warehouse.common;

import java.util.UUID;

/**
 * ID生成工具类
 */
public class IdUtils {
    
    public static String randomId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 32);
    }
    
    public static String genCode(String prefix) {
        return prefix + System.currentTimeMillis();
    }
}
