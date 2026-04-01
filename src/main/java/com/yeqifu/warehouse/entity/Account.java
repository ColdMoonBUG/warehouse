package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
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
    private String employeeId;
    private String passwordHash;
    private String gestureHash;
    private String status;
    private Date createdAt;
    private Date updatedAt;
}
