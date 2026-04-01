package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

@Data
@TableName("wh_inbound_line")
public class InboundLine implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String docId;
    private String productId;

    @TableField("mfg_date")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date mfgDate;

    @TableField("exp_date")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date expDate;

    private Integer boxQty;
    private Integer qty;
    private BigDecimal price;
    private BigDecimal amount;
}
