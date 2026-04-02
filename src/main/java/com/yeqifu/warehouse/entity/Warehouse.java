package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.util.Date;

@Data
@TableName("wh_warehouse")
public class Warehouse implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String name;
    private String type; // main/vehicle
    @TableField("salesperson_id")
    private String salespersonId;
    private Date createdAt;
}
