package com.yeqifu.warehouse.mapper;

import lombok.Data;
import java.io.Serializable;

@Data
public class StockKey implements Serializable {
    private String warehouseId;
    private String productId;
}
