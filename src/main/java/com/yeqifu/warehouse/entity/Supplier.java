package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.util.Date;

@Data
@TableName("wh_supplier")
public class Supplier implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String code;
    private String name;
    private String contact;
    private String phone;
    private String address;
    private String status;
    private Date createdAt;
    private Date updatedAt;
}
