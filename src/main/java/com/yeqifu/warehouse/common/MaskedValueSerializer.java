package com.yeqifu.warehouse.common;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;

/**
 * 敏感字段只告诉前端“有没有设置”，不输出真实值（旧版前端只判断该字段是否为空）。
 */
public class MaskedValueSerializer extends JsonSerializer<String> {

    public static final String MASK = "******";

    @Override
    public void serialize(String value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
        if (value == null || value.isEmpty()) {
            gen.writeNull();
        } else {
            gen.writeString(MASK);
        }
    }
}
