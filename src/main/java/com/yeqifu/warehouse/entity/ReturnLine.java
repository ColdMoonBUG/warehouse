package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@TableName("wh_return_line")
public class ReturnLine implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String docId;
    private String productId;
    private Integer boxQty;
    private Integer qty;
    private BigDecimal price;
    private BigDecimal amount;
}
