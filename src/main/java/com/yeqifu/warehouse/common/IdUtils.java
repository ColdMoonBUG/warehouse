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
        // 时间戳 + 3位随机数，防止同一毫秒内并发冲突
        int rand = (int)(Math.random() * 900) + 100;
        return prefix + System.currentTimeMillis() + rand;
    }
}
