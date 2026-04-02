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
@TableName("wh_commission_settlement")
public class CommissionSettlement implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    @TableField("salesperson_id")
    private String salespersonId;
    @TableField("settled_by")
    private String settledBy;
    @TableField("sale_amount")
    private BigDecimal saleAmount;
    @TableField("return_amount")
    private BigDecimal returnAmount;
    @TableField("total_amount")
    private BigDecimal totalAmount;
    @TableField("ledger_count")
    private Integer ledgerCount;
    private String remark;
    private Date createdAt;
}
