package com.yeqifu.warehouse.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS 跨域配置
 * 允许前端携带 Cookie（JSESSIONID）进行跨域请求
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                // 允许的来源（开发环境，生产环境建议指定具体域名）
                .allowedOrigins(
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "http://home.lyhc.top:5173",
                    "http://home.lyhc.top:8888"
                )
                // 允许的 HTTP 方法
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                // 允许的请求头
                .allowedHeaders("*")
                // 允许携带凭证（Cookie）
                .allowCredentials(true)
                // 预检请求缓存时间（秒）
                .maxAge(3600);
    }
}
