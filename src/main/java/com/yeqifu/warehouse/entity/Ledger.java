package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.util.Date;

@Data
@TableName("wh_ledger")
public class Ledger implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String bizType;
    private String docId;
    private String warehouseId;
    private String productId;
    private Integer qty;
    private Date createdAt;
}
