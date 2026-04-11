package com.yeqifu.warehouse.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;

/**
 * CORS 跨域配置
 * 允许前端携带 Cookie（JSESSIONID）进行跨域请求
 * 使用 CorsFilter 以支持 uni-app 原生 App（Origin 为 null）
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();

        // 允许所有来源（包括 null，适用于 uni-app 原生 App）
        config.addAllowedOrigin("http://localhost:5173");
        config.addAllowedOrigin("http://127.0.0.1:5173");
        config.addAllowedOrigin("http://home.lyhc.top:5173");
        config.addAllowedOrigin("http://home.lyhc.top:8888");
        config.addAllowedOrigin("null"); // uni-app 原生 App 的 Origin

        // 允许所有 HTTP 方法
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));

        // 允许所有请求头
        config.addAllowedHeader("*");

        // 允许携带凭证（Cookie）
        config.setAllowCredentials(true);

        // 预检请求缓存时间（秒）
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);

        return new CorsFilter(source);
    }
}
