package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

@Data
@TableName("wh_product")
public class Product implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String code;
    private String name;
    private String imageUrl;
    private String barcode;
    private String supplierId;
    private String unit;
    private Integer boxQty;
    private Integer shelfDays;
    private BigDecimal purchasePrice;
    private BigDecimal salePrice;
    private String status;
    private Date createdAt;
    private Date updatedAt;
}
