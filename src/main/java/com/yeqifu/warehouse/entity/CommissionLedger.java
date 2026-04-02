package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

@Data
@TableName("wh_commission_ledger")
public class CommissionLedger implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String bizType;
    private String docId;
    @TableField("salesperson_id")
    private String salespersonId;
    private String storeId;
    private String productId;
    private Integer qty;
    private BigDecimal price;
    private BigDecimal amount;
    private BigDecimal commissionRate;
    private BigDecimal commissionAmount;
    @TableField("settlement_id")
    private String settlementId;
    @TableField("settled_at")
    private Date settledAt;
    private Date createdAt;
}
