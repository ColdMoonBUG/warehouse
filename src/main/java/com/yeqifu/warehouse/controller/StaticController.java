package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.StaticJson;
import com.yeqifu.warehouse.mapper.StaticJsonMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.Date;

@RestController
@RequestMapping("/api/static")
@CrossOrigin
public class StaticController {

    @Autowired
    private StaticJsonMapper staticJsonMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping("/navs")
    public Object navs() throws Exception {
        String json = loadJson("navs", "static/resources/json/navs.json");
        return objectMapper.readValue(json, new TypeReference<Object>() {});
    }

    @GetMapping("/systemParameter")
    public Object systemParameter() throws Exception {
        String json = loadJson("systemParameter", "static/resources/json/systemParameter.json");
        return objectMapper.readValue(json, new TypeReference<Object>() {});
    }

    @GetMapping("/newsList")
    public Object newsList() throws Exception {
        String json = loadJson("newsList", "static/resources/json/newsList.json");
        return objectMapper.readValue(json, new TypeReference<Object>() {});
    }

    @GetMapping("/userList")
    public Object userList() throws Exception {
        String json = loadJson("userList", "static/resources/json/userList.json");
        return objectMapper.readValue(json, new TypeReference<Object>() {});
    }

    @GetMapping("/images")
    public Object images() throws Exception {
        String json = loadJson("images", "static/resources/json/images.json");
        return objectMapper.readValue(json, new TypeReference<Object>() {});
    }

    @GetMapping("/health")
    public Result<String> health() {
        return Result.ok("UP");
    }

    @GetMapping("/address")
    public Object address() throws Exception {
        String json = loadJson("address", "static/resources/json/address.json");
        return objectMapper.readValue(json, new TypeReference<Object>() {});
    }

    private String loadJson(String key, String classpath) throws Exception {
        StaticJson record = staticJsonMapper.selectOne(
            new LambdaQueryWrapper<StaticJson>().eq(StaticJson::getJsonKey, key)
        );
        if (record != null && record.getContent() != null) {
            return record.getContent();
        }
        ClassPathResource res = new ClassPathResource(classpath);
        String content = StreamUtils.copyToString(res.getInputStream(), StandardCharsets.UTF_8);
        StaticJson save = new StaticJson();
        save.setJsonKey(key);
        save.setContent(content);
        save.setUpdatedAt(new Date());
        staticJsonMapper.insert(save);
        return content;
    }
}
