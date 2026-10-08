package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.yeqifu.warehouse.common.MaskedValueSerializer;
import lombok.Data;
import java.io.Serializable;
import java.util.Date;

@Data
@TableName("wh_account")
public class Account implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String username;
    private String displayName;
    private String role;
    // 登录接口直接比对哈希，返回给前端就等于泄露登录凭证：只接收、不输出
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String passwordHash;
    @JsonSerialize(using = MaskedValueSerializer.class)
    private String gestureHash;
    private String status;
    private Date createdAt;
    private Date updatedAt;

    public String getSalespersonId() {
        return "salesperson".equals(role) ? id : null;
    }

    public void setSalespersonId(String salespersonId) {
    }
}
