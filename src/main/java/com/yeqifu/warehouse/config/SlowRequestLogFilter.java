package com.yeqifu.warehouse.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * 记录慢接口和 5xx：线上不好调试时，日志里能直接看到哪个接口、带什么参数、花了多久。
 */
@Component
public class SlowRequestLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger("api.slow");

    @Value("${app.slow-request-ms:1500}")
    private long slowMs;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long start = System.currentTimeMillis();
        try {
            chain.doFilter(request, response);
        } finally {
            long cost = System.currentTimeMillis() - start;
            int status = response.getStatus();
            if (cost >= slowMs || status >= 500) {
                Object account = request.getSession(false) == null ? null : request.getSession(false).getAttribute("warehouseAccountName");
                log.warn("{} {}{} -> {} {}ms account={}", request.getMethod(), request.getRequestURI(),
                    request.getQueryString() == null ? "" : "?" + request.getQueryString(), status, cost, account);
            }
        }
    }
}
