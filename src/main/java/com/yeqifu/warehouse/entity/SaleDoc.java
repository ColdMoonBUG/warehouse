package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

@Data
@TableName("wh_sale_doc")
public class SaleDoc implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String code;
    @TableField("salesperson_id")
    private String salespersonId;
    private String storeId;
    private String warehouseId;

    @TableField("doc_date")
    @JsonProperty("date")
    @JsonAlias("date")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date docDate;

    private String remark;
    private String status;
    private String docType;
    private String returnDocId;
    private Integer settled;
    private Date settledAt;
    private String settledBy;
    private Integer totalQty;
    private BigDecimal totalAmount;
    private Date createdAt;
    private Date updatedAt;

    @TableField(exist = false)
    private List<SaleLine> lines;

    @TableField(exist = false)
    private String storeName;
}
