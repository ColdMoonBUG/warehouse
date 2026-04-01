package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
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
    private String employeeId;
    private String storeId;
    private String productId;
    private Integer qty;
    private BigDecimal price;
    private BigDecimal amount;
    private BigDecimal commissionRate;
    private BigDecimal commissionAmount;
    private Date createdAt;
}
