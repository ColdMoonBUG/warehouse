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
import java.util.Date;
import java.util.List;

@Data
@TableName("wh_return_doc")
public class ReturnDoc implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String code;
    @TableField("salesperson_id")
    private String salespersonId;
    private String storeId;

    @TableField("doc_date")
    @JsonProperty("date")
    @JsonAlias("date")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date docDate;

    private String returnType; // vehicle_return / warehouse_return
    private String fromWarehouseId;
    private String toWarehouseId;

    private String remark;
    private String status;
    private Integer totalQty;
    private java.math.BigDecimal totalAmount;
    private Date createdAt;
    private Date updatedAt;

    @TableField(exist = false)
    private List<ReturnLine> lines;
}
