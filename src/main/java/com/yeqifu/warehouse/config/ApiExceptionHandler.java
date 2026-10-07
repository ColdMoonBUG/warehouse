package com.yeqifu.warehouse.config;

import com.yeqifu.warehouse.common.BizException;
import com.yeqifu.warehouse.common.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import javax.servlet.http.HttpServletRequest;
import java.time.format.DateTimeParseException;
import java.util.UUID;

/**
 * /api 接口的统一异常出口：业务错误按原格式返回提示；未预期的错误带一个错误编号写日志，
 * 现场反馈时报出编号即可在 logs/warehouse.log 里定位完整堆栈。
 */
@RestControllerAdvice(basePackages = "com.yeqifu.warehouse.controller")
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(BizException.class)
    public Result<Void> handleBiz(BizException e) {
        return Result.error(e.getMessage());
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class,
        DateTimeParseException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<Result<Void>> handleBadRequest(Exception e, HttpServletRequest request) {
        log.warn("[api] 参数错误 {} {}: {}", request.getMethod(), request.getRequestURI(), e.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Result.error(400, "请求参数错误: " + e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Result<Void>> handleUnexpected(Exception e, HttpServletRequest request) {
        String errorId = UUID.randomUUID().toString().substring(0, 8);
        log.error("[api] 错误编号 {} {} {}?{}", errorId, request.getMethod(), request.getRequestURI(),
            request.getQueryString() == null ? "" : request.getQueryString(), e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(Result.error(500, "服务器内部错误（错误编号 " + errorId + "）: " + e.getMessage()));
    }
}
