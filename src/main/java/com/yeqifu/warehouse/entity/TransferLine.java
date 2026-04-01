package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;

@Data
@TableName("wh_transfer_line")
public class TransferLine implements Serializable {
    @TableId(type = IdType.INPUT)
    private String id;
    private String docId;
    private String productId;
    private Integer boxQty;
    private Integer qty;
}
