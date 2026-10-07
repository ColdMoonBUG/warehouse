package com.yeqifu.warehouse.common;

import net.sourceforge.pinyin4j.PinyinHelper;
import net.sourceforge.pinyin4j.format.HanyuPinyinCaseType;
import net.sourceforge.pinyin4j.format.HanyuPinyinOutputFormat;
import net.sourceforge.pinyin4j.format.HanyuPinyinToneType;
import net.sourceforge.pinyin4j.format.HanyuPinyinVCharType;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * 中文名称的拼音匹配：支持首字母（如 “hyc” 匹配 “华艺超市”）和全拼。
 */
public final class PinyinMatcher {

    private static final Pattern LETTERS = Pattern.compile("^[a-zA-Z]{2,}$");
    private static final Map<String, String[]> CACHE = new ConcurrentHashMap<>();

    private PinyinMatcher() {
    }

    /** 只有纯字母、至少两个字符的搜索词才走拼音匹配，避免单字母误命中大量记录。 */
    public static boolean isPinyinToken(String token) {
        return token != null && LETTERS.matcher(token).matches();
    }

    public static boolean matches(String name, String token) {
        if (name == null || name.isEmpty() || !isPinyinToken(token)) {
            return false;
        }
        String t = token.toLowerCase();
        String[] forms = CACHE.computeIfAbsent(name, PinyinMatcher::toForms);
        return forms[0].contains(t) || forms[1].contains(t);
    }

    private static String[] toForms(String name) {
        HanyuPinyinOutputFormat format = new HanyuPinyinOutputFormat();
        format.setCaseType(HanyuPinyinCaseType.LOWERCASE);
        format.setToneType(HanyuPinyinToneType.WITHOUT_TONE);
        format.setVCharType(HanyuPinyinVCharType.WITH_V);
        StringBuilder initials = new StringBuilder();
        StringBuilder full = new StringBuilder();
        for (char c : name.toCharArray()) {
            String[] py = null;
            if (c >= 0x4E00 && c <= 0x9FA5) {
                try {
                    py = PinyinHelper.toHanyuPinyinStringArray(c, format);
                } catch (Exception ignored) {
                    py = null;
                }
            }
            if (py != null && py.length > 0 && !py[0].isEmpty()) {
                initials.append(py[0].charAt(0));
                full.append(py[0]);
            } else if (Character.isLetterOrDigit(c)) {
                char lower = Character.toLowerCase(c);
                initials.append(lower);
                full.append(lower);
            }
        }
        return new String[]{initials.toString(), full.toString()};
    }
}
