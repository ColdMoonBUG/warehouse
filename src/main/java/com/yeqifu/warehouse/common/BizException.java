package com.yeqifu.warehouse.common;

/**
 * 业务校验失败。消息会原样返回给前端提示，调用方所在事务需要回滚。
 */
public class BizException extends RuntimeException {
    public BizException(String message) {
        super(message);
    }
}
