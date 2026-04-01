package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

@Data
@TableName("wh_store")
public class Store implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String code;
    private String name;
    private String address;
    private String defaultEmployeeId;
    private BigDecimal lat;
    private BigDecimal lng;
    private Integer scale;
    private String status;
    private Date createdAt;
    private Date updatedAt;
}
