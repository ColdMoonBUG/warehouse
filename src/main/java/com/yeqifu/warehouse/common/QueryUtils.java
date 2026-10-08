package com.yeqifu.warehouse.common;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

public final class QueryUtils {

    private static final Pattern CLIENT_ID = Pattern.compile("^[A-Za-z0-9_-]{6,32}$");

    private QueryUtils() {
    }

    public static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    public static java.sql.Date parseDate(String value, String name) {
        if (!hasText(value)) {
            return null;
        }
        try {
            return java.sql.Date.valueOf(LocalDate.parse(value.trim()));
        } catch (DateTimeParseException e) {
            throw new BizException(name + "格式应为 yyyy-MM-dd");
        }
    }

    public static List<String> csv(String value) {
        if (!hasText(value)) {
            return Collections.emptyList();
        }
        List<String> list = new ArrayList<>();
        for (String part : value.split(",")) {
            if (hasText(part)) {
                list.add(part.trim());
            }
        }
        return list;
    }

    /** 按空白拆分搜索词，最多取 5 个，避免拼出过长的 SQL。 */
    public static List<String> tokens(String keyword) {
        if (!hasText(keyword)) {
            return Collections.emptyList();
        }
        List<String> list = new ArrayList<>();
        for (String part : keyword.trim().split("\\s+")) {
            if (!part.isEmpty() && list.size() < 5) {
                list.add(part.length() > 50 ? part.substring(0, 50) : part);
            }
        }
        return list;
    }

    /** LIKE '%token%' 参数，转义通配符，使用户输入的 % _ 按字面匹配。 */
    public static String likeContains(String token) {
        String escaped = token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }

    public static int clamp(Integer value, int defaultValue, int min, int max) {
        int v = value == null ? defaultValue : value;
        return Math.max(min, Math.min(max, v));
    }

    public static boolean isValidClientId(String id) {
        return id != null && CLIENT_ID.matcher(id).matches();
    }
}
