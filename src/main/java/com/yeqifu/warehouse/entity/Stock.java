package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.util.Date;

@Data
@TableName("wh_stock")
public class Stock implements Serializable {
    private String warehouseId;
    private String productId;
    private Integer qty;
    private Date updatedAt;
}